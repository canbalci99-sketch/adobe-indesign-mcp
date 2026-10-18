import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../server/registerTool.js';

export class UndoHandler implements IHandler {
  public readonly name = 'undo';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'undo',
        description: 'Undo the last operation',
        inputSchema: {},
        handler: compose(withLogging('undo'), withErrorHandling())(this.undo.bind(this)),
      },
      {
        name: 'redo',
        description: 'Redo the last undone operation',
        inputSchema: {},
        handler: compose(withLogging('redo'), withErrorHandling())(this.redo.bind(this)),
      },
      {
        name: 'undo_history',
        description: 'Get undo/redo state information',
        inputSchema: {},
        handler: compose(withLogging('undo_history'), withErrorHandling())(this.undoHistory.bind(this)),
      },
      {
        name: 'undo_beginGroup',
        description:
          'Begin an undo group. While active, each subsequent script runs as a single undo step, so one Undo reverts a whole tool call (e.g. a multi-step recipe). It cannot merge separate calls into one step — each call is still its own undo entry. Call undo_endGroup() to restore the default.',
        inputSchema: {},
        handler: compose(withLogging('undo_beginGroup'), withErrorHandling())(this.beginUndoGroup.bind(this)),
      },
      {
        name: 'undo_endGroup',
        description: 'End the undo group and restore the default undo behavior',
        inputSchema: {},
        handler: compose(withLogging('undo_endGroup'), withErrorHandling())(this.endUndoGroup.bind(this)),
      },
    ];
  }

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      registerTool(server, tool);
    }
  }

  private async undo(_args: unknown, _extra: any): Promise<ToolResult> {
    // `app.activeDocument.undoable` does not exist in InDesign's DOM — reading it
    // throws "Object does not support the property or method 'undoable'", so this
    // tool always failed. There is also no way to *ask* whether an undo is
    // available (app.undoHistory exposes only length/__proto__), so the only
    // honest check is to attempt it and report what happened.
    const code = `
      try {
        __resolveDocument().undo();
        "undone";
      } catch (e) {
        "nothing to undo: " + (e.message || e);
      }
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async redo(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      try {
        __resolveDocument().redo();
        "redone";
      } catch (e) {
        "nothing to redo: " + (e.message || e);
      }
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async undoHistory(_args: unknown, _extra: any): Promise<ToolResult> {
    // InDesign's scripting DOM does not expose undo/redo depth or availability:
    // `document.undoable`/`redoable` throw, and `app.undoHistory` reflects only
    // `length`/`__proto__`. Report that plainly instead of naming properties that
    // do not exist, so a host does not branch on a field that is always undefined.
    const code = `
      JSON.stringify({
        undoAvailable: null,
        redoAvailable: null,
        note: "InDesign's ExtendScript DOM does not expose undo/redo depth; call undo or redo and read the result."
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async beginUndoGroup(_args: unknown, _extra: any): Promise<ToolResult> {
    this.executor.startUndoGroup();
    return formatResponse({ undoGroupActive: true });
  }

  private async endUndoGroup(_args: unknown, _extra: any): Promise<ToolResult> {
    this.executor.endUndoGroup();
    return formatResponse({ undoGroupActive: false });
  }
}

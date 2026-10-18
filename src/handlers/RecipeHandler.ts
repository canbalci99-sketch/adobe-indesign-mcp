import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import { filePathError } from '../utils/security.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../server/registerTool.js';

/**
 * Recipes: compositions of atomic tools that were previously a chain of
 * separate bridge round-trips.
 *
 * The point is not to rename a chain — an alias with extra surface is an
 * anti-pattern. Each recipe here does something the atomic tools *cannot* do in
 * a single round-trip, because the correct next step depends on state only
 * InDesign can see mid-operation:
 *
 *   - `recipe_flowTextStory` places a text file and then keeps adding and
 *     linking frames while the story still overflows. The number of pages to
 *     touch is unknowable until the file is imported, so a caller would have to
 *     loop: place, read `overflows`, add a frame, link it, check again. That
 *     loop is where the wasted turns live.
 *   - `recipe_exportPreset` validates a named PDF export preset and exports
 *     with it. `export_document`'s `options` are JSON and can never be a real
 *     preset object, so an agent that needs a preset has no atomic route.
 *
 * Both run inside a single undo group (composing the same
 * `startUndoGroup`/`endUndoGroup` mechanism the `undo_beginGroup` /
 * `undo_endGroup` tools expose), so one Undo reverts the whole outcome rather
 * than the last frame.
 */

const documentIndex = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    'Index into the open-document list (see document_getState); defaults to the front document',
  );

const flowTextStorySchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe(
      'Absolute path to the text file to place (.txt, .rtf, .docx, … or a text-only .indd)',
    ),
  pageIndex: z.number().int().min(0).default(0).describe('Page to start the story on (0-based)'),
  documentIndex,
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe(
      'Hard cap on frames created; if reached, the remaining overset text is reported, not thrown',
    ),
  timeout: z.number().int().min(1000).max(300000).optional().describe('Custom timeout in ms'),
});

const exportPresetSchema = z.object({
  presetName: z
    .string()
    .min(1)
    .describe(
      'Name of an existing PDF export preset, e.g. "[Press Quality]" — the error lists the valid names',
    ),
  filePath: z.string().min(1).describe('Absolute path of the PDF to write'),
  documentIndex,
  timeout: z.number().int().min(1000).max(300000).optional().describe('Custom timeout in ms'),
});

export class RecipeHandler implements IHandler {
  public readonly name = 'recipe';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'recipe_flowTextStory',
        description:
          'Place a text file and flow it across as many pages as it needs in one call — creates the frames, links them, adds pages when it runs out, and reports where the story ended and whether it still overflows',
        inputSchema: flowTextStorySchema.shape,
        handler: compose(
          withLogging('recipe_flowTextStory'),
          withErrorHandling(),
        )(this.flowTextStory.bind(this)),
      },
      {
        name: 'recipe_exportPreset',
        description:
          'Export the active document to PDF using a named PDF export preset in one call — validates the preset first and, if it is wrong, fails with the list of valid preset names',
        inputSchema: exportPresetSchema.shape,
        handler: compose(
          withLogging('recipe_exportPreset'),
          withErrorHandling(),
        )(this.exportPreset.bind(this)),
      },
    ];
  }

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      registerTool(server, tool);
    }
  }

  /**
   * Runs `fn` as a single InDesign undo step by composing the executor's undo
   * group — the same mechanism the `undo_beginGroup` / `undo_endGroup` tools
   * expose — rather than re-implementing it inside each recipe's ExtendScript.
   *
   * A pre-existing group (the caller called `undo_beginGroup` themselves) is
   * left in place rather than closed out from under them.
   */
  private async withUndoGroup<T>(fn: () => Promise<T>): Promise<T> {
    const wasActive = this.executor.undoGroupActive;
    this.executor.startUndoGroup();
    try {
      return await fn();
    } finally {
      if (!wasActive) this.executor.endUndoGroup();
    }
  }

  private async flowTextStory(args: unknown): Promise<ToolResult> {
    const params = flowTextStorySchema.parse(args);
    const pathError = filePathError(params.filePath);
    if (pathError) {
      return {
        content: [{ type: 'text', text: `Invalid file path: ${pathError}` }],
        isError: true,
      };
    }

    const code = this.flowTextStoryCode(params);
    const response = await this.withUndoGroup(() => this.executor.execute(code, params.timeout));
    return formatResponse(response.result);
  }

  private flowTextStoryCode(params: z.infer<typeof flowTextStorySchema>): string {
    // Both the story and the frames belong to one undo step, hence the single
    // script: splitting it into "create frame" then "flow until done" would
    // reintroduce exactly the round-trips this exists to remove.
    const docExpr =
      params.documentIndex === undefined
        ? '__resolveDocument()'
        : `app.documents[${params.documentIndex}]`;
    const pathJson = JSON.stringify(params.filePath);

    return `
      var __doc = ${docExpr};
      if (!__doc) throw new Error("No active document");
      var __start = ${params.pageIndex};
      if (__start >= __doc.pages.length) throw new Error("Page index out of range: " + __start);
      var __file = File(${pathJson});
      if (!__file.exists) throw new Error("File not found: " + ${pathJson});

      // Text area of a page: its own bounds inset by that page's margins.
      function __textBounds(__page) {
        var __b = __page.bounds;
        try {
          var __m = __page.marginPreferences;
          return [__b[0] + __m.top, __b[1] + __m.left, __b[2] - __m.bottom, __b[3] - __m.right];
        } catch (__e) {
          return [__b[0], __b[1], __b[2], __b[3]];
        }
      }

      var __max = ${params.maxPages};
      var __pos = __start;
      var __frame = __doc.pages[__pos].textFrames.add();
      __frame.geometricBounds = __textBounds(__doc.pages[__pos]);
      __frame.place(__file);

      var __created = 1;
      var __pagesUsed = [__pos];
      var __pagesAdded = 0;
      while (__frame.overflows && __created < __max) {
        __created++;
        __pos = __pos + 1;
        var __nextPage;
        if (__pos < __doc.pages.length) {
          __nextPage = __doc.pages[__pos];
        } else {
          __nextPage = __doc.pages.add();
          __pagesAdded++;
        }
        var __nextFrame = __nextPage.textFrames.add();
        __nextFrame.geometricBounds = __textBounds(__nextPage);
        __frame.nextTextFrame = __nextFrame;
        __frame = __nextFrame;
        __pagesUsed.push(__pos);
      }

      JSON.stringify({
        framesCreated: __pagesUsed.length,
        pagesUsed: __pagesUsed,
        pagesAdded: __pagesAdded,
        startPage: __start,
        overflows: __frame.overflows,
        storyLength: __frame.parentStory.length
      });
    `;
  }

  private async exportPreset(args: unknown): Promise<ToolResult> {
    const params = exportPresetSchema.parse(args);
    const pathError = filePathError(params.filePath);
    if (pathError) {
      return {
        content: [{ type: 'text', text: `Invalid file path: ${pathError}` }],
        isError: true,
      };
    }

    const code = this.exportPresetCode(params);
    const response = await this.withUndoGroup(() => this.executor.execute(code, params.timeout));
    return formatResponse(response.result);
  }

  private exportPresetCode(params: z.infer<typeof exportPresetSchema>): string {
    const docExpr =
      params.documentIndex === undefined
        ? '__resolveDocument()'
        : `app.documents[${params.documentIndex}]`;
    const presetJson = JSON.stringify(params.presetName);
    const pathJson = JSON.stringify(params.filePath);

    return `
      var __doc = ${docExpr};
      if (!__doc) throw new Error("No active document");
      var __preset = app.pdfExportPresets.itemByName(${presetJson});
      if (!__preset || !__preset.isValid) {
        var __names = [];
        for (var __i = 0; __i < app.pdfExportPresets.length; __i++) {
          __names.push(app.pdfExportPresets[__i].name);
        }
        throw new Error("PDF export preset not found: " + ${presetJson} + ". Available: " + __names.join(", "));
      }
      __doc.exportFile(ExportFormat.PDF_TYPE, File(${pathJson}), false, __preset);
      JSON.stringify({ exportedTo: ${pathJson}, preset: ${presetJson}, pages: __doc.pages.length });
    `;
  }
}

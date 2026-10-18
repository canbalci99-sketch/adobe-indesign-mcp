/**
 * `registerTool` is the one place the shared `document_id` parameter and the
 * per-call target binding are wired in. Two things have to hold:
 *
 *  1. every tool advertises `document_id` (the SDK strips unknown keys, so a
 *     parameter absent from the schema never reaches the handler), and
 *  2. the value is bound while the handler runs, so the code the handler sends
 *     to InDesign carries the target.
 *
 * The second is proven end to end through the real ScriptExecutor — the target
 * shows up in the script that would actually reach InDesign, not in a mock.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../../src/types/index.js';
import { registerTool, documentIdSchema } from '../../src/server/registerTool.js';
import { getDocumentTarget } from '../../src/bridge/documentTarget.js';
import { ScriptExecutor } from '../../src/bridge/ScriptExecutor.js';
import { DocumentHandler } from '../../src/handlers/DocumentHandler.js';

interface CapturedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  callback: (args: unknown, extra: unknown) => Promise<unknown>;
}

function fakeServer(): { server: McpServer; captured: CapturedTool[] } {
  const captured: CapturedTool[] = [];
  const server = {
    tool: (
      name: string,
      description: string,
      inputSchema: Record<string, unknown>,
      callback: (args: unknown, extra: unknown) => Promise<unknown>,
    ) => {
      captured.push({ name, description, inputSchema, callback });
    },
  } as unknown as McpServer;
  return { server, captured };
}

describe('documentIdSchema', () => {
  it('accepts a name or a non-negative integer', () => {
    expect(documentIdSchema.safeParse('book.indd').success).toBe(true);
    expect(documentIdSchema.safeParse(0).success).toBe(true);
    expect(documentIdSchema.safeParse(4).success).toBe(true);
  });

  it('rejects a hostile or malformed value', () => {
    expect(documentIdSchema.safeParse(-1).success).toBe(false);
    expect(documentIdSchema.safeParse(1.5).success).toBe(false);
    expect(documentIdSchema.safeParse('').success).toBe(false);
    expect(documentIdSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(documentIdSchema.safeParse(['x']).success).toBe(false);
  });
});

describe('registerTool', () => {
  it('advertises document_id alongside the tool’s own parameters', () => {
    const { server, captured } = fakeServer();
    const tool: ToolDefinition = {
      name: 'demo_tool',
      description: 'demo',
      inputSchema: { pageIndex: z.number() },
      handler: async () => ({ content: [] }),
    };

    registerTool(server, tool);

    expect(captured).toHaveLength(1);
    expect(captured[0].name).toBe('demo_tool');
    expect(captured[0].inputSchema).toHaveProperty('document_id');
    expect(captured[0].inputSchema).toHaveProperty('pageIndex');
  });

  it('binds document_id for the call and clears it afterwards', async () => {
    const { server, captured } = fakeServer();
    const seen: unknown[] = [];
    const tool: ToolDefinition = {
      name: 'demo_tool',
      description: 'demo',
      inputSchema: {},
      handler: async () => {
        seen.push(getDocumentTarget());
        return { content: [] };
      },
    };

    registerTool(server, tool);
    await captured[0].callback({ document_id: 'B.indd' }, {});
    expect(seen[0]).toBe('B.indd');
    expect(getDocumentTarget()).toBeNull();
  });

  it('binds no target when document_id is absent', async () => {
    const { server, captured } = fakeServer();
    const seen: unknown[] = [];
    const tool: ToolDefinition = {
      name: 'demo_tool',
      description: 'demo',
      inputSchema: {},
      handler: async () => {
        seen.push(getDocumentTarget());
        return { content: [] };
      },
    };

    registerTool(server, tool);
    await captured[0].callback({}, {});
    expect(seen[0]).toBeNull();
  });

  it('carries document_id all the way into the script sent to InDesign', async () => {
    const executor = new ScriptExecutor(10000);
    const codes: string[] = [];
    executor.on('request', (req: { id: string; code: string }) => {
      codes.push(req.code);
      executor.handleResponse({ id: req.id, type: 'result', result: '{}' });
    });

    const handler = new DocumentHandler(executor);
    const tool = handler.tools.find((t) => t.name === 'document_getState')!;
    const { server, captured } = fakeServer();
    registerTool(server, tool);

    await captured[0].callback({ document_id: 'B.indd' }, {});

    expect(codes).toHaveLength(1);
    // The target literal is injected by the wrapper, and the script resolves
    // its document through the shared resolver rather than the front tab.
    expect(codes[0]).toContain('var __TARGET_DOCUMENT_ID = "B.indd";');
    expect(codes[0]).toContain('__resolveDocument()');
  });

  it('injects a numeric target as a bare index', async () => {
    const executor = new ScriptExecutor(10000);
    const codes: string[] = [];
    executor.on('request', (req: { id: string; code: string }) => {
      codes.push(req.code);
      executor.handleResponse({ id: req.id, type: 'result', result: '{}' });
    });

    const handler = new DocumentHandler(executor);
    const tool = handler.tools.find((t) => t.name === 'document_listOpen')!;
    const { server, captured } = fakeServer();
    registerTool(server, tool);

    await captured[0].callback({ document_id: 1 }, {});

    expect(codes[0]).toContain('var __TARGET_DOCUMENT_ID = 1;');
  });

  it('injects no target when the caller passes none', async () => {
    const executor = new ScriptExecutor(10000);
    const codes: string[] = [];
    executor.on('request', (req: { id: string; code: string }) => {
      codes.push(req.code);
      executor.handleResponse({ id: req.id, type: 'result', result: '{}' });
    });

    const handler = new DocumentHandler(executor);
    const tool = handler.tools.find((t) => t.name === 'document_listOpen')!;
    const { server, captured } = fakeServer();
    registerTool(server, tool);

    await captured[0].callback({}, {});

    expect(codes[0]).toContain('var __TARGET_DOCUMENT_ID = null;');
  });

  it('does not leak the target into a later call', async () => {
    const executor = new ScriptExecutor(10000);
    const codes: string[] = [];
    executor.on('request', (req: { id: string; code: string }) => {
      codes.push(req.code);
      executor.handleResponse({ id: req.id, type: 'result', result: '{}' });
    });

    const handler = new DocumentHandler(executor);
    const tool = handler.tools.find((t) => t.name === 'document_listOpen')!;
    const { server, captured } = fakeServer();
    registerTool(server, tool);

    await captured[0].callback({ document_id: 'B.indd' }, {});
    await captured[0].callback({}, {});

    expect(codes[0]).toContain('var __TARGET_DOCUMENT_ID = "B.indd";');
    expect(codes[1]).toContain('var __TARGET_DOCUMENT_ID = null;');
  });
});

describe('registerTool across the real registry', () => {
  it('registers every tool with document_id', async () => {
    const { loadHandlers } = await import('../helpers/loadHandlers.js');
    const handlers = await loadHandlers();
    const { server, captured } = fakeServer();

    for (const h of handlers) {
      for (const tool of h.tools) registerTool(server, tool);
    }

    const names = captured.map((c) => c.name);
    expect(names.length).toBeGreaterThan(190);
    expect(new Set(names).size).toBe(names.length); // no duplicate tool names
    for (const c of captured) {
      expect(c.inputSchema, `${c.name} is missing document_id`).toHaveProperty('document_id');
    }
  });
});

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/index.js';
import { normalizeDocumentTarget, withDocumentTarget } from '../bridge/documentTarget.js';

/**
 * The one parameter every tool accepts in addition to its own schema:
 * `document_id`, the open document the call targets — a name (as
 * `document_listOpen` reports it) or a 0-based index into `app.documents`.
 *
 * It is declared here, once, instead of on 197 individual schemas so the
 * contract cannot drift tool by tool. Tools that do not act on a document
 * simply ignore it; the alternative — classifying every tool as mutating or
 * not, by hand, with no metadata to drive it — is the kind of half-measure
 * that goes stale the first time a tool is added.
 *
 * The target is bound for the duration of the call and reaches InDesign as
 * `__TARGET_DOCUMENT_ID`; scripts resolve their document through
 * `__resolveDocument()`. With no `document_id`, calls target the front
 * document, exactly as every release before this one behaved.
 */
export const documentIdSchema = z
  .union([z.string().min(1), z.number().int().min(0)])
  .optional()
  .describe(
    'Which open document to act on: a name (see document_listOpen) or a 0-based index. ' +
      'Defaults to the front document.',
  );

/**
 * Registers one tool on the server, adding the shared `document_id` parameter
 * and binding it for the call. Use this instead of `server.tool` directly so
 * every tool picks up both.
 */
export function registerTool(server: McpServer, tool: ToolDefinition): void {
  const inputSchema = { ...tool.inputSchema, document_id: documentIdSchema };
  const handler = (args: Record<string, unknown> | undefined, extra: unknown) =>
    withDocumentTarget(normalizeDocumentTarget(args?.document_id), () =>
      tool.handler(args, extra),
    );
  server.tool(tool.name, tool.description, inputSchema, handler);
}

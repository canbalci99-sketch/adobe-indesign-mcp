/**
 * The initialize-time contract.
 *
 * Instructions are paid on every session, so two things must hold: they are
 * small enough to be worth that price, and every tool they name actually
 * exists. A contract that tells the host to call a tool the server does not
 * expose is worse than no contract — it sends the model into a second failure.
 */
import { describe, it, expect } from 'vitest';
import { INDESIGN_MCP_INSTRUCTIONS } from '../../src/prompts/instructions.js';
import { loadToolNames } from '../helpers/loadHandlers.js';

/** Rough token estimate: ~4 characters per token for English prose. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * snake_case tokens in the text that are not tool names. Everything else that
 * looks like a tool must resolve in the registry.
 */
const NON_TOOL_TOKENS = new Set([
  'suggested_next_tool',
  'script_blocked_by_policy',
  'bridge_not_connected',
  'invalid_reference',
  'execution_timeout',
  'missing_font',
  'link_missing',
]);

describe('INDESIGN_MCP_INSTRUCTIONS', () => {
  it('is not empty', () => {
    expect(INDESIGN_MCP_INSTRUCTIONS.trim().length).toBeGreaterThan(200);
  });

  it('stays within a sane token budget', () => {
    // Advertised on every initialize, so it is a recurring cost. 1300 tokens is
    // already generous for a contract; failing here forces a deliberate review
    // rather than letting it grow by accretion.
    expect(estimateTokens(INDESIGN_MCP_INSTRUCTIONS)).toBeLessThan(1300);
  });

  it('names only tools that exist', async () => {
    const registered = new Set(await loadToolNames());
    const tokens = INDESIGN_MCP_INSTRUCTIONS.match(/\b[a-z][a-zA-Z]*_[a-zA-Z_]+\b/g) ?? [];
    const dangling = [...new Set(tokens)].filter(
      (t) => !registered.has(t) && !NON_TOOL_TOKENS.has(t),
    );
    expect(
      dangling,
      `The contract names tools that are not registered: ${dangling.join(', ')}. ` +
        'Either the tool was renamed/removed, or the contract has a typo.',
    ).toEqual([]);
  });

  it('calls out the document_close save dialog, which wedges InDesign', () => {
    expect(INDESIGN_MCP_INSTRUCTIONS).toMatch(/document_close/);
    expect(INDESIGN_MCP_INSTRUCTIONS).toMatch(/saveOptions/);
    expect(INDESIGN_MCP_INSTRUCTIONS).toMatch(/"ask"/);
  });

  it('warns against raw-script workarounds and names the blocking code', () => {
    expect(INDESIGN_MCP_INSTRUCTIONS).toMatch(/suggested_next_tool/);
    expect(INDESIGN_MCP_INSTRUCTIONS).toMatch(/script_blocked_by_policy/);
  });
});

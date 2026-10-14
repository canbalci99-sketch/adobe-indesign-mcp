/**
 * Error envelope.
 *
 * A failure that reaches the agent as prose leaves it guessing whether the
 * document is missing, the reference is stale, or the bridge is down. These
 * tests pin the classification table and — more importantly — that the two
 * seams which actually carry failures to the host both emit an envelope.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyError,
  suggestedToolFor,
  suggestedTools,
  toErrorEnvelope,
  type InDesignErrorCode,
} from '../../src/errors/envelope.js';
import { withErrorHandling, compose } from '../../src/utils/middleware.js';
import { InDesignError, formatResponse } from '../../src/utils/errorHandler.js';

/**
 * Every code in the union, with a message (or transport code) that must produce
 * it. If a code is added to the union without a fixture, the completeness test
 * below fails — a code no input can reach is dead weight in the contract.
 */
const FIXTURES: Record<InDesignErrorCode, { message?: string; code?: string }> = {
  bridge_not_connected: { message: 'Bridge is not connected' },
  bridge_error: { message: 'Unknown bridge error', code: 'BRIDGE_ERROR' },
  execution_timeout: { message: 'Script execution timed out', code: 'EXECUTION_TIMEOUT' },
  execution_cancelled: { message: 'Execution cancelled', code: 'CANCELLED' },
  script_blocked_by_policy: {
    message:
      'Uncaught JavaScript exception: Blocked by the InDesign MCP security policy: eval is not available in ExtendScript.',
  },
  extendscript_runtime_error: { message: 'whatever', code: 'EXTENDSCRIPT_RUNTIME_ERROR' },
  document_not_found: { message: 'Document not found' },
  no_active_document: { message: 'No documents are open' },
  page_not_found: { message: 'Page not found' },
  invalid_reference: { message: 'Object is invalid' },
  invalid_arguments: { message: 'Invalid file path' },
  file_not_found: { message: 'File not found' },
  missing_font: { message: 'Missing font: Helvetica' },
  link_missing: { message: 'Link is missing' },
  output_too_large: {
    message: 'preview is 5000000 bytes at 72 ppi, over the 4000000-byte cap the bridge can return',
    code: 'OUTPUT_TOO_LARGE',
  },
  unknown: { message: 'something completely unrelated' },
};

describe('classifyError', () => {
  it('classifies every code in the union', () => {
    const unreachable: string[] = [];
    for (const [code, fixture] of Object.entries(FIXTURES)) {
      const actual = classifyError(fixture.message ?? '', fixture.code);
      if (actual !== code) unreachable.push(`${code} <- classified as ${actual}`);
    }
    expect(unreachable, 'Codes no fixture can reach').toEqual([]);
  });

  it('has a fixture for every code (no code left behind)', () => {
    const declared: InDesignErrorCode[] = [
      'bridge_not_connected',
      'bridge_error',
      'execution_timeout',
      'execution_cancelled',
      'script_blocked_by_policy',
      'extendscript_runtime_error',
      'document_not_found',
      'no_active_document',
      'page_not_found',
      'invalid_reference',
      'invalid_arguments',
      'file_not_found',
      'missing_font',
      'link_missing',
      'output_too_large',
      'unknown',
    ];
    expect(Object.keys(FIXTURES).sort()).toEqual([...declared].sort());
  });

  it('lets a transport code beat the message text', () => {
    // "timed out" would match the timeout rule anyway; BRIDGE_ERROR must win,
    // because the bridge knows more about its own failure than a regex does.
    expect(classifyError('Script execution timed out', 'BRIDGE_ERROR')).toBe('bridge_error');
  });

  it('falls back to unknown rather than guessing', () => {
    expect(classifyError('kaboom')).toBe('unknown');
  });
});

describe('suggestedToolFor', () => {
  it('points at a reorientation tool for a stale reference', () => {
    expect(suggestedToolFor('Object is invalid')).toBe('document_getInfo');
  });

  it('points at the liveness probe for a timeout', () => {
    expect(suggestedToolFor('Script execution timed out', 'EXECUTION_TIMEOUT')).toBe(
      'document_listOpen',
    );
  });

  it('offers no suggestion when there is no remedy', () => {
    expect(suggestedToolFor('Blocked by the InDesign MCP security policy: eval')).toBeUndefined();
    expect(suggestedToolFor('kaboom')).toBeUndefined();
  });

  it('exposes every tool it may reference', () => {
    expect(suggestedTools()).toEqual([
      'document_getInfo',
      'document_listOpen',
      'font_missing_check',
      'image_getLinks',
      'preview_document',
    ]);
  });
});

describe('toErrorEnvelope', () => {
  it('preserves the original message verbatim', () => {
    const envelope = toErrorEnvelope({ message: 'Object is invalid' });
    expect(envelope.ok).toBe(false);
    expect(envelope.message).toBe('Object is invalid');
    expect(envelope.code).toBe('invalid_reference');
    expect(envelope.suggested_next_tool).toBe('document_getInfo');
  });

  it('carries ExtendScript source detail', () => {
    const envelope = toErrorEnvelope({
      message: 'Expected: ;',
      code: 'EXTENDSCRIPT_RUNTIME_ERROR',
      line: 12,
      file: '/tmp/script.jsx',
      stack: 'at foo',
    });
    expect(envelope).toMatchObject({
      ok: false,
      code: 'extendscript_runtime_error',
      line: 12,
      file: '/tmp/script.jsx',
      stack: 'at foo',
    });
  });

  it('is JSON-serialisable, since the content is JSON text', () => {
    const envelope = toErrorEnvelope({ message: 'Object is invalid' });
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
  });

  it('carries the remedy arguments when the rule provides them', () => {
    const envelope = toErrorEnvelope({
      message: 'output too large',
      code: 'OUTPUT_TOO_LARGE',
    });
    expect(envelope.code).toBe('output_too_large');
    expect(envelope.suggested_next_tool).toBe('preview_document');
    expect(envelope.suggested_args).toEqual({ resolutionPpi: 96 });
  });
});

describe('withErrorHandling seam', () => {
  const run = async (thrower: () => never) => {
    const handler = compose(withErrorHandling())(async () => thrower());
    return handler({} as never, {} as never);
  };

  it('still marks the result as an error', async () => {
    const result = await run(() => {
      throw new Error('Object is invalid');
    });
    expect(result.isError).toBe(true);
  });

  it('returns a parseable envelope in the text content', async () => {
    const result = await run(() => {
      throw new Error('Object is invalid');
    });
    const envelope = JSON.parse(result.content[0].text as string);
    expect(envelope.code).toBe('invalid_reference');
    expect(envelope.suggested_next_tool).toBe('document_getInfo');
  });

  it('reads the transport code off an InDesignError', async () => {
    const result = await run(() => {
      throw new InDesignError('Script execution timed out', 'EXECUTION_TIMEOUT');
    });
    const envelope = JSON.parse(result.content[0].text as string);
    expect(envelope.code).toBe('execution_timeout');
    expect(envelope.suggested_next_tool).toBe('document_listOpen');
  });

  it('keeps the failing message visible to callers that read the text', async () => {
    // PreviewHandler.test.ts asserts this via toContain on the stringified
    // content; the message has to stay inside the envelope.
    const result = await run(() => {
      throw new Error('preview failed');
    });
    expect(JSON.stringify(result.content)).toContain('preview failed');
  });
});

describe('formatResponse ExtendScript seam', () => {
  it('turns a runtime error payload into an envelope', () => {
    const result = formatResponse({
      __extendscript_error: true,
      message: 'Expected: ;',
      line: 42,
      fileName: '/tmp/script.jsx',
      stack: 'at line 42',
    });
    expect(result.isError).toBe(true);
    const envelope = JSON.parse(result.content[0].text as string);
    expect(envelope).toMatchObject({
      ok: false,
      code: 'extendscript_runtime_error',
      line: 42,
      file: '/tmp/script.jsx',
      stack: 'at line 42',
      suggested_next_tool: 'document_getInfo',
    });
  });

  it('leaves successful data untouched', () => {
    const result = formatResponse({ status: 'ok' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('{"status":"ok"}');
  });
});

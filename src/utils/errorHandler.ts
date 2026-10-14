import type { ToolResult } from '../types/index.js';
import { toErrorEnvelope, isSuccessEnvelopeEnabled, wrapSuccess } from '../errors/envelope.js';

export class InDesignError extends Error {
  public readonly code: string;
  public readonly originalError?: unknown;

  constructor(message: string, code: string = 'INDESIGN_ERROR', originalError?: unknown) {
    super(message);
    this.name = 'InDesignError';
    this.code = code;
    this.originalError = originalError;
  }
}

function parseResult(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function isExtendScriptError(obj: unknown): obj is { __extendscript_error: true; message: string; line: number; fileName?: string; stack?: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as Record<string, unknown>).__extendscript_error === true
  );
}

export function formatResponse(data: unknown): ToolResult {
  const parsed = parseResult(data);

  if (isExtendScriptError(parsed)) {
    const envelope = toErrorEnvelope({
      message: parsed.message,
      code: 'EXTENDSCRIPT_RUNTIME_ERROR',
      line: parsed.line,
      file: parsed.fileName,
      stack: parsed.stack,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(envelope) }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          isSuccessEnvelopeEnabled() ? wrapSuccess(parsed ?? 'ok') : (parsed ?? 'ok'),
        ),
      },
    ],
  };
}

export function formatErrorResponse(error: Error | string): ToolResult {
  const message = error instanceof Error ? error.message : error;
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

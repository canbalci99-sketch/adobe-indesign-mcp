import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Which open document a tool call is meant to act on.
 *
 * The value is a document name (as `document_listOpen` reports it) or a
 * 0-based index into `app.documents`. It travels to InDesign as the injected
 * `__TARGET_DOCUMENT_ID` global, which `__resolveDocument()` reads, so every
 * script a call goes on to run lands on the same document.
 *
 * This lives in AsyncLocalStorage rather than as a field on the executor on
 * purpose: a handler can await between entering and calling `execute()`, and a
 * plain field would let a concurrent request overwrite the target in that
 * window — precisely the cross-talk this feature exists to remove.
 */
export type DocumentTarget = string | number | null;

const storage = new AsyncLocalStorage<DocumentTarget>();

/**
 * Coerces raw tool input into a target. Anything that is not a non-negative
 * integer or a non-empty string is "no target" (the front document), so a
 * malformed value degrades to the old behaviour instead of erroring.
 */
export function normalizeDocumentTarget(value: unknown): DocumentTarget {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

/** Runs `fn` with `target` bound to every script executed inside it. */
export function withDocumentTarget<T>(target: DocumentTarget, fn: () => T): T {
  return storage.run(target, fn);
}

/** The target bound to the current call, or null for the front document. */
export function getDocumentTarget(): DocumentTarget {
  return storage.getStore() ?? null;
}

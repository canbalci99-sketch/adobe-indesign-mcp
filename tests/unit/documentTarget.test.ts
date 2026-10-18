/**
 * The per-call document target.
 *
 * A tool call may await between entering its handler and calling execute(), so
 * the target is carried in AsyncLocalStorage rather than on the executor: a
 * plain field would let a concurrent call overwrite it in that window. These
 * tests pin the two behaviours that matter — normalisation, and that the
 * binding does not leak past the call.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeDocumentTarget,
  withDocumentTarget,
  getDocumentTarget,
} from '../../src/bridge/documentTarget.js';

describe('normalizeDocumentTarget', () => {
  it('keeps a non-negative integer index', () => {
    expect(normalizeDocumentTarget(0)).toBe(0);
    expect(normalizeDocumentTarget(3)).toBe(3);
  });

  it('keeps a non-empty name, trimmed', () => {
    expect(normalizeDocumentTarget('book.indd')).toBe('book.indd');
    expect(normalizeDocumentTarget('  book.indd  ')).toBe('book.indd');
  });

  it('treats everything else as no target', () => {
    // Degrading to the front document beats erroring on a malformed value.
    for (const value of [undefined, null, '', '   ', -1, 1.5, NaN, Infinity, true, {}, []]) {
      expect(normalizeDocumentTarget(value)).toBeNull();
    }
  });
});

describe('withDocumentTarget', () => {
  it('defaults to no target outside a call', () => {
    expect(getDocumentTarget()).toBeNull();
  });

  it('binds the target for the duration of the call', () => {
    const seen = withDocumentTarget('B.indd', () => getDocumentTarget());
    expect(seen).toBe('B.indd');
  });

  it('binds an index target', () => {
    expect(withDocumentTarget(2, () => getDocumentTarget())).toBe(2);
  });

  it('does not leak the target past the call', () => {
    withDocumentTarget('B.indd', () => {});
    expect(getDocumentTarget()).toBeNull();
  });

  it('restores the outer target after a nested call', () => {
    const seen = withDocumentTarget('outer.indd', () => {
      withDocumentTarget('inner.indd', () => {});
      return getDocumentTarget();
    });
    expect(seen).toBe('outer.indd');
  });

  it('keeps concurrent calls on their own targets', async () => {
    // The failure the storage exists to prevent: call A awaits before touching
    // the target, call B sets its own, and A must still see its own.
    const run = (name: string) =>
      withDocumentTarget(name, async () => {
        await new Promise((r) => setTimeout(r, 1));
        await new Promise((r) => setTimeout(r, 1));
        return getDocumentTarget();
      });

    const [a, b] = await Promise.all([run('A.indd'), run('B.indd')]);
    expect(a).toBe('A.indd');
    expect(b).toBe('B.indd');
  });

  it('returns the callback value', () => {
    expect(withDocumentTarget(null, () => 42)).toBe(42);
  });
});

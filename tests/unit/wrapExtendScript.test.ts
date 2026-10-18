/**
 * The wrapped script is what actually reaches InDesign: the trusted bundle
 * (JSON polyfill + helpers + security stubs) followed by the sanitised user
 * code. Two regressions have shipped from this seam and both were invisible to
 * type-checking:
 *
 *  1. Sanitising the *whole* bundle mangled the polyfill's JSON.parse fallback,
 *     so every script failed with "Expected: ;".
 *  2. Substituting a bare comment for a blocked callee left an unbalanced
 *     parenthesis, so every script containing eval/Function/require died with
 *     the same cryptic error instead of naming what was blocked.
 *
 * These tests evaluate the real output, not a mock of it.
 */
import { describe, it, expect } from 'vitest';
import { wrapExtendScript } from '../../src/bridge/wrapExtendScript.js';

describe('wrapExtendScript', () => {
  it('defines the __blocked stub that sanitizeCode targets', () => {
    const script = wrapExtendScript('app.documents.length;');
    expect(script).toContain('function __blocked(');
  });

  it('leaves the trusted bundle intact', () => {
    // The polyfill must survive verbatim. Sanitising it is what broke every
    // script once: its JSON.parse fallback tripped the filter.
    const script = wrapExtendScript('app.documents.length;');
    expect(script).toContain('JSON');
    expect(script).not.toContain('/* blocked */');
  });

  it('neutralises a blocked call and still produces a parseable script', () => {
    const script = wrapExtendScript('var x = eval(body);');
    expect(script).toContain('__blocked("eval", body)');
    expect(() => new Function(script)).not.toThrow();
  });

  it('neutralises a blocked call when the code is wrapped for debugging', () => {
    const script = wrapExtendScript('require("fs")', { debug: true });
    expect(script).toContain('__blocked("require", "fs")');
    expect(() => new Function(script)).not.toThrow();
  });

  it('keeps surrounding code intact around a blocked call', () => {
    const script = wrapExtendScript('app.documents.add(); eval(x); app.documents.length;');
    expect(script).toContain('app.documents.add();');
    expect(script).toContain('app.documents.length;');
    expect(() => new Function(script)).not.toThrow();
  });

  it('produces a stub that throws a named error when invoked', () => {
    // Build the bundle with the stubbed call as the whole body, then run it.
    // Nothing here touches InDesign: __blocked throws before any DOM access.
    const script = wrapExtendScript('__blocked("eval", 1);', {});
    const body = script.slice(script.lastIndexOf('function __blocked('));
    expect(() => new Function(body)()).toThrow(/Blocked by the InDesign MCP security policy: eval/);
  });

  describe('undoGroupActive', () => {
    // The old wrapper set `app.scriptPreferences.undoMode`, a property InDesign
    // does not have. It threw for *every* script while a group was open, and its
    // trailing assignment would have replaced the script result anyway. These
    // tests pin the shape that actually runs: a nested app.doScript with
    // UndoModes.ENTIRE_SCRIPT as the last statement.
    it('groups the body with app.doScript and ENTIRE_SCRIPT', () => {
      const script = wrapExtendScript('app.documents.length;', { undoGroupActive: true });
      expect(script).toContain('app.doScript(');
      expect(script).toContain('ScriptLanguage.JAVASCRIPT');
      expect(script).toContain('UndoModes.ENTIRE_SCRIPT');
      expect(script).not.toContain('undoMode');
    });

    it('does not touch scriptPreferences.undoMode', () => {
      const script = wrapExtendScript('app.documents.length;', { undoGroupActive: true });
      expect(script).not.toContain('scriptPreferences.undoMode');
    });

    it('embeds the body as the final statement so its result survives', () => {
      const script = wrapExtendScript('JSON.stringify({ a: 1 });', { undoGroupActive: true });
      const trimmed = script.trimEnd();
      expect(trimmed.endsWith('UndoModes.ENTIRE_SCRIPT);')).toBe(true);
    });

    it('sanitises the body before embedding it', () => {
      const script = wrapExtendScript('var x = eval(body);', { undoGroupActive: true });
      // The sanitiser runs first, so the neutralised token is inside the string
      // literal (quotes escaped by JSON encoding).
      expect(script).toContain('__blocked(\\"eval\\", body)');
      expect(() => new Function(script)).not.toThrow();
    });

    it('still parses when both debug and grouping are on', () => {
      const script = wrapExtendScript('require("fs")', { debug: true, undoGroupActive: true });
      expect(() => new Function(script)).not.toThrow();
      expect(script).toContain('__extendscript_error');
    });

    it('leaves the body unwrapped when no group is active', () => {
      const script = wrapExtendScript('app.documents.length;');
      expect(script).not.toContain('app.doScript(');
    });
  });

  describe('document target', () => {
    interface FakeDoc {
      name: string;
    }
    interface FakeApp {
      documents: FakeDoc[];
      activeDocument: FakeDoc | null;
    }

    /**
     * Runs the real generated bundle against a fake `app` and returns what
     * `__resolveDocument()` yields — no mock of the resolver itself, so this
     * exercises the same code InDesign would.
     */
    function resolve(app: FakeApp, options: { targetDocument?: string | number | null } = {}) {
      const bundle = wrapExtendScript('', options);
      const fn = new Function('app', `${bundle}\nreturn __resolveDocument();`) as (
        app: FakeApp,
      ) => FakeDoc | null;
      return fn(app);
    }

    const app = (): FakeApp => ({
      documents: [{ name: 'A.indd' }, { name: 'B.indd' }],
      activeDocument: { name: 'A.indd' },
    });

    it('injects a null target by default', () => {
      expect(wrapExtendScript('app.documents.length;')).toContain(
        'var __TARGET_DOCUMENT_ID = null;',
      );
    });

    it('injects a string target as a JSON literal', () => {
      expect(wrapExtendScript('x;', { targetDocument: 'B.indd' })).toContain(
        'var __TARGET_DOCUMENT_ID = "B.indd";',
      );
    });

    it('injects a numeric target as a bare index', () => {
      expect(wrapExtendScript('x;', { targetDocument: 1 })).toContain(
        'var __TARGET_DOCUMENT_ID = 1;',
      );
    });

    it('resolves the front document when no target is set', () => {
      const fake = app();
      expect(resolve(fake)).toBe(fake.activeDocument);
    });

    it('resolves a document by name', () => {
      const fake = app();
      expect(resolve(fake, { targetDocument: 'B.indd' })).toBe(fake.documents[1]);
    });

    it('resolves a document by index', () => {
      const fake = app();
      expect(resolve(fake, { targetDocument: 0 })).toBe(fake.documents[0]);
    });

    it('throws, naming the open documents, when the target is not open', () => {
      expect(() => resolve(app(), { targetDocument: 'Gone.indd' })).toThrow(
        /document_id 'Gone\.indd' is not open\. Open documents: A\.indd, B\.indd/,
      );
    });

    it('throws on an out-of-range index', () => {
      expect(() => resolve(app(), { targetDocument: 5 })).toThrow(/is not open/);
    });

    it('reports no open documents when there are none', () => {
      expect(() =>
        resolve({ documents: [], activeDocument: null }, { targetDocument: 'X.indd' }),
      ).toThrow(/Open documents: \(none\)/);
    });

    it('treats a hostile target as a plain name, never as code', () => {
      // A document_id is embedded as a JSON string literal and then matched by
      // name. There is no path by which it becomes executable: a payload that
      // would run from an unescaped literal must leave no trace.
      const probe = '__indesign_target_injection_probe__';
      const hostile = `'; globalThis.${probe} = true; //`;
      expect(() => resolve(app(), { targetDocument: hostile })).toThrow(/is not open/);
      expect((globalThis as Record<string, unknown>)[probe]).toBeUndefined();
    });

    it('escapes a target containing quotes and newlines', () => {
      const weird = 'a"b\nc.indd';
      const script = wrapExtendScript('x;', { targetDocument: weird });
      expect(() => new Function(script)).not.toThrow();
      expect(() => resolve(app(), { targetDocument: weird })).toThrow(/is not open/);
    });
  });
});

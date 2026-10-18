import { JSON_POLYFILL } from './jsonPolyfill.js';
import { getExtendScriptHelpers } from './extendScriptHelpers.js';
import { sanitizeCode } from '../utils/stringUtils.js';

export interface WrapOptions {
  debug?: boolean;
  undoGroupActive?: boolean;
  /**
   * Document the script should act on: a name or a 0-based index. Injected as
   * the `__TARGET_DOCUMENT_ID` global that `__resolveDocument()` reads. Null or
   * omitted means the front document.
   */
  targetDocument?: string | number | null;
}

/**
 * Target of every neutralised call in sanitizeCode(). Lives in the trusted
 * bundle, which is never sanitised, so it is always defined by the time the
 * injected user code runs. Throwing here — rather than letting the call through
 * — is what turns a blocked construct into a named error the caller can read.
 */
const SECURITY_STUBS = `
function __blocked(name) {
  throw new Error("Blocked by the InDesign MCP security policy: " + name + " is not available in ExtendScript.");
}
`;

/**
 * Encodes a script body as a JavaScript string literal that even an old
 * ExtendScript engine will parse. `JSON.stringify` escapes quotes and
 * backslashes but leaves U+2028/U+2029 raw, which are line terminators in
 * pre-ES2019 engines and would break the literal.
 */
function asStringLiteral(code: string): string {
  return JSON.stringify(code).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * Shared ExtendScript wrapping used by every executor backend (the macOS
 * bridge/JXA path and Windows COM). Produces the full script string: JSON
 * polyfill + DOM shims + the (sanitised) user code, optionally grouped into a
 * single undo step.
 *
 * Only the user's code is sanitised; the bundle below it is trusted and must
 * survive intact — running the filter over the polyfill once mangled its
 * JSON.parse fallback and broke every script execution.
 *
 * `undoGroupActive` makes the whole script **one** undo step. The previous
 * attempt set `app.scriptPreferences.undoMode`, a property InDesign does not
 * have: it throws "Object does not support the property or method 'undoMode'",
 * so every script failed while a group was open — and even if the property
 * existed, the trailing assignment would have replaced the script's result.
 * The supported mechanism is the fourth argument of `app.doScript`; the body is
 * passed as a *string* so `doScript` returns the program's completion value,
 * and it must be the final statement so nothing overwrites that value.
 */
export function wrapExtendScript(code: string, options: WrapOptions = {}): string {
  const helpers = getExtendScriptHelpers();

  // The target document is bound by a plain global so `__resolveDocument()`,
  // defined in the helpers above, can read it. It is part of the trusted bundle
  // (never sanitised) but its value is always a literal we produce here: a
  // string literal via asStringLiteral, or a validated integer.
  const targetLiteral =
    typeof options.targetDocument === 'number'
      ? String(options.targetDocument)
      : typeof options.targetDocument === 'string'
        ? asStringLiteral(options.targetDocument)
        : 'null';

  const polyfilled = `${JSON_POLYFILL}\n${helpers}\nvar __TARGET_DOCUMENT_ID = ${targetLiteral};\n${SECURITY_STUBS}`;

  let wrapped = code;

  if (options.debug) {
    wrapped = `
try {
  ${code}
} catch(e) {
  JSON.stringify({ __extendscript_error: true, message: e.message, line: e.line, fileName: e.fileName, stack: e.stack });
}`;
  }

  // Sanitise before embedding, so the filter never has to look inside a string
  // literal (where it would corrupt the encoded body).
  wrapped = sanitizeCode(wrapped);

  if (options.undoGroupActive) {
    wrapped = `app.doScript(${asStringLiteral(wrapped)}, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT);`;
  }

  return polyfilled + '\n' + wrapped;
}

import { JSON_POLYFILL } from './jsonPolyfill.js';
import { getExtendScriptHelpers } from './extendScriptHelpers.js';
import { sanitizeCode } from '../utils/stringUtils.js';

export interface WrapOptions {
  debug?: boolean;
  undoGroupActive?: boolean;
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
 * Shared ExtendScript wrapping used by every executor backend (UXP WebSocket,
 * Windows COM). Produces the full script string: JSON polyfill + DOM shims +
 * optional debug/error-report wrapper + undo-mode preferences, all sanitized.
 *
 * Only the user's code is sanitised; the bundle below it is trusted and must
 * survive intact — running the filter over the polyfill once mangled its
 * JSON.parse fallback and broke every script execution.
 */
export function wrapExtendScript(code: string, options: WrapOptions = {}): string {
  const helpers = getExtendScriptHelpers();
  const polyfilled = `${JSON_POLYFILL}\n${helpers}\n${SECURITY_STUBS}`;

  let wrapped = code;

  if (options.debug) {
    wrapped = `
try {
  ${code}
} catch(e) {
  JSON.stringify({ __extendscript_error: true, message: e.message, line: e.line, fileName: e.fileName, stack: e.stack });
}`;
  }

  if (options.undoGroupActive) {
    wrapped = `
app.scriptPreferences.undoMode = UndoModes.ENTIRE_SCRIPT;
${wrapped}
app.scriptPreferences.undoMode = UndoModes.FAST_ENTIRE_SCRIPT;`;
  }

  return polyfilled + '\n' + sanitizeCode(wrapped);
}

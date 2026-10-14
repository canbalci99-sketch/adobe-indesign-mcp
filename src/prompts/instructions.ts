/**
 * Server-level guidance for host LLMs, advertised on MCP `initialize` via
 * `ServerOptions.instructions`.
 *
 * Tools alone tell a model *what* it can do, not *how* this server expects to be
 * driven. Left to infer, a host guesses the bootstrap, assumes the front
 * document is the target, reaches for raw ExtendScript when a typed tool fails,
 * and — worst of all — closes a document with the default save option, which
 * raises a modal dialog and wedges InDesign until the bridge times out.
 *
 * This is a contract, not documentation: it is paid on every session, so it
 * states only what changes behaviour and omits the rest. Every tool named here
 * is checked against the live registry by tests/unit/instructions.test.ts.
 */
export const INDESIGN_MCP_INSTRUCTIONS = `InDesign MCP server
==================

Drives a running Adobe InDesign through a local bridge. Tools are grouped by
object: document, page, text, style, object, image, table, colour, font, export.

SESSION BOOTSTRAP
- InDesign must be running and the bridge reachable. If a call fails with code
  "bridge_not_connected", stop and tell the user to launch InDesign and the
  bridge (the UXP panel, or scripts/start-bridge.sh on macOS). Do not retry in a
  loop — the bridge cannot appear on its own.
- Check the connection once at the start with document_listOpen, not every turn.

STATE BEFORE ACTION
- Call document_getInfo before mutating an existing document and treat its output
  as the source of truth for page count, dimensions and margins. Do not assume
  geometry.
- Tools act on the front document. If document_listOpen shows more than one
  document open, do not assume the front one is the intended target — ask which
  document, or open the intended one first.

CLOSING AND SAVING
- document_close defaults saveOptions to "ask", which raises a modal save dialog
  that blocks the script until the bridge times out and can leave InDesign
  wedged. Always pass an explicit saveOptions of "yes" or "no"; never rely on the
  default when acting unattended.
- document_save defaults to saving in place. Pass filePath to save as.

PREFER TYPED TOOLS OVER RAW SCRIPT
- Use the typed tools. Do not reach for raw ExtendScript to work around a failed
  tool: eval, Function, require, exec, spawn and fork are refused by the server's
  security policy and fail with code "script_blocked_by_policy". When a typed
  tool fails, read the error envelope and act on suggested_next_tool.

ERRORS ARE STRUCTURED
- A failed call returns JSON: { ok: false, code, message, suggested_next_tool? }.
  Frequent codes: invalid_reference (stale page or frame index — re-read state
  with document_getInfo), execution_timeout (InDesign is busy — probe with
  document_listOpen), missing_font (font_missing_check), link_missing
  (image_getLinks).

VERIFY WHAT YOU CHANGED
- Call preview_document to look at the result before reporting success, rather
  than assuming a change landed as intended.

MULTI-STEP EDITS
- Wrap a sequence of mutations in undo_beginGroup / undo_endGroup so one Undo
  reverts the whole outcome.
- To flow a story across pages, find where it lands with document_getStoryPages
  or document_getPageStories instead of assuming.`;

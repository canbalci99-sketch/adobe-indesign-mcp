# Windows Setup

On Windows you have two options:

## Option A — UXP plugin (default, same as macOS)
Follow the main README: load `plugin/` in UXP Developer Tool and connect.
The WebSocket bridge works identically on Windows.

## Option B — COM bridge (no plugin needed)
Drives InDesign via COM automation (`cscript` + `DoScript`) — no UXP Developer
Tool required. Requires InDesign to be **running** on the same machine.

1. Enable it before starting the server:
   ```powershell
   set COM_BRIDGE_ENABLED=true
   node dist\index.js
   ```
2. Optional overrides: `COM_BRIDGE_CSCRIPT_PATH`, `COM_BRIDGE_VBS_PATH`
   (defaults: `cscript`, bundled `assets/windows/run_jsx_persistent.vbs`).
3. Start InDesign first — the bridge attaches to the running instance
   (`GetObject`), or launches one via `CreateObject` if none is open.

Notes:
- User interaction prompts are suppressed automatically (`userInteractionLevel
  = NEVER_INTERACT`) so modal dialogs can never hang a tool call.
- Requests execute one at a time (FIFO) through a single persistent script
  host — startup cost is paid once, not per tool call.

## Verification status — stated plainly

The macOS path is exercised end to end against a running InDesign by
`npm run smoke:macos` and `npm run smoke:recipes`. **The COM path is not.** This
repo has no Windows host, so everything COM-specific is covered by unit tests
that assert the platform branch — which is not the same as a live
`cscript` + InDesign run. Treat Option B as *shipped but unexercised by us*:

- The macOS-only invariants still hold for it (`ComScriptExecutor` shares
  `wrapExtendScript` and the same sanitizer), the bridge refuses to start on a
  non-Windows host, and it stays off unless you set `COM_BRIDGE_ENABLED=true`.
- The operational notes above (a hung script wedges the bridge with no way out;
  `fontFamily`, `italic`, `weight` throw under COM; InDesign must be visibly
  running) come from [@graydini](https://github.com/graydini)'s branch. They are
  recorded because they are real observations from someone who ran it, not
  because they were reproduced here.

If you run Option B on a real Windows host, the two things worth reporting are
whether a tool call actually returns, and whether a wedged script can be
recovered without restarting InDesign.

Credits: COM approach pioneered by [@graydini](https://github.com/graydini)
in PR #1; this implementation keeps the macOS default path untouched by being
strictly opt-in.

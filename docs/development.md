# Development

How to build, test, and live-test `indesign-nutria-mcp`. For how the pieces fit
together, read [architecture.md](architecture.md) first.

## Prerequisites

- **Node.js 18+** (CI runs the 18 / 20 / 22 matrix)
- **Adobe InDesign** installed — only needed for the live smoke test; the unit
  suite runs without it
- **macOS or Windows** for InDesign automation (the server and its tests run
  anywhere, including Linux CI)

## Getting started

```bash
git clone https://github.com/nutriandrea/adobe-indesign-mcp
cd adobe-indesign-mcp
npm install
npm run build          # tsc -> dist/
npm run dev            # tsx watch src/index.ts (no build step)
```

The server is not published to npm; run it from the clone.

## npm scripts

| Script | What it does |
|--------|--------------|
| `npm run build` | `tsc` → `dist/` |
| `npm run dev` | watch mode via `tsx` (run the source directly) |
| `npm test` | the full vitest suite |
| `npm run test:watch` | vitest in watch mode |
| `npm run lint` | `eslint src scripts --ext .ts` — **exits non-zero on a finding** |
| `npm run lint:fix` | the same with `--fix` |
| `npm run verify:tool-counts` | fails if any advertised tool count drifts from the registry |
| `npm run docs:tools` | regenerates `docs/available-tools.md` from the registry |
| `npm run verify:docs` | fails if `docs/available-tools.md` is stale |
| `npm run verify:pack` | build → `npm pack` → install the tarball → boot it and assert 197 tools |
| `npm run verify` | `lint` + `verify:tool-counts` + `verify:docs` + `test` (the CI gate) |
| `npm run smoke:macos` | the live four-process smoke test (needs a running InDesign) |
| `npm run smoke:recipes` | the live gate for the two recipes (needs a running InDesign) |

## Test layout

```
tests/
├── unit/            # one file per module; unit/handlers/ mirrors src/handlers/
├── integration/     # server lifecycle, express bridge, handler registration
├── contract/        # toolInventory + errorRecovery — pin the public surface
├── e2e/             # placeholder for the live scenario suite (see below)
└── helpers/         # loadHandlers.ts — the shared registry loader
```

Two contract tests are load-bearing and worth knowing about:

- `tests/contract/toolInventory.test.ts` pins `EXPECTED_TOOL_COUNT` and parses
  the README's handler table, so the catalog cannot silently drift.
- `tests/contract/errorRecovery.test.ts` asserts that every
  `suggested_next_tool` an error envelope can emit names a tool that is
  actually registered.

Coverage thresholds (lines 85, functions 85, branches 80, statements 85) are
declared in `vitest.config.ts`. Coverage is **not** part of the CI gate today:
CI runs `npm test`, not `--coverage`, and the suite currently sits just under the
declared line/statement threshold, so `npx vitest run --coverage` will report a
threshold error. Treat the numbers as an aspiration to raise, not a gate to pass.

## Test conventions

**Development is on `main`; CI must be green.**

**macOS-only tests are skipped, never failed, off-platform.** CI runs on Ubuntu,
where `osascript` does not exist. A test that spawns it must guard itself:

```ts
const isMacOS = process.platform === 'darwin';

it.skipIf(!isMacOS)('reports a failure as parseable JSON', async () => {
  // spawns the real osascript
});
```

`tests/unit/jxaDriverExec.test.ts` is the reference for this pattern.

**Platform *branches* are simulated, not skipped.** When the code under test
branches on `process.platform` (e.g. refusing the COM bridge on non-Windows),
override and restore it:

```ts
const originalPlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'win32' });
try {
  // …assert the Windows branch…
} finally {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
}
```

`tests/integration/serverLifecycle.test.ts` is the reference for this pattern.

## The live smoke test

```bash
npm run smoke:macos
```

The mocked suite cannot see the **seams between the four processes** on the
plugin-free macOS path (MCP stdio → WebSocket bridge → JXA proxy → InDesign). A
P0 in `v1.4.2` proved it: 965 tests passed against a build whose bridge never
listened on its port, so every tool call failed in the field and nothing went
red. `smoke:macos` drives the real chain against a running InDesign.

What it does:

1. boots the server on a **non-default port** (`SMOKE_PORT`, default `8131`) so
   it never fights a bridge you already have running;
2. checks `initialize` advertises the workflow contract and `tools/list`
   returns 197 tools;
3. starts `bridge-proxy.mjs` and waits for `mcp://bridge/status` to report
   connected;
4. creates a document, adds a text frame, reads it back, calls
   `document_getInfo`;
5. asserts a **bad reference** comes back as a structured error envelope — the
   only check that proves the error contract survives all four processes;
6. closes the document without saving.

It exits non-zero on the first real failure, and exits **0 with a SKIP notice**
if InDesign is not running (`pgrep -x "$INDESIGN_APP"` finds nothing). It is not
part of `npm test` and never runs on CI, because it needs a desktop app and
mutates a real document. **Run it by hand before releasing any change to the
bridge, the protocol, the proxy, or the driver.**

Set `INDESIGN_APP` to your installed version if it is not `Adobe InDesign 2026`.

### The recipe live gate

```bash
npm run smoke:recipes
```

The unit tests for the two recipes pin the *shape* of the ExtendScript they emit,
not that InDesign agrees with it. `smoke:recipes` closes that gap. It creates a
document, flows a 300-paragraph text file through `recipe_flowTextStory` (which
must add pages to fit it), asserts the page count grew by exactly what the tool
reported, then calls `undo` **once** and asserts the document is back to one page
— the plan's "one Undo reverts the whole outcome". It then covers both preset
paths: a bad name must fail as `invalid_arguments` and list the valid presets,
and a good one must write the PDF. It uses bridge port `8133`, exits **0 with a
SKIP notice** when InDesign is closed, and is not part of CI either.

> The `tests/e2e/` directory is still a placeholder for a broader live scenario
> suite (a multi-document scenario, the `document_close` modal path) and is not
> wired into `npm test`. Today the working live tests are `smoke:macos` (the
> bridge seams) and `smoke:recipes` (the recipes).

## Verification gates

Three scripts guard the things that go stale silently:

- **`verify:tool-counts`** reads the registry (the same
  `tests/helpers/loadHandlers.ts` the server uses) and fails if the README
  prose, the badge, the package description, or the README handler-table sum
  disagree with it. It deliberately ignores the README's per-category headings
  (`### Text & Typography (27 tools)`) — those are overlapping sub-totals with an
  uncounted "Other" bucket and do not sum to the total.
- **`verify:docs`** regenerates `docs/available-tools.md` and fails if the file
  on disk differs. Change a tool, run `npm run docs:tools`.
- **`verify:pack`** packs the tarball, installs it into a temp dir, boots the
  packed entry point over stdio, and asserts it advertises 197 tools — the check
  that catches a `files` allowlist shipping `start-bridge.sh` without the
  `bridge-proxy.mjs` it execs. It also asserts those runtime files are present by
  name, because a handshake alone would not notice: the server only reaches for
  the proxy when it actually runs a script. And it asserts the version announced
  on `initialize` matches `package.json`, because a live handshake is the only
  place a stale advertised version was ever visible.

`npm run verify` runs lint + both count/doc gates + the test suite; CI runs it
on Node 18, 20, and 22, then a separate job runs `verify:pack`.

## Adding a tool

1. Add the tool to the right handler in `src/handlers/` (or create one),
   with a Zod schema for its arguments.
2. Implement the handler method — build ExtendScript, call
   `this.executor.execute(code)`, return `formatResponse(result)`.
3. Register the handler in `src/handlers/IndesignMcpServer.ts` if it is new.
4. Add a unit test in `tests/unit/handlers/`.
5. Update the README's handler table and the "What It Can Do" counts if the
   totals moved.
6. Run the gates:

```bash
npm run docs:tools     # regenerate the tool catalog
npm run verify         # lint + counts + docs + tests
```

`npm run verify:tool-counts` will tell you every place that still needs the new
number.

## Releasing

The changelog is [CHANGELOG.md](../CHANGELOG.md). Bump `version` in
`package.json`, add a dated section, run the full `npm run verify` and
`npm run smoke:macos`, then tag. Release automation is not wired up yet.

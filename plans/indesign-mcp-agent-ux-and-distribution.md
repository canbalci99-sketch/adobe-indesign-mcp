# Blueprint — indesign-nutria-mcp: agent UX, error recovery, distribution (v2)

> Objective: raise `indesign-nutria-mcp` from "194 tools that work" to a
> product an LLM host can drive reliably without being told how, and that a
> developer can install in one command.
>
> Reference standard: [`alisaitteke/photoshop-mcp`](https://github.com/alisaitteke/photoshop-mcp)
> — 641★, 73 forks, 118–128 tools, MIT, active.

**v2 note.** v1 of this plan was submitted to adversarial review and did not
survive it intact. Three of its factual claims were wrong, its critical path
was self-contradictory, and its central step (S1) was described as additive
when it is not, with a blast radius of 105 test assertions that v1 never
budgeted. Every correction is marked **[rev]** below, with the evidence. The
review's over-engineering findings are honoured by moving work to
*Deferred* rather than deleting it — with the criteria that would justify
reviving it.

---

## Pre-flight (verified at plan time)

| Check | Value |
|---|---|
| Branch | `main`, tracking `origin/main` (`nutriandrea/adobe-indesign-mcp`) |
| gh auth | `nutriandrea` — admin, can publish |
| Version | `1.4.2`, tag + release `v1.4.2` live |
| Tests | 983 passing / 58 files |
| Tools | 194 across 33 handler files in `src/handlers/` |
| MCP SDK | `@modelcontextprotocol/sdk@1.29.0` |
| npm | **Not published** — `npm whoami` → `ENEEDAUTH` |
| Windows COM path | Implemented, **never executed on Windows** |

---

## What the reference does differently

Not feature count — we have 194 tools to their 128. The difference is
**orchestration for an LLM consumer**. Verified in their source:

1. **Prompt layer** — `ServerOptions.instructions` carries a workflow contract
   on `initialize`, plus 24 MCP prompts (`src/prompts/`).
2. **Structured error envelopes** — `src/errors/envelope.ts` (309 lines):
   24 typed codes, each with `suggested_next_tool` + `suggested_args`, so a
   host self-corrects instead of guessing.
3. **Recipe tier** — 111 atomic + 17 outcome-oriented recipes, each in a single
   history state so one Undo reverts the outcome.
4. **Verification tooling** — `get_state`, `get_preview` (a JPEG the model can
   look at), `get_capabilities`, and optional `document_id` on mutating tools so
   a tab switch cannot retarget an edit.

The first three are one idea from three angles: *make the product legible to
the model that drives it.* Distribution (registry packaging, plugin manifests,
translated READMEs, web UI) follows from that and is *copyable polish*.

---

## Gap analysis  **[rev — three gaps were overstated in v1]**

| # | Gap | Evidence | Severity |
|---|---|---|---|
| G1 | No `instructions` on `initialize` | `new McpServer({name, version})` at `IndesignMcpServer.ts:70`; no `instructions` anywhere in `src/` | **P0** |
| G2 | No structured errors | **Correction:** `okResponse` / `errorResponse` already exist at `responseChunker.ts:124,147` and are referenced only by `responseChunker.test.ts`. The gap is that nothing *uses* them and they carry no recovery hint. | **P0** |
| G3 | No state/capabilities tool | **[rev]** v1 claimed no preview equivalent. **False:** `preview_document` exists at `PreviewHandler.ts:60` and is registered (`IndesignMcpServer.ts:108`) with tests. The real gap is `get_state` (one round-trip instead of several) and `get_capabilities`. | **P1** |
| G4 | No recipes — 194 flat atomics | handler registry, all atomic | **P1** |
| G5 | No MCP prompts | no `registerPrompt` call | P2 → **deferred** |
| G6 | Not installable | `npm whoami` → `ENEEDAUTH`; README says "not published to npm". **[rev]** `bin` (`package.json:7`) and `engines` (`:64`) already exist; only `files` is missing. | **P0** |
| G7 | `npm run lint` has never worked | no eslint config; `eslint src/` → "No files matching"; **exits 0**, so it fails silently and CI never calls it | **P1** |
| G8 | Thin CI | node 18/20/22, `tsc --noEmit`, vitest, build only; actions on mutable `@v4`; no concurrency; no lint | **P1** |
| G9 | No release automation | tag + release done by hand | P2 |
| G10 | No architecture/troubleshooting/tool-inventory docs | **[rev]** v1 said "no docs beyond README". **False:** `WINDOWS.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/origin.md`, `docs/comparison.md` exist. The gap is the four engineering docs, not docs. | **P1** |
| G11 | Windows path unexercised | stated in our own `v1.4.2` notes | **P1** |
| G12 | No MCP-registry packaging | **[rev]** v1 listed plugin manifests and skills as missing. **False:** `.npmignore`, `plugin/manifest.json`, and a shipped skill at `skills/indesign/indesign-mcp-layout/SKILL.md` all exist. The gap is `server.json`, `mcpb/`, and per-host example configs. | P2 |
| **G13** | **`saveOptions` defaults disagree and one hangs InDesign** | **[rev — found during this review, missed by the adversarial pass]** `saveDocumentSchema` defaults `'yes'` (`schemas/index.ts:59`) while `closeDocumentSchema` defaults `'ask'` (`:63`). `ask` raises a modal dialog and blocks until the bridge times out. | **P0** |

---

## Steps

### S1 — Error envelope with recovery hints  ← highest risk, do not ship blind
**Depends on:** none · **Parallel with:** S6, S8 · **Model:** strongest

**Context.** Failures reach the agent as prose. An agent that cannot
distinguish `no_active_document` from `document_not_found` guesses. This step
changes the **response contract of all 194 tools**, and the package is
unpublished — so there is no prior published version to roll back to and no
consumer-compat signal. Treat it accordingly.

**The seam  [rev].** Every handler already composes
`compose(withLogging(name), withErrorHandling())(...)` and `withErrorHandling`
already returns `{content:[{type:'text',...}], isError:true}` on throw
(`middleware.ts:21-33`). Implement the envelope **there**, once. There is no
central registry — each handler calls `server.tool()` in its own `register()`
— so the middleware chain is the only shared point. `withErrorHandling` has no
tool name; thread it through `withLogging`.

**Shape — specify it, do not hand-wave it  [rev].**
- Failures: keep `isError: true`, and put `{ok:false, code, message, suggested_next_tool?, suggested_args?}` in the text content. This preserves `isError` semantics that 54 assertions and the MCP spec depend on.
- Success: extend the existing `okResponse`/`errorResponse` pair rather than inventing a parallel shape.
- **Compatibility trap:** v1 called this additive. It is not. 105 `JSON.parse(` sites in `tests/unit/handlers/` read fields straight off the top level (`DocumentHandler.test.ts:112-113` reads `parsed.name`, `parsed.pages`). Wrapping success as `{ok:true, data:{…}}` makes those undefined. `ExportHandler.test.ts:232` already returns an array of objects carrying their **own** `ok` key — a naive spread collides. Choose the success strategy deliberately (preferred: spread `ok:true` into object results only, with explicit array/scalar handling) and budget the test updates as part of this step.

**Tasks.**
- `src/errors/envelope.ts`: `InDesignErrorCode` union + pattern table → `{code, suggested_next_tool, suggested_args?}`.
- Codes must cover what the bridge actually emits — including `frame_index_out_of_range` (our live smoke test saw the raw string `Object is invalid`), `execution_timeout` (reuse the existing `InDesignError` code), and `script_blocked_by_policy` (the new `__blocked` throw from the sanitizer fix).
- Wire the envelope into `withErrorHandling`; keep `isError:true`; pass `ImageContent` through **unmodified**.
- Version bump + CHANGELOG + a migration note stating exactly what changed for a host reading `content[0].text`.
- Optional: land behind a config flag for one release.
  **Done 2026-10-14** — see the mutation entry. The chosen shape is the preferred
  spread (`{ ...data, ok: true }`) for objects, `result:` for arrays/scalars, so
  the 105 parse sites only need touching if the default ever flips. Note the plan's
  "extend the existing `okResponse`/`errorResponse` pair" was wrong in fact:
  `okResponse`/`chunkResponse`/`errorResponse` in `responseChunker.ts` have **no
  production callers** (only `responseChunker.test.ts`), so `formatResponse` +
  `ChangesHandler.getStatus` are the real success seams.

**Verification.**
- `tests/unit/errorEnvelope.test.ts`: every code reachable from ≥1 test.
- Contract test: **every `suggested_next_tool` resolves to a registered tool.** A hint naming a missing tool is worse than no hint.
- Image pass-through test: `preview_document` output survives the wrapper untouched.
- Update the 105 handler parse sites in the same commit.

**Exit criteria.** `tsc` clean; full suite green; failure responses still `isError:true`; image content byte-identical through the wrapper.

**Rollback.** The seam is one middleware — revert restores the old shape. Behind a flag, the rollback is config.

---

### S2 — Server instructions: the workflow contract
**Depends on:** S1, S3 **[rev]** · **Parallel with:** S6, S8 · **Model:** strongest

**Context.** Answers `initialize` with a name and a version and nothing else,
then presents 194 undifferentiated tools. Highest leverage per line in the plan.

**Tasks.**
- `src/prompts/instructions.ts` exporting `INDESIGN_MCP_INSTRUCTIONS`.
- **Correct construction  [rev]:** the SDK signature is
  `constructor(serverInfo: Implementation, options?: ServerOptions)`
  (`mcp.d.ts:24`); `instructions` lives on `ServerOptions`
  (`server/index.d.ts:15`). So it is
  `new McpServer({name, version}, {instructions})`. v1's
  `new McpServer({name, version, instructions})` does not compile.
- Contract content, true to *InDesign*:
  - **Session bootstrap** — verify the bridge once per session, not per turn.
  - **State before action** — `document_getInfo` before mutating; its output is the source of truth for pages, dimensions, margins.
  - **Pin the document** — with more than one open, the front tab is not safely the target. **[rev]** Phrase conditionally until S3 ships `document_id`, or the contract dangles references to unshipped capabilities.
  - **`document_close` needs an explicit `saveOptions`** — see G13. Name the hang.
  - **Do not reach for raw script execution to work around a failed tool.**
- **[rev]** "≤ ~120 lines" was the only cost bound. Measure actual tokens; instructions are paid on every session.

**Verification.** Assert `initialize` carries non-empty `instructions`; every tool named in it exists (contract test); token count recorded.

**Exit criteria.** Present on `initialize`; no reference to a non-existent tool; token cost stated.

**Rollback.** One string and one constructor argument.

---

### S3 — Extend preview; add state and capabilities
**Depends on:** S1 · **Parallel with:** S5 · **Model:** default

**Context (rewritten — v1's premise was false).  [rev]** v1 justified this step
by claiming `responseChunker` "already carries an image-content shape"
(§122). That comment describes a **text** envelope. The chunker emits
`TextContent` only (`responseChunker.ts:62,85,128`) and byte-splits
JSON-stringified input, so routing an image through it would **corrupt** the
payload. The prompt also claimed no preview tool exists. **False:**
`preview_document` exists (`PreviewHandler.ts:60`), is registered
(`IndesignMcpServer.ts:108`), returns image content, and is tested. Rebase on it.

**Tasks.**
- **Extend `preview_document`** (don't add a second preview surface): page selection, `document_id`, output size cap.
- `document_getState` — active document, pages, dimensions, margins, active layer, open-document list, in **one** round-trip. Decide explicitly whether to extend `document_getInfo` or add alongside, and say which in the PR.
- `document_getCapabilities` — InDesign version, which backend is live (UXP / macOS JXA / Windows COM), feature availability by version. **[rev]** No consumer is identified yet — ship only if S2's contract references it, otherwise defer.
- Optional `document_id` on mutating tools, validated against the open-document list.
- **Security task  [rev]:** `PreviewHandler` reads a server-chosen temp file and base64s it (`:96-100`). Assert the path is never user-controlled, cap resolution and payload size, and route through the existing `src/utils/security.ts` guards and `SECURITY.md` policy.

**Verification.** Live smoke vs InDesign 2026 for each tool; a chunking test with an image larger than one frame; a test that a hostile `document_id` is rejected.

**Exit criteria.** Preview honours `document_id` and a size cap; state is one
round-trip; capabilities names the live backend correctly. **[rev 2026-10-14 —
corrected to match what shipped.]** `document_id` was *deferred*, so this exit
criterion as written was never met and could not be: pinning a document needs a
shared resolver for the 191 inline `app.activeDocument` sites, which is a
refactor, not an increment (see the S3 mutation entry). What actually shipped:
`preview_document` with `documentIndex` plus a 4 MB cap, and `document_getState`.
`document_getCapabilities` was dropped for having no consumer.

**Rollback.** Additive handlers; `preview_document` changes revert independently.

---

### S4 — Recipes (reduced to a validated core)  **[rev: was 6 recipes, cut to 2]**
**Depends on:** S1, S3 · **Parallel with:** none · **Model:** strongest

**Context.** 194 atomics is a hostile surface. But v1 named six recipes with no
evidence any collapses turns or state, while its own anti-pattern list says a
recipe that just renames a chain is an alias with extra surface. The adversarial
review called this over-engineering and it was right.

**Tasks — build two, prove them, then decide.**
1. `recipe_flowTextStory` — place a text file and flow across pages with overflow handling. Currently multi-call and error-prone; genuinely collapses state.
2. `recipe_exportPreset` — PDF preset + export in one state.

Each runs inside a single undo group. **[rev]** v1 said the mechanism is
"unused". **False:** `startUndoGroup`/`endUndoGroup` exist
(`ScriptExecutor.ts:31,35`) and are already surfaced as the `undo_beginGroup` /
`undo_endGroup` tools (`UndoHandler.ts:36,42`). What is missing is *composing*
them into a multi-step flow.

**Gate to proceed further:** measure turns and tokens against the atomic
equivalent. If a recipe does not materially beat the chain, do not build more.
**Measured 2026-10-14 (see the mutation entry):** the two-page flow is
**1 call / 215 bytes** via `recipe_flowTextStory` versus **6 calls / 786 bytes**
for the nearest expressible atomic chain — which additionally *cannot place the
text at all*, because no tool places a text story into a frame. The gate is met
on round-trips and payload; the token half with a model in the loop is stated as
unmeasured.

**Verification.** Live smoke per recipe; assert one Undo reverts the whole outcome; record the turn/token delta.

**Exit criteria.** Two recipes with a measured advantage; the measurement decides whether S4 expands.

**Rollback.** Additive handlers.

---

### S5 — Make it installable ⚠️ blocks adoption
**Depends on:** none · **Parallel with:** S1, S8 · **Model:** default

**Context.** G6. Nothing else matters if nobody can install it.

**Tasks.**
- Authenticate npm (maintainer action).
- Decide name/scope; consider matching the reference's scoped convention.
- Add **`files` only** **[rev]** — `bin` and `engines` already exist.
- `prepublishOnly`: `build && test && verify:pack` (from S7).
- Publish, then rewrite the README install section back to `npx`.

**Status 2026-10-14 — everything not behind the credential is done.** `files` is
now an allowlist (there were both a `.npmignore` denylist *and* no `files`, which
is how a stray 2.9 MB `bauhaus-page4.jpg` at the repo root — referenced by
nothing — plus `plans/`, `media/` and a portfolio script ended up in the tarball).
The package now ships **1.6 MB unpacked instead of 4.4 MB** and still contains
everything the runtime reaches for (`assets/windows/*.vbs` is resolved as
`../../assets/…` from `dist/bridge/`, so it must stay; the proxy and driver are
asserted by `verify:pack`). The inert `.npmignore` was removed rather than left
beside the allowlist — two mechanisms that disagree is the bug class this step
exists to stop, and the earlier "packaged macOS bridge was broken on install"
regression came from exactly that denylist. `prepublishOnly` already runs
`verify && verify:pack`. **Blocked here:** `npm whoami` returns `ENEEDAUTH`, so
step 1 and step 5 cannot run — the README deliberately says the package is not
published rather than claiming a `npx` that would fail.

**Verification.** `npm pack`, install the tarball into a clean temp dir, run it.

**Exit criteria.** `npx indesign-nutria-mcp` works from a clean machine.

**Rollback.** `npm unpublish` within 72h; then a fixed patch.

---

### S6 — Client configs and registry metadata  **[rev: trimmed]**
**Depends on:** S5 · **Parallel with:** S7, S8 · **Model:** default

**Tasks.** `examples/` (Claude Desktop, Cursor, Claude Code). `server.json` for
the MCP registry, `mcpb/` bundle, `glama.json`, `llms.txt`. **[rev]** v1 also
listed `.claude-plugin`, `.cursor-plugin`, and shipping skills — a skill already
ships and `plugin/manifest.json` exists, so add only what is genuinely absent.

**Verification.** Each config validated against its schema; a clean-host install using the example verbatim.

**Exit criteria.** One file to copy and be running.

**Rollback.** Additive.

---

### S7 — CI hardening and verification scripts
**Depends on:** none · **Parallel with:** S5, S8 · **Model:** default

**Context.** G7 + G8. `npm run lint` has never worked and exits 0.

**Tasks.**
- Add an eslint config, fix what it flags, add it to CI as a required check. A check that cannot fail is worse than no check.
- `scripts/verify-tool-counts.ts` — **[rev]** v1 made this depend on S8, creating a cycle. It must read the **registry + README directly** (our `tests/contract/toolInventory.test.ts` already parses the README table and pins `EXPECTED_TOOL_COUNT`), so it depends on nothing.
- `scripts/verify-pack.mjs` — pack, install into a temp dir, import, fail if broken.
- CI: pin actions to commit SHAs, add `concurrency` with `cancel-in-progress`, keep the 18/20/22 matrix.
- `pr-title.yml` — conventional title check; the history is already conventional-commit shaped.

**Verification.** Break a doc count → CI fails. Break the packed import → `verify:pack` fails. Each new check demonstrated failing for the right reason.

**Exit criteria.** Green on a clean checkout; every new check has been seen to fail.

**Rollback.** Workflow files revert independently.

---

### S8 — Documentation suite
**Depends on:** none (write against current state; refresh after S1–S4) · **Parallel with:** S5, S6, S7 · **Model:** default

**Context.** G10 — reworded. `docs/` holds provenance artifacts
(`origin.md`, `comparison.md`, `launch-thread.md`) plus root-level
`WINDOWS.md`, `SECURITY.md`, `CONTRIBUTING.md`. What is absent is engineering
documentation.

**Tasks.**
- `docs/architecture.md` — the real four-process macOS path (MCP stdio → BridgeServer → proxy → JXA → InDesign) and the Windows COM path. **This diagram existing nowhere is why the `v1.4.2` P0 survived 965 tests.**
- `docs/troubleshooting.md` — the `document_close` modal hang, port 8120 in use, misspelled `INDESIGN_APP`, missing fonts, `__blocked` policy errors.
- `docs/available-tools.md` — generated from the registry.
- `docs/development.md` — live smoke test, and the platform-guard convention for macOS-only tests.

**Verification.** Every command in every doc executed once; counts agree with the registry (S7 enforces).

**Exit criteria.** A new contributor can build, test, and run the smoke test from docs alone.

**Rollback.** Docs only.

---

### S9 — Release automation
**Depends on:** S5, S7 · **Parallel with:** S8 · **Model:** default

**Tasks.** `release.yml` (tag → build → test → publish → release from
CHANGELOG), `publish-mcp-registry.yml`, `validate-release-tag.sh`, and a
`server.json` generated from `package.json` rather than hand-written.

**[rev] `sync-server-version.ts` is no longer needed for the version it was meant
to protect.** It existed because the version was copied into four places — the
config default, two shipped config files, the plugin manifest — and drifted for
four releases: a 1.4.2 build advertised `1.0.0` on `initialize`. That is fixed at
the source now. `SERVER_VERSION` is a single literal in `configLoader.ts`, the
shipped configs state no version so they inherit it, and
`tests/unit/serverVersion.test.ts` fails the moment any of it disagrees with
`package.json`. A release still bumps one literal; the test makes forgetting
loud. If `release.yml` needs to write a version into a file, generate that file
then — do not reintroduce a second copy kept in sync by a script.

**Verification.** Dry-run on a prerelease tag end to end.

**Exit criteria.** One tag push, no manual steps.

**Rollback.** Delete the workflow.

---

### S10 — Live scenario suite  ⚠️ needs a Windows machine
**Depends on:** S3, S4 · **Parallel with:** S7, S9 · **Model:** default

**Context.** G11. We have exactly one live test — the macOS smoke test added in
`v1.4.2`, which exists because 965 mocked tests passed against a build whose
bridge never listened.

**Tasks.** Promote `scripts/smoke-macos.mjs` into a suite: the existing path,
one per recipe, a multi-document scenario, and the `document_close` default-safety
check. **[rev 2026-10-14]** the original list said "a multi-document
`document_id`-pinning scenario", but `document_id` was *deferred* in S3 — the
scenario must exercise `documentIndex` / active-document isolation instead, and
should record the limitation plainly (tools act on `app.activeDocument`; there is
no pin). The `document_close` scenario is now a check that closing a **dirty**
document while relying on the schema default returns instead of hanging — the
regression that matters, since passing `saveOptions: 'no'` explicitly cannot see a
default that drifts back to `'ask'`. Then the Windows COM equivalents — **the only
thing that discharges G11.**

**Status 2026-10-14.** The macOS half is done: the existing path, one live
scenario per recipe (`scripts/smoke-recipes.mjs`), and the `document_close`
default-safety check all pass against InDesign 2026 (`smoke:macos` 11/11,
`smoke:recipes` 17/17). The multi-document isolation scenario is **not** built;
it needs a decision on whether to pin documents first. The Windows half is open —
`WINDOWS.md` now has a *Verification status* section stating plainly that the COM
path is shipped but unexercised by this project (unit-tested platform branch, no
live `cscript` run), which is the "closed or stated plainly" half of the exit
criterion. What remains is a real Windows host.

**Verification.** All pass locally vs InDesign 2026; Windows scenarios run on a real host or are explicitly marked unverified.

**Exit criteria.** Every recipe has a live scenario; the Windows gap is closed or stated plainly.

**Rollback.** Scripts only.

---

## Deferred (not justified by the gap analysis)  **[rev]**

| Was | Why deferred | Revive when |
|---|---|---|
| **S4 prompts** (v1) | G5 was P2. Adds a step plus a permanent maintenance obligation ("one scenario per prompt") while the stated objective is already served by `instructions`. | After S2 lands, if hosts ask for invocable templates. |
| **Recipes beyond two** | Unmeasured. The step's own gate now decides. | Two recipes show a real turn/token advantage. |
| **S12 i18n + social** | `llms.txt` survived into S6; six translated READMEs, hero/OG images and topic curation are not tied to any gap, and unmaintained translations read as abandonment. | A translated maintainer commits to owning them. |
| **A standalone web UI** | The reference ships one; nothing in our gap analysis requires it. A different product with a different cost. | Users ask for a non-MCP interface. |

---

## Dependency graph  **[rev — v1's critical path was wrong]**

```
S1 (envelope) ──┬─> S3 (state/preview) ──> S4 (recipes) ──> S10 (live suite)
                └─> S2 (instructions)

S5 (npm) ──> S6 (configs/registry) ──> S9 (release)
S7 (CI) ──────────────────────────────> S9
S8 (docs)
```

**Critical path:** `S1 → S3 → S4 → S10`. v1 said `S1 → S2 → S5 → S11`, which
its own graph contradicted — S2 feeds nothing on the path.
**Unblocked today:** S5 and S8 only. v1 claimed S6/S7/S12 too; S6 and S9 depend
on S5, so they are not.

## Invariants (after every step)

1. `npx tsc --noEmit` clean, `npx vitest run` green.
2. `comBridge.enabled` stays `false` in the shipped manifest — macOS/Linux keep working out of the box.
3. The bridge starts under the **default** config. This is the `v1.4.2` P0; it has tests, and they must not be weakened.
4. macOS-only execution tests stay behind a platform guard so the Ubuntu matrix stays green.
5. Tool count in README == registry count.
6. Failure responses keep `isError: true`; image content passes through unmodified.

## Anti-patterns

- **Calling a response-shape change "additive" without stating the shape.** It cost v1 its central claim.
- **Bloat in `instructions`** — paid every session.
- **`suggested_next_tool` naming a tool that does not exist.** Enforce in a contract test.
- **A verification check that cannot fail** — our own lint script, exiting 0 while matching nothing.
- **Recipes that merely rename a chain.**
- **Unmaintained translations.**
- **Treating the Windows gap as closed by writing more macOS tests.**

## Mutation protocol

Any change to a step records what changed, why, what it blocks, and the date.

- **2026-10-14** — **The advertised version was stale by four releases — fixed at
  the source, with a gate.** A 1.4.2 build answered `initialize` with
  `version: "1.0.0"` (verified against the built artifact, not inferred), because
  the version was a hardcoded literal in the config default plus three more
  copies — `indesign-nutria-mcp.json`, `opencode-indesign.json`,
  `plugin/manifest.json` — each independently stale. That is the field a host, a
  bug report and a support thread all use to identify a build, so it was wrong
  for every user since 1.0.0. Fixed as one `SERVER_VERSION` literal that the
  default reads, no version stated in the shipped configs (they inherit instead
  of pinning), the plugin manifest stamped with the release version, and
  `.env.example` explaining why it leaves `SERVER_VERSION` unset — a value pinned
  in `.env` outlives an upgrade and keeps reporting the old version. The new
  `tests/unit/serverVersion.test.ts` (3 tests) fails if any of them disagree with
  `package.json`, and `verify:pack` now asserts the version the *packed* artifact
  announces on `initialize` — the one place the bug was ever visible. The gate was
  checked by breaking the literal and watching it fail, which is the only evidence
  a gate works. That is what makes the one remaining manual step per release safe
  to rely on. **Plan impact:** S9's `sync-server-version.ts` is superseded —
  see S9. **Deliberately not changed:** `BridgeServer`'s handshake ack sends
  `{ type: 'connected', version: '1.0.0' }`; it is unread by both the plugin
  ("ignore non-request messages") and the proxy, and in a bridge handshake
  `version` plausibly means the *protocol* version rather than the app version.
  Guessing either way would be a coin flip on a field nothing consumes, so it is
  recorded here instead.
- **2026-10-14** — **S5's non-credential half done; two correctness fixes riding
  along.** S5 is blocked only on the credential, so everything else in it was
  done. **`files` is now an allowlist and `.npmignore` is gone.** The package had
  a denylist and no allowlist, and the denylist is how a stray 2.9 MB
  `bauhaus-page4.jpg` at the repo root — referenced by *nothing* in the tree —
  shipped, along with `plans/`, `media/` and `portfolio-creative.mjs`: **4.4 MB
  unpacked**. The allowlist names what a user needs (built `dist/`, the bridge
  runtimes, the UXP plugin, the skill, `docs/`) for **1.6 MB unpacked**, and
  `verify:pack` still boots the artifact and finds 197 tools plus the contract.
  `.npmignore` was removed rather than left inert beside the allowlist: two
  mechanisms that can disagree is the bug class this step exists to stop, and the
  `v1.4.2` "packaged macOS bridge was broken on install" fix was a denylist that
  excluded `bridge-proxy.mjs` while the package still shipped `start-bridge.sh`
  to exec it. A `files` entry is authoritative even against `.gitignore`
  (`dist/` is gitignored and still ships), which is why one mechanism is enough.
  Two smaller fixes: the initialize contract told every session to launch
  `scripts/start-bridge.sh`, a path that does not exist (the script is
  `./start-bridge.sh` at the root) — wrong exactly when the bridge is already
  down, which is when it is read; and the `document_close` default now has a live
  guard (see the S10 entry). **Still blocked:** `npm whoami` → `ENEEDAUTH`, and the
  name/scope decision is the maintainer's, so publish and the README `npx`
  rewrite wait. The README keeps saying the package is unpublished, which is true.
- **2026-10-14** — **Both live gates green; S10's macOS half done; a plan-vs-code
  drift corrected.** Re-ran the two live gates against InDesign 2026 with the
  fixes in place. **`smoke:recipes` 17/17** — the recipe flows the story, one Undo
  restores the page count, and the bad preset now returns `invalid_arguments` (was
  `bridge_error`) with the valid names listed. **`smoke:macos` 11/11** — a bad
  reference now returns `invalid_reference` with `next=document_getInfo` (was
  `bridge_error`), which is the only check that proves the classification fix
  survives all four processes. Added the S10 `document_close` scenario: close a
  **dirty** document while omitting `saveOptions`, relying on the schema default.
  The existing check passed `'no'` explicitly, so it could not observe the one
  regression that matters — a default drifting back to `'ask'`, which raises a
  modal dialog that blocks until the bridge times out and leaves InDesign wedged.
  **Plan correction:** S3's exit criteria and S10's task list both named
  `document_id`, but S3 *deferred* it (no shared resolver for the 191 inline
  `app.activeDocument` sites). A plan whose exit criteria name a capability the
  code deliberately lacks is a trap for the next reader, so S3's exit criteria now
  state what shipped (`documentIndex` + a 4 MB cap, `document_getState`) and S10's
  scenario is specified as `documentIndex` / active-document isolation. S10 is
  therefore *partially* done: the per-recipe scenarios and the close-safety check
  exist and pass; the multi-document isolation scenario is not built (it needs a
  decision on whether to pin documents first), and the Windows half is still the
  only thing that discharges G11.
- **2026-10-14** — **S4 measurement recorded; the exit criterion is met.** The
  plan's S4 gate is "a *measured* advantage", not a merge, and it had been left
  open because InDesign was closed. With it open, the same outcome — a 300-line
  text file flowed across two pages — was measured both ways over the real MCP
  server (port 8133, a scratch document, closed without saving):
  - **Path A, `recipe_flowTextStory`: 1 tool call, 215 bytes** (111 request + 104
    response).
  - **Path B, the nearest chain expressible from atomic tools: 6 calls, 786
    bytes** (281 + 505) — and it **does not achieve the outcome**. It creates the
    frames, adds the page, links them and re-reads `overflows`, but it cannot
    *place the text file at all*: no tool among the 197 places text into a frame.
    `image_place`/`image_relink` are for images; `recipe_flowTextStory` is the
    only tool that places a text story.
  So the advantage is not a rename — it is **≥6× the round trips, ~3.7× the JSON,
  and a capability the atomic surface does not have.** The call count grows with
  the flow: the mechanical chain is `text_addFrame` + a `text_getTextFrames`
  overflow read + `page_add` + `text_addFrame` + `text_linkFrames` + a final read
  = 6 for two pages, +3 per extra page, *plus* the place step that has no tool.
  **Stated limit:** the token cost of the alternative is not byte-measured here.
  The recipe embeds ~1.4 KB of ExtendScript (`RecipeHandler.ts` lines 158–209) —
  the agent's only other route is to author that itself through `script_execute`,
  which the workflow contract tells it not to do; that authoring cost is real but
  is a model-turn quantity, not a byte count. The round-trip and payload halves
  are measured; the model-in-the-loop half remains qualitative. Because the gate
  is now met, S4 is no longer blocked — but per the deferred table, "recipes
  beyond two" still waits on a *token* advantage with a model in the loop.
- **2026-10-14** — **S1b landed behind a config flag (open question 4 resolved).**
  The failure envelope (S1a) stays always-on and additive. The *success* shape —
  the half the plan flagged as the response-contract change for all tools — now
  ships behind `responseEnvelope.success` (`RESPONSE_ENVELOPE_SUCCESS`), default
  **off**, for one release. When on, a successful result is `{ ok: true, ... }`.
  The plan preferred *spreading* `ok:true` into object results over nesting under
  `data:`, and that is what it does: `{ ...data, ok: true }`, so the 105 existing
  test parse sites (which read `parsed.name`) would survive the eventual flip to
  default without a rewrite. Arrays and scalars nest under `result`, because
  spreading an array loses it and a result that carries its own `ok` key would
  collide with the envelope. The seam is `formatResponse` (every handler's success
  path, 228 call sites) plus `ChangesHandler.getStatus`, the one bespoke success
  builder; `preview_document`'s `ImageContent` bypasses both and is never wrapped.
  The flag is read once in the server constructor via a module-level setter, which
  keeps `formatResponse` pure and handler-free. Decision recorded here because it
  makes S1's "accept the shape change" question a flag rather than a fork.
- **2026-10-14** — **S4 gate run live; it found three P-level bugs and the fix
  changes the undo mechanism.** InDesign was opened, so `npm run smoke:recipes`
  ran for real. It immediately falsified three things the unit tests "passed":
  (1) `wrapExtendScript` set `app.scriptPreferences.undoMode`, which InDesign does
  not have — it threw `Object does not support the property or method 'undoMode'`,
  so **every** script run while an undo group was open failed, which is why
  `recipe_flowTextStory` returned `bridge_error` and every recipe assertion
  cascaded. The supported primitive is
  `app.doScript(body, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT)`:
  the body is passed as a **string** so `doScript` returns the program's completion
  value, and it must be the last statement (the old trailing assignment would have
  replaced the result even had the property existed). Sanitising now happens
  *before* the body is embedded, so the filter never has to look inside a string
  literal. A throwaway matrix on the live app established the semantics: a grouped
  change is reverted by the **first** plain `undo`, whereas ungrouped multi-op
  scripts need two; and grouping the `undo` call itself throws
  `Impossibile annullare l'ultimo comando`, so `undo` must stay ungrouped.
  (2) `undo`, `redo` and `undo_history` read `document.undoable`/`redoable`, which
  are not in the DOM (same "Object does not support the property or method"
  failure); `undo`/`undo_history` failed on every call. They now attempt the
  operation in `try`/`catch`; `undo_history` reports honestly that the DOM exposes
  no undo depth (`app.undoHistory` reflects only `length`, always `0`).
  (3) **The whole S1a rules table was unreachable in production.** The macOS
  bridge labels every InDesign-side failure `BRIDGE_ERROR`, and `classifyError`
  treated any transport code as authoritative, so "Object is invalid" and "PDF
  export preset not found" always came back `bridge_error`. The two catch-all
  codes now yield to the message rules and fall back to themselves; specific
  transport codes (timeout/cancelled/output-too-large) stay authoritative. The
  live smoke had been reporting this for a while (`bad reference → code=bridge_error`)
  and it was read as cosmetic until the preset path needed it. **Verified live
  after the fix:** `recipe_flowTextStory` flowed the whole story
  (`framesCreated 2`, `pagesUsed [0,1]`, `pagesAdded 1`, `overflows false`,
  `storyLength 17891`) and **one `undo` restored the page count 2 → 1** — the S4
  exit criterion. `recipe_exportPreset` exported with `[PDF/X-3:2002]` and wrote
  the file. **Still open:** a re-run to confirm the **bad-preset** path now returns
  `invalid_arguments` (fixed in code, 1038 unit tests green, but not yet observed
  live) and the turn/token delta versus the atomic chain. `undo_beginGroup`'s
  description was corrected: it makes each *call* one undo step; it cannot merge
  separate calls (also proven live). 8 new unit tests pin the grouping shape, the
  corrected `classifyError` precedence, and the honest `undo_history`.
- **2026-10-14** — **S4 built, measurement still open.** **[Superseded later the
  same day: the measurement was recorded — see the newest entry at the top of this
  protocol.]** The plan asked for two
  recipes with a *measured* advantage and said the measurement decides whether S4
  expands. The two are built and green on `main` (`75029a2`, CI 18/20/22 +
  package); the measurement is **not** done, because it needs InDesign and
  InDesign was closed. That distinction matters here: the exit criterion is a
  number, not a merge. **`recipe_flowTextStory`** places a text file and then
  flows it: create a frame on the start page's text area (page bounds inset by
  that page's margins), `frame.place(File(...))`, then while `frame.overflows`
  link `frame.nextTextFrame` to a frame on the next page — adding a page when
  there is no next — and report `framesCreated`, `pagesUsed`, `pagesAdded`,
  `overflows` and `storyLength`. It is not a rename of a chain because the right
  next step depends on a state only InDesign reports mid-operation; a caller
  otherwise loops place → read `overflows` → add page → link, one round-trip per
  turn, with no way to know the page count up front. **`recipe_exportPreset`**
  validates `app.pdfExportPresets.itemByName(name).isValid` and exports with it.
  The plan's claim that this has no atomic equivalent holds for a concrete
  reason: `export_document` passes its `options` through as JSON, which the PDF
  engine will not accept as a preset, so the two are genuinely disjoint. A bad
  name is not a dead end — the error names every valid preset, since no listing
  tool exists — and `src/errors/envelope.ts` classifies it `invalid_arguments`
  (resend, do not retry). Each recipe runs as **one** `execute`, so one
  `UndoModes.ENTIRE_SCRIPT` group covers the whole outcome. That is done by
  *composing* `startUndoGroup`/`endUndoGroup` — the same mechanism behind
  `undo_beginGroup`/`undo_endGroup` — with a capture/restore of
  `executor.undoGroupActive`: if the caller already opened a group, the recipe
  leaves it open rather than committing it mid-chain. Tool count 195 → 197,
  handlers 33 → 34, propagated to the README (prose, badge, table, diagram,
  structure), `package.json`, `smoke-macos.mjs`, `docs/architecture.md` and
  `docs/development.md`; `docs/available-tools.md` regenerated; the initialize
  contract now points at both recipes. 10 new handler tests pin the emitted
  script and the undo-group behaviour (including "does not close a caller's
  group"); on the new files only. The live gate is now one command —
  `npm run smoke:recipes` (port 8133, skips cleanly when InDesign is closed):
  flow a long file, assert the page count grew by what the tool reported, call
  `undo` **once** and assert the document is back as it was, then take both
  preset paths. **Still unverified — needs that live gate:**
  `TextFrame.place` + `nextTextFrame` semantics, the margins math, real preset
  names, that one Undo really reverts the whole flow, and the turn/token delta
  versus the atomic chain. Until that is recorded, S4 has not met its exit
  criteria and must not expand.
  **[Later the same day: the gate was run and all of these are now verified —
  `place`+`nextTextFrame` flows the story (2 frames, page added, no overflow),
  one Undo restores the page count, `[PDF/X-3:2002]` exports, and the round-trip
  and payload delta is measured. See the newest mutation entry.]**
- **2026-10-14** — **S8 landed** (documentation suite), the other step unblocked
  on day one besides S5. Four docs, all written against the code rather than the
  README: `architecture.md` (the four-process macOS path with the real hop labels
  and the class behind each one, the request lifecycle, the response/error
  contract, the trust boundaries, and — the point — *why* the live smoke test
  exists), `troubleshooting.md` (modal hangs, port 8120 in use, a mistyped
  `INDESIGN_APP`, missing fonts, `script_blocked_by_policy`, `output_too_large`,
  the split-stdout-chunk trap), `development.md` (build/test/live-test, the
  `it.skipIf` platform-guard convention with its two reference tests), and
  `available-tools.md`. The catalog is **generated** from the registry via
  `npm run docs:tools` (same `loadHandlers` the server uses) and gated by
  `npm run verify:docs`, so it cannot drift — the S7 finding that the README's
  per-category headings sum to 164 is left alone deliberately: they are a curated
  grouping with an uncounted "Other" bucket, not a partition, and
  `verify:tool-counts` already skips them via the lookbehind. Two facts changed
  while writing it. (1) G13 left the README lying: it still told agents
  `saveOptions` defaulted to `ask` and to pass `"yes"`, when the safe default is
  now `"no"` and `"yes"` is itself unsafe on an unsaved document — corrected,
  along with the same stale comment in `smoke-macos.mjs`. (2) `jxaDriverExec`'s
  premise ("osascript reports a result on stderr") is **false on this machine**:
  a probe of `osascript -l JavaScript jxa-driver.js` puts the driver's return
  value on **stdout** with exit 0, which is why `bridge-proxy.mjs` reads stdout
  and works. The architecture doc states the verified behaviour; the historical
  attribution in the README was left as written. Also refreshed the advertised
  test count (966 → 1016) and the `CONTRIBUTING` figure, and pointed the README,
  `CONTRIBUTING` and the e2e placeholder at the new docs. `tests/e2e/` is
  described honestly as an unwired placeholder — its `run-manual.js` does not
  exist and belongs to S10.

- **2026-10-14** — **S7 landed** (CI hardening), and it paid for itself before it
  was finished. `npm run lint` had *never* worked: `eslint src/` with no config and
  no `--ext` matched no files and exited 0, so CI passed a check that could not
  fail. With a real config the eight findings were not style noise — one was a
  live bug: `export_batchFolder` wrote `\.indd` inside a template literal, where
  the escape is unnecessary and silently dropped, so the emitted ExtendScript
  carried `/.indd$/i` and stripped the wrong characters from names without a dot.
  Two more were a dead `splice(...)[0]` and a zero-width space hiding in a JSDoc
  comment. The lint is now a required CI step and covers `src` + `scripts/*.ts`.
  **`verify:tool-counts`** reads the numbers the project *advertises* — README
  prose, badge, package description, handler table — which the vitest guard does
  not, and that gap is exactly how the description once read 191. It immediately
  turned up a real one: the README's per-category headings sum to 164, not 195,
  because the "Other" bucket (layers, effects, TOC, sections, undo, changes …) is
  deliberately uncounted — noted for S8, not a CI failure, since the headings are
  a curated grouping rather than a partition. **`verify:pack`** packs, installs the
  tarball in a temp dir and boots it over stdio (importing is impossible: `main()`
  runs at module scope), and it caught a genuine packaging break: `.npmignore`
  excluded `bridge-proxy.mjs` while shipping the `start-bridge.sh` that execs it,
  so the plugin-free macOS path was broken for every npm install; the tarball also
  shipped `.eslintrc.cjs`, now ignored. A handshake alone would not have caught it —
  the server only reaches for the proxy when it runs a script — so `verify:pack`
  also asserts the required runtime files are in the tarball. CI now pins
  `checkout`/`setup-node` to commit SHAs (v5, which also drops the deprecated Node
  20 action runtime from G8), cancels superseded runs via `concurrency`, runs
  read-only, and checks packaging in a separate job. A conventional-PR-title check
  was added with no third-party action, because the title is already in the event
  payload. Every new check was demonstrated failing for the right reason: lint on a
  planted unused variable, `verify:tool-counts` on a badge and description set to
  191, `verify:pack` on the reinstated `bridge-proxy.mjs` exclusion, and the title
  pattern on `Update stuff`.
- **2026-10-14** — **S3 landed** (verification tools), with two scope cuts the
  plan itself licensed. **`document_getCapabilities` deferred**: the plan said to
  ship it only if S2's contract referenced it, and S2 does not — no consumer, so
  no tool. **`document_id` on mutating tools deferred**: `app.activeDocument` is
  written inline in 191 places across 33 handlers with no shared resolver, so the
  plan's "optional" qualifier is doing real work — that is a refactor, not an
  increment, and doing it half-way would be worse than not doing it. What landed:
  **`document_getState`** (one round-trip for state the model otherwise assembles
  from four tools) and **`preview_document`** extended with `documentIndex` and a
  4 MB output cap that re-exports at a fitting resolution before it fails.
  `preview_document` also no longer swallows its own errors into prose — the one
  seam S1a left open, because that handler caught its own exceptions. Page
  selection in preview was already present; the plan listed it as a gap and was
  wrong. Tool count 194 → 195, propagated by hand across the README, the package
  description, the smoke test and both guards; the inventory guard then caught the
  README handler-table row the hand-propagation missed, which is the guard working
  as designed. **G13 resolved on the maintainer's call:** `document_close` now
  defaults `saveOptions` to `"no"` — the only default that cannot raise a modal
  dialog ('ask' prompts, and 'yes' prompts for a never-saved document).
  Verified without InDesign by driving the real server over stdio: 195 tools, the
  new tool listed, the new preview field present, and `document_close`'s schema
  default now `"no"`.
- **2026-10-14** — **S2 landed** (the workflow contract), ahead of S3. The plan
  sequenced S2 after S3 only for the `document_id` "pin the document" phrasing;
  everything else stands alone, so waiting on S3 would have withheld the plan's
  self-declared highest-leverage change for no reason. Phrased the pinning rule
  around `document_listOpen` and "ask which document" instead, so the contract
  references no unshipped capability. `INDESIGN_MCP_INSTRUCTIONS` is wired into
  the **second** `McpServer` argument (`{name, version}`, `{instructions}`), as
  the SDK requires. Proven live without InDesign: a spawned server answers
  `initialize` with the contract present, 2436 chars ≈ 609 tokens. Also
  corrected a v2 error of fact: the undo tools are `undo_beginGroup` /
  `undo_endGroup`, not `undo_startGroup`.
- **2026-10-14** — **S1 landed, error path only (S1a).** Split S1 in two after
  establishing where the risk is: the success-shape change is the dangerous half
  (105 `JSON.parse` sites in the handler tests read fields off the top level),
  while the error path is genuinely additive — `isError: true` already existed
  and the single assertion on error text is `toContain`, not exact. Built
  `src/errors/envelope.ts` and wired it into the two seams that actually carry
  failures: `withErrorHandling` (all 194 tools) and `formatResponse`
  (ExtendScript errors). `formatErrorResponse` turned out to be dead code
  (0 callers) and was left untouched rather than put at risk. **F15 was wrong:**
  the review said `withErrorHandling` needed the tool name threaded through it;
  it does not, because the suggestion derives from the error pattern and not
  from the caller — so all 194 call sites are unchanged and the 194-edit diff the
  review implied never materialised. 60 files / 1002 tests green; the new
  contract guard was demonstrated failing for the right reason (a deliberately
  broken suggestion) and restored. The live smoke check was strengthened to
  assert a structured envelope, but **could not be verified live** — InDesign was
  closed at the time. **Success-shape change (S1b) deferred** pending the
  maintainer's flag decision (open question 4).
- **2026-10-14** — v1 → v2 after adversarial review. Corrected three false gap
  claims (G3 preview, G10 docs, G12 packaging), fixed the critical path and the
  parallelisable set, removed the false "chunker carries image shape" premise
  behind S3, rebased S3 on the existing `preview_document`, fixed the
  `McpServer` construction in S2, reduced S4 from six recipes to two with a
  measurement gate, and moved prompts / i18n / web UI to *Deferred*. Added
  G13 (`saveOptions` default disagreement), found during the review.

## Open questions for the maintainer

1. **G13 — `saveOptions` defaults disagree.** `document_save` defaults `yes`,
   `document_close` defaulted `ask`; the latter hangs InDesign on a modal dialog.
   **Resolved 2026-10-14: aligned on `no` for `document_close`.** `'ask'` and
   `'yes'` are both unsafe there — `'ask'` opens a modal save dialog and `'yes'`
   opens Save As for a document that has never been saved, and both block the
   script until the bridge times out with InDesign left wedged, while closing
   without saving never prompts. A caller that wants the work kept has to call
   `document_save` first. The remaining asymmetry with `document_save`'s `'yes'`
   is deliberate: saving is that tool's whole purpose, prompting is not.
   `src/schemas/index.ts` carries the reasoning inline; the README and the
   published docs were corrected off the old "defaults to `ask`" text; and
   `npm run smoke:macos` now closes a *dirty* document with `saveOptions`
   deliberately omitted, so a regression to a prompting value fails live instead
   of hanging the next person's InDesign.
2. **npm publishing.** S5 needs your credentials. S6 and S9 are gated behind it.
3. **Windows machine.** S10's second half needs one. Without it, G11 stays open.
4. **S1 scope.** Do you accept the response-shape change for all 197 tools, or should it land behind a config flag for one release?
   **Resolved 2026-10-14: behind a config flag for one release.** The failure
   envelope (S1a) is always on and additive. The success shape (S1b) ships behind
   `responseEnvelope.success` / `RESPONSE_ENVELOPE_SUCCESS`, default **off**; when
   on, object results are spread (`{ ok: true, ... }`) so `parsed.name` keeps
   working and the eventual flip to default is cheap. See the mutation entry below.

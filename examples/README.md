# Client configs

Copy-paste configs for the MCP hosts people actually wire this server into.
Each one starts the server over stdio; the server then listens for the InDesign
bridge on `127.0.0.1:8120`.

| Client | File | Goes to |
|---|---|---|
| Claude Desktop (macOS) | [`claude-desktop.json`](claude-desktop.json) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | [`claude-desktop.windows.json`](claude-desktop.windows.json) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | [`cursor.json`](cursor.json) | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project) |
| Claude Code | [`claude-code.md`](claude-code.md) | one `claude mcp add` command, or a project `.mcp.json` |

## The path

**The package is not published to npm yet**, so the configs point at a local
build and each one contains the placeholder `/ABSOLUTE/PATH/TO/adobe-indesign-mcp`.
Replace it with where you cloned the repository — the same directory the Quick
Start in the top-level README builds in:

```bash
git clone https://github.com/nutriandrea/adobe-indesign-mcp
cd adobe-indesign-mcp
npm install && npm run build
pwd   # <- put this path in place of /ABSOLUTE/PATH/TO/adobe-indesign-mcp
```

The path must be absolute. `dist/index.js` has to exist, which is what
`npm run build` produces.

### Once the package is published

When `indesign-nutria-mcp` is on npm, the same configs drop the local path for
the published runner — no clone, no build:

```json
{
  "mcpServers": {
    "indesign": {
      "command": "npx",
      "args": ["-y", "indesign-nutria-mcp"]
    }
  }
}
```

Until then that command fails, which is why the checked-in examples do not use
it.

## Connect InDesign

A config alone gets you a server that starts and answers `tools/list`. To make
InDesign answer, one bridge has to be running:

- **macOS, no panel:** `./start-bridge.sh` from the clone
- **macOS, UXP panel:** load `plugin/` in the UXP Developer Tool and open the
  **MCP Bridge** panel
- **Windows:** the `COM_BRIDGE_ENABLED=true` env var in the config above

`document_listOpen` is the cheap way to confirm the bridge is live: if it
returns a document list, the whole path works.

## Validating a config

`tests/unit/distributionManifests.test.ts` parses every `.json` in this
directory and asserts each declares a single `indesign` server with a `command`
and `args`, so a broken example fails `npm test` rather than a user's first run.

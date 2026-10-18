# Claude Code

Claude Code reads MCP servers from a project-scoped `.mcp.json` or from
`claude mcp add`. Both take the same command the other clients use.

## Option A — one command

```bash
claude mcp add indesign -- node /ABSOLUTE/PATH/TO/adobe-indesign-mcp/dist/index.js
```

## Option B — project `.mcp.json`

Drop this in the project you run Claude Code from (it is `examples/claude-desktop.json`
with the same `mcpServers` shape):

```json
{
  "mcpServers": {
    "indesign": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/adobe-indesign-mcp/dist/index.js"]
    }
  }
}
```

On Windows, pass the COM bridge flag too:

```json
{
  "mcpServers": {
    "indesign": {
      "command": "node",
      "args": ["C:\\ABSOLUTE\\PATH\\TO\\adobe-indesign-mcp\\dist\\index.js"],
      "env": { "COM_BRIDGE_ENABLED": "true" }
    }
  }
}
```

See [`README.md`](README.md) in this directory for the path to use and for the
`npx` form that applies once the package is published.

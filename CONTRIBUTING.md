# Contributing

Thanks for considering contributing to indesign-nutria-mcp!

For the build/test/live-test workflow, see [docs/development.md](docs/development.md).

## How to add a new tool

1. Find the right handler in `src/handlers/` or create a new one
2. Add a tool definition with Zod schema
3. Implement the handler method
4. Register in `IndesignMcpServer.ts`
5. Add a unit test in `tests/unit/handlers/`
6. Run `npm run verify` (lint + tool counts + tests) and `npm run docs:tools`
   if the tool list changed

## Guidelines

- **One tool per concern** — don't combine unrelated operations
- **Composable** — tools should work as building blocks for AI agents
- **Safe** — validate inputs with Zod, wrap ExtendScript in try/catch
- **Tested** — every tool needs at least one test case
- **TypeScript strict** — full strict mode, no `any` where avoidable

## PR process

1. Fork the repo
2. Create a feature branch
3. Open a PR with a clear description
4. CI must pass
5. Get a review

## Code of conduct

Be excellent to each other.

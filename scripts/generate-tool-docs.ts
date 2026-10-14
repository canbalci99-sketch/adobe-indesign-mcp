/**
 * Regenerates docs/available-tools.md from the live registry.
 *
 * The tool list is the one thing a user actually reads before wiring an agent
 * up, and it is also the thing that goes stale the moment someone adds a tool.
 * Rather than hand-maintain a second copy of the catalog — the failure mode
 * that already shipped 183/191/194 at once — this renders the same registry the
 * server exposes over `mcp://tools/inventory`.
 *
 *   npm run docs:tools            # write docs/available-tools.md
 *   npm run docs:tools -- --check # exit 1 if the file on disk is stale
 *
 * CI runs the --check form, so the published list cannot drift from the code.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHandlers, type HandlerTools } from '../tests/helpers/loadHandlers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(root, 'docs', 'available-tools.md');

/** Human-facing handler name: `DocumentHandler` -> `Document`. */
function label(handler: string): string {
  return handler.replace(/Handler$/, '');
}

/** GitHub heading anchor for a plain-word heading. */
function anchor(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-');
}

/** Collapse whitespace and escape the one character that would break a table. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

export function render(handlers: HandlerTools[]): string {
  const total = handlers.reduce((sum, h) => sum + h.tools.length, 0);
  const out: string[] = [];

  out.push('# Available tools');
  out.push('');
  out.push('> **Generated file — do not edit by hand.**');
  out.push('> Regenerate with `npm run docs:tools`. CI (`npm run verify:docs`) fails');
  out.push('> the build if this file no longer matches the registry.');
  out.push('');
  out.push(
    `**${total} tools across ${handlers.length} handlers.** This is the live registry — ` +
      'the same list the server serves over `mcp://tools/inventory`.',
  );
  out.push('');
  out.push('## Contents');
  out.push('');
  for (const h of handlers) {
    const name = label(h.name);
    out.push(`- [${name}](#${anchor(name)}) — ${h.tools.length}`);
  }
  out.push('');
  for (const h of handlers) {
    const name = label(h.name);
    out.push(`## ${name}`);
    out.push('');
    out.push(`_${h.tools.length} tools_`);
    out.push('');
    out.push('| Tool | Description |');
    out.push('|------|-------------|');
    for (const t of h.tools) {
      out.push(`| \`${t.name}\` | ${cell(t.description)} |`);
    }
    out.push('');
  }

  return out.join('\n').replace(/\n+$/, '\n');
}

async function main(): Promise<void> {
  const handlers = await loadHandlers();
  const generated = render(handlers);
  const check = process.argv.includes('--check');

  if (check) {
    let current = '';
    try {
      current = readFileSync(OUTPUT, 'utf-8');
    } catch {
      console.error(`docs/available-tools.md is missing. Run: npm run docs:tools`);
      process.exit(1);
    }
    if (current !== generated) {
      const total = handlers.reduce((sum, h) => sum + h.tools.length, 0);
      console.error(
        'docs/available-tools.md is out of date with the registry ' +
          `(${total} tools across ${handlers.length} handlers). Run: npm run docs:tools`,
      );
      process.exit(1);
    }
    console.log('docs/available-tools.md matches the registry');
    return;
  }

  writeFileSync(OUTPUT, generated, 'utf-8');
  const total = handlers.reduce((sum, h) => sum + h.tools.length, 0);
  console.log(
    `wrote docs/available-tools.md — ${total} tools across ${handlers.length} handlers`,
  );
}

main().catch((err) => {
  console.error('generate-tool-docs failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

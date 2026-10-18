/**
 * Every place the version is written must agree with package.json.
 *
 * The advertised version is what a host, a bug report and a support thread all
 * use to identify which build is running, and a stale one is worse than a
 * missing one because it looks authoritative. It had already drifted by four
 * releases: a 1.4.2 build answered `initialize` with `version: "1.0.0"`, and the
 * UXP panel was stamped with the same dead string. There is no reading of
 * package.json at startup — `SERVER_VERSION` is a literal so that nothing has to
 * touch disk to answer `initialize` — so a release has one more step, and this
 * is the gate that makes forgetting it fail loudly instead of quietly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { loadConfig, SERVER_VERSION } from '../../src/utils/configLoader.js';

const readJson = (relativePath: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8'),
  ) as Record<string, unknown>;

const pkg = readJson('../../package.json') as { version: string };
const pluginManifest = readJson('../../plugin/manifest.json') as { version: string };
const mcpbManifest = readJson('../../mcpb/manifest.json') as { version: string };

describe('the advertised version', () => {
  it('matches package.json', () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it('is what a config file that omits server.version resolves to', () => {
    // The shipped config used to hardcode `1.0.0`, which is how a user who
    // followed the README ended up reporting a four-release-old version. It now
    // states nothing and inherits the real one.
    const shipped = fileURLToPath(new URL('../../indesign-nutria-mcp.json', import.meta.url));
    expect(loadConfig(shipped).server.version).toBe(pkg.version);
    expect(loadConfig().server.version).toBe(pkg.version);
  });

  it('is the same version the UXP panel is stamped with', () => {
    expect(pluginManifest.version).toBe(pkg.version);
  });

  it('is the same version the MCP bundle is stamped with', () => {
    // server.json is generated from package.json so it cannot drift on its own;
    // this manifest is hand-written, which is exactly the kind that does.
    expect(mcpbManifest.version).toBe(pkg.version);
  });
});

/**
 * Error-recovery contract.
 *
 * An error envelope is only useful if the agent can act on it. A
 * `suggested_next_tool` that names a tool the server does not expose sends the
 * host into a second failure and burns the turn the hint was meant to save —
 * which is worse than no hint at all.
 *
 * This test holds the suggestion table against the live registry, so the two
 * cannot drift: rename or remove a tool and this fails before a user does.
 */
import { describe, it, expect } from 'vitest';
import { suggestedTools } from '../../src/errors/envelope.js';
import { loadToolNames } from '../helpers/loadHandlers.js';

describe('error-recovery contract', () => {
  it('only ever suggests tools that are actually registered', async () => {
    const [suggested, registered] = await Promise.all([
      Promise.resolve(suggestedTools()),
      loadToolNames(),
    ]);
    const known = new Set(registered);

    const dangling = suggested.filter((name) => !known.has(name));
    expect(
      dangling,
      `Error envelopes point at unregistered tools: ${dangling.join(', ')}. ` +
        'Either the tool was renamed/removed, or the suggestion table in ' +
        'src/errors/envelope.ts is wrong.',
    ).toEqual([]);
  });

  it('suggests at least one remedy, or the table is pointless', () => {
    expect(suggestedTools().length).toBeGreaterThan(0);
  });
});

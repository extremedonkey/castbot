// Tests for the one-map-build-at-a-time gate (mapExplorer.js tryBeginMapBuild/endMapBuild).
// Pure logic replicated inline per TestingStandards.md (mapExplorer.js imports sharp/discord.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MAP_BUILD_STALE_MS = 20 * 60 * 1000;

function makeGate(clock) {
  let activeMapBuild = null;
  return {
    tryBegin(guildId) {
      if (activeMapBuild && clock.now() - activeMapBuild.startedAt < MAP_BUILD_STALE_MS) {
        return { busy: true, minutesAgo: Math.round((clock.now() - activeMapBuild.startedAt) / 60000) };
      }
      activeMapBuild = { guildId, startedAt: clock.now() };
      return { busy: false };
    },
    end() { activeMapBuild = null; },
    active: () => activeMapBuild
  };
}

describe('Map build gate — one build at a time', () => {
  it('second build while one is active is rejected with minutes-ago', () => {
    const clock = { t: 1_000_000, now() { return this.t; } };
    const gate = makeGate(clock);
    assert.equal(gate.tryBegin('guildA').busy, false);
    clock.t += 5 * 60 * 1000;
    const second = gate.tryBegin('guildB');
    assert.equal(second.busy, true);
    assert.equal(second.minutesAgo, 5);
  });

  it('release clears the gate for the next build', () => {
    const clock = { t: 0, now() { return this.t; } };
    const gate = makeGate(clock);
    gate.tryBegin('guildA');
    gate.end();
    assert.equal(gate.tryBegin('guildB').busy, false);
  });

  it('a build older than 20 min is treated as crashed — new build proceeds and re-acquires', () => {
    const clock = { t: 0, now() { return this.t; } };
    const gate = makeGate(clock);
    gate.tryBegin('guildA');
    clock.t += MAP_BUILD_STALE_MS + 1;
    assert.equal(gate.tryBegin('guildB').busy, false);
    assert.equal(gate.active().guildId, 'guildB', 'stale entry replaced by the new build');
  });

  it('just under the stale threshold still rejects', () => {
    const clock = { t: 0, now() { return this.t; } };
    const gate = makeGate(clock);
    gate.tryBegin('guildA');
    clock.t += MAP_BUILD_STALE_MS - 1;
    assert.equal(gate.tryBegin('guildB').busy, true);
  });

  it('same guild is also rejected while its own build runs (double-submit guard)', () => {
    const clock = { t: 0, now() { return this.t; } };
    const gate = makeGate(clock);
    gate.tryBegin('guildA');
    assert.equal(gate.tryBegin('guildA').busy, true);
  });
});

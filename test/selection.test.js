import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseSeedServer,
  collectServers,
  getAutoseedTransition,
  getSeedProgress,
  isAvailableSeedServer,
  isFreshSnapshot
} from "../site/selection.js";

const NOW = Date.parse("2026-07-25T10:00:00.000Z");

test("fresh snapshot rejects stale or failed data", () => {
  assert.equal(isFreshSnapshot({ success: true, stale: false, timestamp: NOW - 1000 }, NOW, 90000), true);
  assert.equal(isFreshSnapshot({ success: true, stale: true, timestamp: NOW }, NOW, 90000), false);
  assert.equal(isFreshSnapshot({ success: true, stale: false, timestamp: NOW - 90001 }, NOW, 90000), false);
});

test("strict priority switches #1 -> #2 at 80 and returns on unseed", () => {
  const first = {
    code: "phex-1",
    priority: 10,
    fresh: true,
    online: true,
    isSeedCandidate: true,
    playerCount: 79,
    maxPlayers: 100,
    seedLimit: 80
  };
  const second = {
    code: "phex-2",
    priority: 20,
    fresh: true,
    online: true,
    isSeedCandidate: true,
    playerCount: 25,
    maxPlayers: 100,
    seedLimit: 80
  };

  assert.equal(chooseSeedServer([first, second]).code, "phex-1");
  assert.equal(chooseSeedServer([{ ...first, playerCount: 80 }, second]).code, "phex-2");
  assert.equal(chooseSeedServer([{ ...first, playerCount: 74 }, second]).code, "phex-1");
});

test("offline, stale, threshold and non-candidate servers cannot be selected", () => {
  const base = {
    priority: 10,
    fresh: true,
    online: true,
    isSeedCandidate: true,
    playerCount: 50,
    maxPlayers: 100,
    seedLimit: 80
  };
  assert.equal(isAvailableSeedServer(base), true);
  assert.equal(isAvailableSeedServer({ ...base, online: false }), false);
  assert.equal(isAvailableSeedServer({ ...base, fresh: false }), false);
  assert.equal(isAvailableSeedServer({ ...base, isSeedCandidate: false }), false);
  assert.equal(isAvailableSeedServer({ ...base, playerCount: 79 }), true);
  assert.equal(isAvailableSeedServer({ ...base, playerCount: 80 }), false);
});

test("seed progress is calculated against 80 and tracks unseed", () => {
  const base = { playerCount: 80, maxPlayers: 100, seedLimit: 80 };
  assert.deepEqual(getSeedProgress(base), {
    playerCount: 80,
    seedLimit: 80,
    percentage: 100,
    reached: true
  });
  assert.deepEqual(getSeedProgress({ ...base, playerCount: 64 }), {
    playerCount: 64,
    seedLimit: 80,
    percentage: 80,
    reached: false
  });
});

test("autoseed redirects only when its selected target changes", () => {
  assert.equal(getAutoseedTransition(false, "phex-1", null), "disabled");
  assert.equal(getAutoseedTransition(true, null, "phex-1"), "waiting");
  assert.equal(getAutoseedTransition(true, "phex-1", null), "redirect");
  assert.equal(getAutoseedTransition(true, "phex-1", "phex-1"), "unchanged");
  assert.equal(getAutoseedTransition(true, "phex-2", "phex-1"), "redirect");
  assert.equal(getAutoseedTransition(true, "phex-1", "phex-2"), "redirect");
});

test("snapshot and page config are joined by stable server code", () => {
  const config = {
    staleAfterMs: 90000,
    maxSeedPlayers: 80,
    exporters: [
      {
        code: "mix",
        name: "Fallback",
        priority: 10,
        snapshotUrl: "https://example.org/snapshot",
        joinLinkUrl: "https://example.org/join-link"
      }
    ]
  };
  const rows = collectServers(
    [
      {
        ok: true,
        snapshot: {
          success: true,
          stale: false,
          timestamp: NOW,
          servers: [
            {
              code: "mix",
              name: "Mix Server",
              online: true,
              isSeedCandidate: true,
              playerCount: 20,
              maxPlayers: 100,
              queueLength: 2
            }
          ]
        }
      }
    ],
    config,
    NOW
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Mix Server");
  assert.equal(rows[0].priority, 10);
  assert.equal(rows[0].seedLimit, 80);
  assert.equal(rows[0].joinLinkUrl, "https://example.org/join-link");
});

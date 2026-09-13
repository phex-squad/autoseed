export const AUTOSEED_CONFIG = Object.freeze({
  refreshIntervalMs: 180000,
  staleAfterMs: 90000,
  maxSeedPlayers: 80,
  exporters: [
    {
      code: "phex-1",
      name: "[RU][#1] PHEX | ФЕНИКС",
      priority: 10,
      snapshotUrl: "https://api.bss.games/phex1/v1/autoseed/snapshot",
      joinLinkUrl: "https://api.bss.games/phex1/v1/autoseed/join-link"
    },
    {
      code: "phex-2",
      name: "[RU][#2] PHEX | ФЕНИКС",
      priority: 20,
      snapshotUrl: "https://api.bss.games/phex2/v1/autoseed/snapshot",
      joinLinkUrl: "https://api.bss.games/phex2/v1/autoseed/join-link"
    }
  ]
});

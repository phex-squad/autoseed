export const AUTOSEED_CONFIG = Object.freeze({
  refreshIntervalMs: 15000,
  staleAfterMs: 90000,
  maxSeedPlayers: 80,
  exporters: [
    {
      code: "phex-1",
      name: "[RU][#1] PHEX | ФЕНИКС",
      priority: 10,
      snapshotUrl: "https://api.squad.leo-land.ru/phex1/v1/autoseed/snapshot",
      joinLinkUrl: "https://api.squad.leo-land.ru/phex1/v1/autoseed/join-link"
    },
    {
      code: "phex-2",
      name: "[RU][#2] PHEX | ФЕНИКС",
      priority: 20,
      snapshotUrl: "https://api.squad.leo-land.ru/phex2/v1/autoseed/snapshot",
      joinLinkUrl: "https://api.squad.leo-land.ru/phex2/v1/autoseed/join-link"
    }
  ]
});

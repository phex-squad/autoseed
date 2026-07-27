function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const DEFAULT_MAX_SEED_PLAYERS = 80;

function seedLimit(value) {
  return Math.max(1, finiteNumber(value, DEFAULT_MAX_SEED_PLAYERS));
}

export function isFreshSnapshot(snapshot, now, staleAfterMs) {
  const timestamp = finiteNumber(snapshot?.timestamp, 0);
  return (
    snapshot?.success === true &&
    snapshot?.stale !== true &&
    timestamp > 0 &&
    now - timestamp <= staleAfterMs
  );
}

export function collectServers(results, config, now = Date.now()) {
  const staleAfterMs = Math.max(1000, finiteNumber(config?.staleAfterMs, 90000));
  const configuredSeedLimit = seedLimit(config?.maxSeedPlayers);
  const exporters = Array.isArray(config?.exporters) ? config.exporters : [];
  const rows = [];

  for (let index = 0; index < exporters.length; index += 1) {
    const exporter = exporters[index];
    const result = results[index];
    const snapshot = result?.ok ? result.snapshot : null;
    const fresh = isFreshSnapshot(snapshot, now, staleAfterMs);
    const servers = Array.isArray(snapshot?.servers) ? snapshot.servers : [];

    if (servers.length === 0) {
      rows.push({
        code: exporter.code,
        name: exporter.name || exporter.code,
        priority: finiteNumber(exporter.priority, 1000),
        snapshotUrl: exporter.snapshotUrl,
        joinLinkUrl: exporter.joinLinkUrl,
        online: false,
        fresh: false,
        playerCount: 0,
        maxPlayers: 0,
        seedLimit: configuredSeedLimit,
        queueLength: 0,
        isSeedCandidate: false,
        error: result?.error || "Экспортёр не вернул сервер"
      });
      continue;
    }

    for (const server of servers) {
      const code = String(server?.code || exporter.code || "");
      if (exporter.code && code !== exporter.code) continue;
      rows.push({
        code,
        name: String(server?.name || exporter.name || code),
        priority: finiteNumber(exporter.priority, 1000),
        snapshotUrl: exporter.snapshotUrl,
        joinLinkUrl: exporter.joinLinkUrl,
        online: fresh && server?.online === true,
        fresh,
        playerCount: Math.max(0, finiteNumber(server?.playerCount, 0)),
        maxPlayers: Math.max(0, finiteNumber(server?.maxPlayers, 0)),
        seedLimit: configuredSeedLimit,
        queueLength: Math.max(0, finiteNumber(server?.queueLength, 0)),
        currentLayer: server?.currentLayer || null,
        isSeedCandidate: server?.isSeedCandidate === true,
        error: result?.error || null
      });
    }
  }

  return rows;
}

export function isAvailableSeedServer(server) {
  const underSeedLimit = server.playerCount < seedLimit(server.seedLimit);
  const hasRoom = server.maxPlayers <= 0 || server.playerCount < server.maxPlayers;
  return server.fresh && server.online && server.isSeedCandidate && underSeedLimit && hasRoom;
}

export function isJoinableServer(server) {
  return server?.fresh === true && server?.online === true;
}

export function getSeedProgress(server) {
  const playerCount = Math.max(0, finiteNumber(server?.playerCount, 0));
  const limit = seedLimit(server?.seedLimit);
  return {
    playerCount,
    seedLimit: limit,
    percentage: Math.min(100, Math.round((playerCount / limit) * 100)),
    reached: playerCount >= limit
  };
}

export function getAutoseedTransition(enabled, targetCode, activeCode) {
  if (!enabled) return "disabled";
  if (!targetCode) return "waiting";
  return targetCode === activeCode ? "unchanged" : "redirect";
}

export function chooseSeedServer(servers) {
  return servers
    .filter(isAvailableSeedServer)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        right.playerCount - left.playerCount ||
        left.code.localeCompare(right.code)
    )[0] || null;
}

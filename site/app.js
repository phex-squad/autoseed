import { AUTOSEED_CONFIG } from "./config.js";
import {
  chooseSeedServer,
  collectServers,
  getAutoseedTransition,
  getSeedProgress,
  isAvailableSeedServer,
  isJoinableServer
} from "./selection.js";

const nodes = {
  status: document.querySelector("#status"),
  refresh: document.querySelector("#refresh"),
  grid: document.querySelector("#server-grid"),
  template: document.querySelector("#server-card-template"),
  heroJoin: document.querySelector("#hero-join"),
  recommendationState: document.querySelector("#recommendation-state"),
  recommended: document.querySelector("#recommended"),
  recommendedKicker: document.querySelector("#recommended-kicker"),
  recommendedNote: document.querySelector("#recommended-note"),
  recommendedPlayers: document.querySelector("#recommended-players"),
  recommendedQueue: document.querySelector("#recommended-queue")
};

let recommendedServer = null;
let refreshing = false;
let latestServers = [];
let autoseedEnabled = false;
let autoseedInFlight = false;
let activeAutoseedCode = null;
let connectorWindow = null;

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function readableLayer(value) {
  if (!value) return "Ожидаем карту";
  return String(value).replaceAll("_", " · ");
}

function serverNumber(code) {
  const match = String(code).match(/(\d+)$/);
  return match ? `Сервер №${match[1]}` : "Сервер";
}

function serverState(server) {
  if (server.error === "Экспортёр ещё не подключён") {
    return { label: "Настраивается", kind: "pending" };
  }
  if (server.fresh && server.online) {
    return { label: "В сети", kind: "online" };
  }
  return { label: "Нет свежих данных", kind: "offline" };
}

function updateAutoseedButton(trackable) {
  nodes.heroJoin.textContent = autoseedEnabled ? "Остановить автосид" : "Запустить автосид";
  nodes.heroJoin.setAttribute("aria-pressed", String(autoseedEnabled));
  nodes.heroJoin.disabled = autoseedEnabled ? false : !trackable;
}

function openConnectorWindow() {
  const connectorUrl = new URL("./connector.html", window.location.href);
  const opened = window.open(
    connectorUrl.href,
    "phex-autoseed-connector",
    "popup=yes,width=480,height=420"
  );
  if (!opened) return null;
  opened.focus();
  return opened;
}

function closeConnectorWindow() {
  if (connectorWindow && !connectorWindow.closed) {
    try {
      connectorWindow.close();
    } catch {
      // Закрытие служебного окна зависит от браузера.
    }
  }
  connectorWindow = null;
}

function disableAutoseed(message = "Автосид остановлен.") {
  autoseedEnabled = false;
  autoseedInFlight = false;
  activeAutoseedCode = null;
  closeConnectorWindow();
  updateAutoseedButton(latestServers.some(isJoinableServer));
  nodes.status.textContent = message;
}

async function fetchSnapshot(exporter) {
  const url = safeHttpsUrl(exporter.snapshotUrl);
  if (!url) return { ok: false, error: "Экспортёр ещё не подключён" };

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) return { ok: false, error: `Экспортёр ответил HTTP ${response.status}` };
    return { ok: true, snapshot: await response.json() };
  } catch {
    return { ok: false, error: "Нет связи с экспортёром" };
  }
}

async function requestJoinLink(server) {
  const url = safeHttpsUrl(server?.joinLinkUrl);
  if (!url) throw new Error("join-link is not configured");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const payload = await response.json();
  if (!response.ok || typeof payload?.joinLink !== "string") {
    throw new Error("join-link unavailable");
  }
  const joinUrl = new URL(payload.joinLink);
  if (joinUrl.protocol !== "steam:") throw new Error("unexpected protocol");
  return joinUrl;
}

async function joinServer(server, button) {
  button.disabled = true;
  nodes.status.textContent = `Получаю безопасную ссылку для ${server.name}…`;
  try {
    const joinUrl = await requestJoinLink(server);
    nodes.status.textContent = `Открываю ${server.name} в Steam…`;
    window.location.assign(joinUrl.href);
  } catch {
    nodes.status.textContent = "Не удалось получить ссылку. Попробуйте ещё раз.";
  } finally {
    button.disabled = !isJoinableServer(server);
  }
}

async function syncAutoseed(target) {
  if (autoseedEnabled && (!connectorWindow || connectorWindow.closed)) {
    disableAutoseed("Служебное окно закрыто. Запустите автосид повторно.");
    return;
  }

  const transition = getAutoseedTransition(
    autoseedEnabled,
    target?.code || null,
    activeAutoseedCode
  );
  if (transition === "disabled" || autoseedInFlight) return;
  if (transition === "unchanged") {
    nodes.status.textContent =
      `Автосид отслеживает ${target.name} и ждёт изменения точки сбора.`;
    return;
  }
  if (transition === "waiting") {
    nodes.status.textContent =
      `Автосид включён: жду рассида ниже ${AUTOSEED_CONFIG.maxSeedPlayers} игроков.`;
    return;
  }

  autoseedInFlight = true;
  nodes.status.textContent = `Автосид переключается на ${target.name}…`;
  try {
    const joinUrl = await requestJoinLink(target);
    connectorWindow.location.assign(joinUrl.href);
    connectorWindow.focus();
    activeAutoseedCode = target.code;
    nodes.status.textContent =
      `Автосид отслеживает ${target.name} и ждёт изменения точки сбора.`;
  } catch {
    nodes.status.textContent =
      `Не удалось переключиться на ${target.name}. Повторю после обновления данных.`;
  } finally {
    autoseedInFlight = false;
  }
}

function renderCard(server, recommended) {
  const card = nodes.template.content.firstElementChild.cloneNode(true);
  const state = serverState(server);
  const seedAvailable = isAvailableSeedServer(server);
  const joinable = isJoinableServer(server);
  const progress = getSeedProgress(server);

  card.dataset.state = state.kind;
  card.dataset.recommended = String(recommended);
  card.dataset.seeded = String(progress.reached);
  card.querySelector(".server-number").textContent = serverNumber(server.code);
  card.querySelector(".server-status").textContent = state.label;
  card.querySelector(".server-name").textContent = server.name;
  card.querySelector(".player-count").textContent = String(server.playerCount);
  card.querySelector(".player-capacity").textContent =
    `из ${progress.seedLimit} до рассида · ${server.maxPlayers || "—"} мест`;
  const progressTrack = card.querySelector(".population-track");
  progressTrack.dataset.complete = String(progress.reached);
  progressTrack.setAttribute(
    "aria-valuenow",
    String(Math.min(progress.playerCount, progress.seedLimit))
  );
  progressTrack.setAttribute("aria-valuemax", String(progress.seedLimit));
  progressTrack.setAttribute(
    "aria-label",
    `Прогресс рассида: ${progress.playerCount} из ${progress.seedLimit}`
  );
  progressTrack.querySelector("span").style.width = `${progress.percentage}%`;
  card.querySelector(".server-layer").textContent = readableLayer(server.currentLayer);
  card.querySelector(".server-queue").textContent = server.fresh
    ? String(server.queueLength)
    : "—";

  const button = card.querySelector(".card-action");
  button.textContent = recommended
    ? "Подключиться на точку сбора"
    : seedAvailable
      ? "Подключиться"
      : "Подключиться напрямую";
  button.disabled = !joinable;
  button.addEventListener("click", () => joinServer(server, button));
  return card;
}

function renderRecommendation(servers) {
  recommendedServer = chooseSeedServer(servers);
  const allPending =
    servers.length > 0 && servers.every((server) => server.error === "Экспортёр ещё не подключён");
  const trackable = servers.some(
    (server) => isJoinableServer(server) && server.isSeedCandidate
  );
  const liveCandidates = servers.filter(
    (server) => isJoinableServer(server) && server.isSeedCandidate
  );
  const seedLimitReached =
    liveCandidates.length > 0 && liveCandidates.every((server) => !isAvailableSeedServer(server));
  updateAutoseedButton(trackable);

  if (recommendedServer) {
    nodes.recommendationState.textContent = "В сети";
    nodes.recommendationState.dataset.kind = "online";
    nodes.recommendedKicker.textContent = "Сейчас собираемся на";
    nodes.recommended.textContent = recommendedServer.name;
    nodes.recommendedNote.textContent =
      `Первый доступный сервер в очереди PHEX ниже порога ${recommendedServer.seedLimit}.`;
    nodes.recommendedPlayers.textContent = String(recommendedServer.playerCount);
    nodes.recommendedQueue.textContent = String(recommendedServer.queueLength);
    return;
  }

  nodes.recommendedPlayers.textContent = "—";
  nodes.recommendedQueue.textContent = "—";

  if (allPending) {
    nodes.recommendationState.textContent = "Подготовка";
    nodes.recommendationState.dataset.kind = "pending";
    nodes.recommendedKicker.textContent = "Система";
    nodes.recommended.textContent = "Готовится к запуску";
    nodes.recommendedNote.textContent =
      "Страница уже готова. Подключаем живые данные серверов и безопасный вход.";
    return;
  }

  if (seedLimitReached) {
    nodes.recommendationState.textContent = "Порог достигнут";
    nodes.recommendationState.dataset.kind = "online";
    nodes.recommendedKicker.textContent = "Сейчас";
    nodes.recommended.textContent = "Серверы рассидены";
    nodes.recommendedNote.textContent =
      `Автосид продолжает следить за онлайном и вернётся к первому серверу, ` +
      `который опустится ниже ${AUTOSEED_CONFIG.maxSeedPlayers}.`;
    return;
  }

  nodes.recommendationState.textContent = "Пауза";
  nodes.recommendationState.dataset.kind = "offline";
  nodes.recommendedKicker.textContent = "Прямо сейчас";
  nodes.recommended.textContent = "Нет доступной точки сбора";
  nodes.recommendedNote.textContent =
    "Серверы заполнены, выключены или давно не обновляли состояние.";
}

function render(servers) {
  latestServers = servers;
  const recommended = chooseSeedServer(servers);
  renderRecommendation(servers);
  nodes.grid.replaceChildren(
    ...servers.map((server) => renderCard(server, server.code === recommended?.code))
  );
  return recommended;
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  nodes.refresh.disabled = true;
  nodes.refresh.dataset.loading = "true";
  nodes.status.textContent = "Обновляю состояние серверов…";

  try {
    const results = await Promise.all(AUTOSEED_CONFIG.exporters.map(fetchSnapshot));
    const servers = collectServers(results, AUTOSEED_CONFIG);
    const recommended = render(servers);
    const pendingCount = servers.filter(
      (server) => server.error === "Экспортёр ещё не подключён"
    ).length;
    nodes.status.textContent =
      pendingCount === servers.length
        ? "Живые данные подключаются"
        : `Обновлено в ${new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit"
          })}`;
    await syncAutoseed(recommended);
  } finally {
    refreshing = false;
    nodes.refresh.disabled = false;
    delete nodes.refresh.dataset.loading;
  }
}

nodes.refresh.addEventListener("click", refresh);
nodes.heroJoin.addEventListener("click", () => {
  if (autoseedEnabled) {
    disableAutoseed();
    return;
  }

  connectorWindow = openConnectorWindow();
  if (!connectorWindow) {
    nodes.status.textContent =
      "Браузер заблокировал служебное окно. Разрешите всплывающие окна для автосида.";
    return;
  }

  autoseedEnabled = true;
  activeAutoseedCode = null;
  updateAutoseedButton(true);
  nodes.status.textContent =
    `Автосид включён: отслеживаю порог ${AUTOSEED_CONFIG.maxSeedPlayers} игроков.`;
  void syncAutoseed(recommendedServer);
});

window.addEventListener("beforeunload", closeConnectorWindow);

await refresh();
window.setInterval(refresh, Math.max(5000, Number(AUTOSEED_CONFIG.refreshIntervalMs) || 15000));

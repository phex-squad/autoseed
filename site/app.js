import { AUTOSEED_CONFIG } from "./config.js";
import { chooseSeedServer, collectServers, isAvailableSeedServer } from "./selection.js";

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

async function joinServer(server, button) {
  const url = safeHttpsUrl(server?.joinLinkUrl);
  if (!url) {
    nodes.status.textContent = "Подключение появится после настройки SquadBrowser.";
    return;
  }

  button.disabled = true;
  nodes.status.textContent = `Получаю безопасную ссылку для ${server.name}…`;
  try {
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
    nodes.status.textContent = `Открываю ${server.name} в Steam…`;
    window.location.assign(joinUrl.href);
  } catch {
    nodes.status.textContent = "Не удалось получить ссылку. Попробуйте ещё раз.";
  } finally {
    button.disabled = !isAvailableSeedServer(server);
  }
}

function renderCard(server, recommended) {
  const card = nodes.template.content.firstElementChild.cloneNode(true);
  const state = serverState(server);
  const available = isAvailableSeedServer(server);
  const percentage =
    server.maxPlayers > 0
      ? Math.min(100, Math.round((server.playerCount / server.maxPlayers) * 100))
      : 0;

  card.dataset.state = state.kind;
  card.dataset.recommended = String(recommended);
  card.querySelector(".server-number").textContent = serverNumber(server.code);
  card.querySelector(".server-status").textContent = state.label;
  card.querySelector(".server-name").textContent = server.name;
  card.querySelector(".player-count").textContent = String(server.playerCount);
  card.querySelector(".player-capacity").textContent = `из ${server.maxPlayers || "—"} игроков`;
  card.querySelector(".population-track span").style.width = `${percentage}%`;
  card.querySelector(".server-layer").textContent = readableLayer(server.currentLayer);
  card.querySelector(".server-queue").textContent = server.fresh
    ? String(server.queueLength)
    : "—";

  const button = card.querySelector(".card-action");
  button.textContent = recommended ? "Подключиться на сид" : "Подключиться";
  button.disabled = !available;
  button.addEventListener("click", () => joinServer(server, button));
  return card;
}

function renderRecommendation(servers) {
  recommendedServer = chooseSeedServer(servers);
  const allPending =
    servers.length > 0 && servers.every((server) => server.error === "Экспортёр ещё не подключён");

  if (recommendedServer) {
    nodes.recommendationState.textContent = "В сети";
    nodes.recommendationState.dataset.kind = "online";
    nodes.recommendedKicker.textContent = "Сейчас собираемся на";
    nodes.recommended.textContent = recommendedServer.name;
    nodes.recommendedNote.textContent =
      "Этот сервер выбран по очереди PHEX и готов принимать игроков.";
    nodes.recommendedPlayers.textContent = String(recommendedServer.playerCount);
    nodes.recommendedQueue.textContent = String(recommendedServer.queueLength);
    nodes.heroJoin.disabled = false;
    return;
  }

  nodes.heroJoin.disabled = true;
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

  nodes.recommendationState.textContent = "Пауза";
  nodes.recommendationState.dataset.kind = "offline";
  nodes.recommendedKicker.textContent = "Прямо сейчас";
  nodes.recommended.textContent = "Нет доступной точки сбора";
  nodes.recommendedNote.textContent =
    "Серверы заполнены, выключены или давно не обновляли состояние.";
}

function render(servers) {
  const recommended = chooseSeedServer(servers);
  renderRecommendation(servers);
  nodes.grid.replaceChildren(
    ...servers.map((server) => renderCard(server, server.code === recommended?.code))
  );
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
    render(servers);
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
  } finally {
    refreshing = false;
    nodes.refresh.disabled = false;
    delete nodes.refresh.dataset.loading;
  }
}

nodes.refresh.addEventListener("click", refresh);
nodes.heroJoin.addEventListener("click", () => {
  if (recommendedServer) joinServer(recommendedServer, nodes.heroJoin);
});

await refresh();
window.setInterval(refresh, Math.max(5000, Number(AUTOSEED_CONFIG.refreshIntervalMs) || 15000));

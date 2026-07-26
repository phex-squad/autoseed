import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const runtimeDirectory = resolve(process.argv[2] || "");
if (!process.argv[2]) {
  console.error("Использование: node deploy/check-runtime.mjs КАТАЛОГ");
  process.exit(2);
}

const names = ["phex-1.json", "phex-2.json"];
const listenPorts = new Set();
let failed = false;

function reject(condition, message) {
  if (!condition) return;
  failed = true;
  console.error(`Ошибка: ${message}`);
}

for (const name of names) {
  try {
    const config = JSON.parse(readFileSync(join(runtimeDirectory, name), "utf8"));
    const exporter = config.plugins?.find((plugin) => plugin.plugin === "AutoseedExporter");
    reject(!exporter, `${name}: не найден AutoseedExporter`);
    reject(config.server?.host !== "80.242.59.123", `${name}: неожиданный адрес сервера`);
    reject(!Number.isInteger(config.server?.queryPort), `${name}: queryPort не является числом`);
    reject(!Number.isInteger(config.server?.rconPort), `${name}: rconPort не является числом`);
    reject(!String(config.server?.rconPassword || ""), `${name}: отсутствует RCON-пароль`);
    reject(!String(config.server?.logDir || "").startsWith("/"), `${name}: logDir не абсолютный`);
    reject(exporter?.listenHost !== "127.0.0.1", `${name}: экспортёр должен слушать loopback`);
    reject(
      !exporter?.corsOrigins?.includes("https://phex-squad.github.io"),
      `${name}: отсутствует точный источник GitHub Pages`
    );
    reject(!String(exporter?.squadbrowserApiKey || ""), `${name}: отсутствует ключ SquadBrowser`);
    reject(listenPorts.has(exporter?.listenPort), `${name}: порт экспортёра уже используется`);
    listenPorts.add(exporter?.listenPort);

    const serialized = JSON.stringify(config);
    reject(/\$\{[A-Z0-9_]+\}/.test(serialized), `${name}: остались неподставленные переменные`);
  } catch (error) {
    failed = true;
    console.error(`Ошибка: ${name}: ${error.message}`);
  }
}

if (failed) process.exit(1);
console.log("Конфигурации PHEX прошли безопасную проверку.");


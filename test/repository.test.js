import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const requiredFiles = [
  "overlay/squad-server/plugins/autoseed-exporter.js",
  "overlay/squad-server/utils/build-identity.js",
  "overlay/squad-server/utils/public-session.js"
];

test("overlay includes every relative dependency required by the exporter", () => {
  for (const file of requiredFiles) {
    assert.ok(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").length > 0, file);
  }
});

test("public page contains no secret value or non-HTTPS exporter", () => {
  const configText = readFileSync(new URL("../site/config.js", import.meta.url), "utf8");
  assert.doesNotMatch(configText, /apiKey|token|password|secret/i);
  assert.doesNotMatch(configText, /http:\/\//i);
  assert.match(configText, /code: "phex-1"/);
  assert.match(configText, /code: "phex-2"/);
  assert.match(configText, /maxSeedPlayers: 80/);
  assert.match(configText, /refreshIntervalMs: 180000/);
});

test("PHEX page includes local branding and the autoseed connector", () => {
  const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  const connector = readFileSync(new URL("../site/connector.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../site/app.js", import.meta.url), "utf8");
  assert.match(html, /assets\/phex-logo\.webp/);
  assert.match(html, /Собираемся/);
  assert.match(html, /Запустить автосид/);
  assert.match(connector, /Служебное окно|служебное окно/);
  assert.match(app, /Экспортёр ещё не подключён/);
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
});

test("portable exporter never disables TLS certificate verification", () => {
  const exporter = readFileSync(
    new URL("../overlay/squad-server/plugins/autoseed-exporter.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(exporter, /rejectUnauthorized:\s*false/);
});

test("Pages workflow pins every third-party action to a full commit", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/pages.yml", import.meta.url),
    "utf8"
  );
  const actionReferences = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gm)].map(
    ([, reference]) => reference
  );

  assert.ok(actionReferences.length > 0);
  for (const reference of actionReferences) {
    assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/);
  }
});

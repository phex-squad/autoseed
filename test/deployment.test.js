import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseEnv, render } from "../deploy/render-config.mjs";

const repositoryRoot = new URL("../", import.meta.url);

const exampleEnvironment = `
SQUAD_HOST=80.242.59.123
PHEX_1_QUERY_PORT=7817
PHEX_1_RCON_PORT=7907
PHEX_1_RCON_PASSWORD="first # secret"
PHEX_1_LOG_DIR=/srv/phex-1/logs
PHEX_2_QUERY_PORT=7818
PHEX_2_RCON_PORT=7908
PHEX_2_RCON_PASSWORD='second secret'
PHEX_2_LOG_DIR=/srv/phex-2/logs
SQUADBROWSER_API_KEY=squadbrowser-secret
`;

test("env parser preserves quoted secrets and rejects shell syntax", () => {
  const values = parseEnv(exampleEnvironment);
  assert.equal(values.PHEX_1_RCON_PASSWORD, "first # secret");
  assert.equal(values.PHEX_2_RCON_PASSWORD, "second secret");
  assert.throws(() => parseEnv("not shell syntax"), /Некорректная строка/);
});

test("renderer creates two private configs with numeric ports", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "phex-autoseed-deploy-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const envPath = join(temporaryRoot, ".env");
  const outputDirectory = join(temporaryRoot, "runtime");
  writeFileSync(envPath, exampleEnvironment, { mode: 0o600 });

  const written = render({ envPath, outputDirectory });
  assert.equal(written.length, 2);

  const first = JSON.parse(readFileSync(join(outputDirectory, "phex-1.json"), "utf8"));
  const second = JSON.parse(readFileSync(join(outputDirectory, "phex-2.json"), "utf8"));
  assert.equal(first.server.queryPort, 7817);
  assert.equal(second.server.rconPort, 7908);
  assert.equal(first.server.rconPassword, "first # secret");
  assert.equal(first.plugins[0].listenHost, "127.0.0.1");
  assert.equal(second.plugins[0].listenPort, 32082);
  assert.equal(statSync(join(outputDirectory, "phex-1.json")).mode & 0o777, 0o600);
});

test("deployment assets use supported Node and loopback exporters", () => {
  const installer = readFileSync(new URL("../deploy/install-node.sh", import.meta.url), "utf8");
  const nginx = readFileSync(
    new URL("../deploy/nginx-autoseed.conf.example", import.meta.url),
    "utf8"
  );
  const firstTemplate = readFileSync(
    new URL("../deploy/config/phex-1.json.template", import.meta.url),
    "utf8"
  );
  const secondTemplate = readFileSync(
    new URL("../deploy/config/phex-2.json.template", import.meta.url),
    "utf8"
  );

  assert.match(installer, /node_version=\$\{PHEX_NODE_VERSION:-24\./);
  assert.match(installer, /sha256sum --check/);
  assert.doesNotMatch(nginx, /proxy_pass\s+http:\/\/0\.0\.0\.0/);
  assert.match(firstTemplate, /"listenHost": "127\.0\.0\.1"/);
  assert.match(secondTemplate, /"listenHost": "127\.0\.0\.1"/);
  assert.doesNotMatch(`${firstTemplate}${secondTemplate}`, /apiKey": "(?!\$\{)/);
});


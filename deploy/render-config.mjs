import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const deployRoot = dirname(fileURLToPath(import.meta.url));
const integerVariables = new Set([
  "PHEX_1_QUERY_PORT",
  "PHEX_1_RCON_PORT",
  "PHEX_2_QUERY_PORT",
  "PHEX_2_RCON_PORT"
]);
const templateNames = ["phex-1.json.template", "phex-2.json.template"];

function usage() {
  console.error("Использование: node deploy/render-config.mjs --env ФАЙЛ --output КАТАЛОГ");
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--env", "--output"].includes(flag)) {
      usage();
      process.exit(2);
    }
    result[flag.slice(2)] = value;
  }
  if (!result.env || !result.output) {
    usage();
    process.exit(2);
  }
  return result;
}

function unquote(value, lineNumber) {
  if (!value.startsWith("\"") && !value.startsWith("'")) return value.trim();
  const quote = value[0];
  if (!value.endsWith(quote)) {
    throw new Error(`Незакрытая кавычка в строке ${lineNumber}`);
  }
  const inner = value.slice(1, -1);
  if (quote === "'") return inner;
  return inner
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll("\\\"", "\"")
    .replaceAll("\\\\", "\\");
}

export function parseEnv(text) {
  const values = {};
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`Некорректная строка .env: ${index + 1}`);
    values[match[1]] = unquote(match[2].trim(), index + 1);
  }
  return values;
}

function resolveVariable(name, env) {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Не заполнена обязательная переменная ${name}`);
  }
  if (!integerVariables.has(name)) return value;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(`${name} должен быть целым портом от 1 до 65535`);
  }
  return number;
}

export function substitute(value, env) {
  if (Array.isArray(value)) return value.map((item) => substitute(item, env));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item, env)])
    );
  }
  if (typeof value !== "string") return value;
  const match = value.match(/^\$\{([A-Z][A-Z0-9_]*)\}$/);
  return match ? resolveVariable(match[1], env) : value;
}

function writeRuntimeConfig(outputDirectory, templateName, config) {
  const outputName = templateName.replace(/\.template$/, "");
  const outputPath = join(outputDirectory, outputName);
  const temporaryPath = join(outputDirectory, `.${basename(outputName)}.${process.pid}.tmp`);
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, outputPath);
  chmodSync(outputPath, 0o600);
  return outputPath;
}

export function render({ envPath, outputDirectory }) {
  const env = parseEnv(readFileSync(envPath, "utf8"));
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  chmodSync(outputDirectory, 0o700);
  const logsDirectory = join(outputDirectory, "logs");
  mkdirSync(logsDirectory, { recursive: true, mode: 0o700 });
  chmodSync(logsDirectory, 0o700);

  return templateNames.map((templateName) => {
    const templatePath = join(deployRoot, "config", templateName);
    const template = JSON.parse(readFileSync(templatePath, "utf8"));
    return writeRuntimeConfig(outputDirectory, templateName, substitute(template, env));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const written = render({
      envPath: resolve(args.env),
      outputDirectory: resolve(args.output)
    });
    for (const path of written) console.log(`Создана конфигурация ${path}`);
  } catch (error) {
    console.error(`Ошибка: ${error.message}`);
    process.exit(1);
  }
}

# Развёртывание PHEX

## Проверенный контур

- хост: `ostw@80.242.59.123`;
- рабочий каталог: `/opt/squadjs_ostw`, владелец `ostw:ostw`;
- системный Node.js 18 устарел, поэтому используется локальная Node.js 24 LTS;
- Docker для `ostw` недоступен;
- Nginx активен, но его системную конфигурацию меняет владелец хоста;
- каталоги `/opt/squad1` и `/opt/squad2` закрыты для `ostw`.

## Что нужно получить от владельца

Для каждого сервера PHEX:

1. `queryPort` и `rconPort`;
2. RCON-пароль;
3. путь к журналам и право чтения для `ostw` либо параметры FTP/SFTP;
4. подтверждённое точное имя сервера в SquadBrowser.

Общее:

1. ключ SquadBrowser API;
2. домен для экспортёра, например `autoseed.phex.example`;
3. сертификат и включение фрагмента Nginx;
4. подтверждение порядка: PHEX №1 имеет приоритет `10`, PHEX №2 — `20`.

## Раскладка хоста

```text
/opt/squadjs_ostw/
├── .runtime/node/       # локальная Node.js 24 LTS
├── autoseed/            # этот репозиторий
├── squadjs/             # совместимый checkout SquadJS
├── deploy/.env          # секреты, 0600, не в Git
└── deploy/runtime/      # сгенерированные конфигурации, 0600
```

## Подготовка

В каталоге этого репозитория:

```bash
bash deploy/install-node.sh
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Заполнить `deploy/.env`, затем:

```bash
/opt/squadjs_ostw/.runtime/node/bin/node \
  deploy/render-config.mjs \
  --env deploy/.env \
  --output deploy/runtime

bash scripts/install.sh /opt/squadjs_ostw/squadjs

cd /opt/squadjs_ostw/squadjs
HUSKY=0 /opt/squadjs_ostw/.runtime/node/bin/yarn install \
  --ignore-engines --non-interactive
```

Перед первым запуском проверить конфигурации без вывода секретов:

```bash
/opt/squadjs_ostw/.runtime/node/bin/node \
  /opt/squadjs_ostw/autoseed/deploy/check-runtime.mjs \
  /opt/squadjs_ostw/autoseed/deploy/runtime
```

## Запуск

Из каталога `autoseed`:

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 status
curl --fail http://127.0.0.1:32081/v1/autoseed/readyz
curl --fail http://127.0.0.1:32082/v1/autoseed/readyz
pm2 save
```

`readyz` может отвечать `503`, пока недоступны RCON или журналы. Это полезный
сигнал, а не повод подменять проверку готовности.

## HTTPS

Владелец хоста:

1. заменяет `autoseed.example.org` в
   `deploy/nginx-autoseed.conf.example` на настоящий домен;
2. устанавливает фрагмент в системную конфигурацию Nginx;
3. выдаёт сертификат;
4. проверяет и перечитывает Nginx.

После этого в `site/config.js` указываются:

```text
https://ДОМЕН/phex-1/v1/autoseed/snapshot
https://ДОМЕН/phex-1/v1/autoseed/join-link
https://ДОМЕН/phex-2/v1/autoseed/snapshot
https://ДОМЕН/phex-2/v1/autoseed/join-link
```

## GitHub Pages

В репозитории `phex-squad/autoseed` владелец выбирает
`Settings → Pages → GitHub Actions`. Процесс сначала выполняет проверки, затем
публикует только `site/`.

## Приёмка

- оба локальных `readyz` отвечают без сетевой ошибки;
- публичные `snapshot` доступны только по HTTPS;
- `Access-Control-Allow-Origin` равен `https://phex-squad.github.io`;
- страница показывает свежесть, игроков и рекомендуемый сервер;
- `join-link` возвращает `steam:`-ссылку, но не ключ;
- в репозитории и журнале процесса отсутствуют секреты.

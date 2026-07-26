const root = process.env.PHEX_DEPLOY_ROOT || "/opt/squadjs_ostw";
const node = `${root}/.runtime/node/bin/node`;
const squadjs = `${root}/squadjs`;
const runtime = `${root}/autoseed/deploy/runtime`;

function application(number) {
  return {
    name: `phex-squadjs-${number}`,
    cwd: squadjs,
    script: "index.js",
    args: `${runtime}/phex-${number}.json`,
    interpreter: node,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    restart_delay: 5000,
    kill_timeout: 15000,
    max_restarts: 10,
    min_uptime: "30s",
    error_file: `${runtime}/logs/phex-${number}.error.log`,
    out_file: `${runtime}/logs/phex-${number}.output.log`,
    merge_logs: true,
    time: true,
    env: {
      NODE_ENV: "production",
      SQUADJS_STARTUP_RETRY_MS: "5000",
      SQUADJS_STARTUP_CLEANUP_TIMEOUT_MS: "10000"
    }
  };
}

module.exports = {
  apps: [application(1), application(2)]
};


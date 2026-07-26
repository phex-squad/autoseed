#!/usr/bin/env bash
set -euo pipefail

node_version=${PHEX_NODE_VERSION:-24.18.0}
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
project_parent=$(cd "$script_dir/../.." && pwd -P)
runtime_root=${PHEX_RUNTIME_ROOT:-"$project_parent/.runtime"}
node_root="$runtime_root/node"

case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64|arm64) node_arch=arm64 ;;
  *)
    echo "Неподдерживаемая архитектура: $(uname -m)" >&2
    exit 2
    ;;
esac

if [[ -x "$node_root/bin/node" ]]; then
  installed=$("$node_root/bin/node" --version)
  if [[ "$installed" == "v$node_version" ]]; then
    echo "Node.js $node_version уже установлена в $node_root"
    exit 0
  fi
  echo "В $node_root уже находится другая версия: $installed" >&2
  echo "Перенесите её в резервную копию и повторите установку." >&2
  exit 3
fi

archive="node-v${node_version}-linux-${node_arch}.tar.xz"
base_url="https://nodejs.org/dist/v${node_version}"
temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT

curl --fail --show-error --silent --location \
  "$base_url/$archive" \
  --output "$temporary_dir/$archive"
curl --fail --show-error --silent --location \
  "$base_url/SHASUMS256.txt" \
  --output "$temporary_dir/SHASUMS256.txt"

(
  cd "$temporary_dir"
  awk -v file="$archive" '$2 == file { print }' SHASUMS256.txt > SHASUMS256.selected
  [[ -s SHASUMS256.selected ]]
  sha256sum --check SHASUMS256.selected
)

mkdir -p "$runtime_root"
tar -xJf "$temporary_dir/$archive" -C "$temporary_dir"
mv "$temporary_dir/node-v${node_version}-linux-${node_arch}" "$node_root"

export PATH="$node_root/bin:$PATH"
npm install --global --prefix "$node_root" yarn@1.22.22
echo "Установлена Node.js $node_version и Yarn 1.22.22 в $node_root"

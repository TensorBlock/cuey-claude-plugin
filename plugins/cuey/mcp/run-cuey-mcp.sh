#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
server="$script_dir/src/server.mjs"

for node_path in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  if [[ -x "$node_path" ]]; then
    exec "$node_path" "$server"
  fi
done

if command -v node >/dev/null 2>&1; then
  exec "$(command -v node)" "$server"
fi

echo "Cuey requires Node.js 18 or newer. Install Node.js, then rerun Cuey for Claude Setup." >&2
exit 127

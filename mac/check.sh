#!/bin/sh
set -eu

if command -v tailscale >/dev/null 2>&1; then
  TAILSCALE_BIN="$(command -v tailscale)"
elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
  TAILSCALE_BIN=/Applications/Tailscale.app/Contents/MacOS/Tailscale
else
  echo "未找到 tailscale 命令。" >&2
  exit 1
fi

echo "[1/3] 检查 AnkiConnect"
curl --silent --show-error --fail --max-time 5 http://127.0.0.1:8765
printf '\n'

echo "[2/3] 检查 Tailscale"
"$TAILSCALE_BIN" status --peers=false

echo "[3/3] 检查 Serve"
"$TAILSCALE_BIN" serve status

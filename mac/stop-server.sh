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

"$TAILSCALE_BIN" serve off
echo "Mini Anki 的 Tailscale Serve 已关闭。"

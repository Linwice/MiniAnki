#!/bin/sh
set -eu

if command -v tailscale >/dev/null 2>&1; then
  TAILSCALE_BIN="$(command -v tailscale)"
elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
  TAILSCALE_BIN=/Applications/Tailscale.app/Contents/MacOS/Tailscale
else
  echo "未找到 tailscale 命令。请先安装并登录 Tailscale。" >&2
  exit 1
fi

response="$(curl --silent --show-error --fail --max-time 5 http://127.0.0.1:8765)" || {
  echo "无法访问 AnkiConnect。请启动 Anki，并确认 AnkiConnect 已安装。" >&2
  exit 1
}

case "$response" in
  *AnkiConnect*) ;;
  *)
    echo "AnkiConnect 返回异常：$response" >&2
    exit 1
    ;;
esac

"$TAILSCALE_BIN" serve --bg http://127.0.0.1:8765
"$TAILSCALE_BIN" serve status

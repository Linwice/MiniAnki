$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "未找到 Node.js，请先安装 Node.js LTS。"
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "未找到 Rust，请先从 https://rustup.rs 安装 Rust。"
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  corepack enable
  corepack prepare pnpm@11.19.0 --activate
}

pnpm install --frozen-lockfile
pnpm tauri dev


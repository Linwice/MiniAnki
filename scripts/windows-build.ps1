$ErrorActionPreference = "Stop"
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm tauri build


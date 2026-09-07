# Mini Anki

一个运行在 Windows 上的无边框 Anki 复习小窗。它通过 Tailscale 连接 Mac mini 上持续运行的 Anki + AnkiConnect；卡片调度、FSRS、复习记录和官方同步仍全部由 Anki 管理。

## 当前范围

- 无顶部操作区、无边框、置顶及自由缩放窗口，背景透明度可调。
- `Space` 翻面，数字键按当前 Anki 按钮评分，`R` 重播，`Esc` 隐藏。
- `Alt+Shift+A` 在任意程序中呼出或隐藏窗口。
- Windows 托盘图标右键可打开设置、选择牌组、显示、隐藏或退出。
- 显示普通 Anki HTML/CSS，支持图片和 `[sound:文件名]` 音频。
- 媒体首次读取后缓存在 Windows；API key 保存在 Windows Credential Manager。
- 翻面和评分前校验当前 `cardId`，避免 Mac 端状态改变时误评。
- Windows 可读取 Mac 上的牌组并直接启动复习。

Mac 上的 Anki 必须保持运行，但无需手动进入某个牌组或打开卡片。复杂卡片 JavaScript、第三方插件渲染和下次间隔预览暂不支持。

## 1. 配置 Mac mini

1. 安装并启动 Anki，再安装 AnkiConnect 插件（代码 `2055492159`）。
2. 在终端运行 `openssl rand -hex 32` 生成随机 API key；然后在 Anki 的“工具 → 插件 → AnkiConnect → 配置”中，参考 [`mac/ankiconnect-config.example.json`](mac/ankiconnect-config.example.json) 填入该值。务必保持 `webBindAddress` 为 `127.0.0.1`。
3. 确认 Mac 和 Windows 已登录同一个 tailnet。
4. 执行：

   ```bash
   chmod +x mac/*.sh
   ./mac/start-server.sh
   ```

5. 记录命令输出中的 `https://...ts.net` 地址。在 Tailscale Access Controls 中，只允许目标 Windows 设备或用户访问该 Mac 服务。

可随时运行 `./mac/check.sh` 检查状态，或运行 `./mac/stop-server.sh` 停止暴露服务。这里使用的是仅 tailnet 可访问的 Tailscale Serve，不要使用 Funnel。

## 2. 运行 Windows 客户端

安装以下环境：

- Node.js 24 LTS
- Rust stable（至少 1.77.2）
- Microsoft C++ Build Tools 和 WebView2

在 PowerShell 中执行：

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
./scripts/windows-dev.ps1
```

首次打开后填写 Mac 的 Tailscale Serve HTTPS 地址及相同的 AnkiConnect API key。点击标题栏的牌组按钮即可从 Windows 选择牌组并开始复习。

构建安装包：

```powershell
./scripts/windows-build.ps1
```

输出位于 `src-tauri/target/release/bundle/`。也可以把项目推到 GitHub，手动运行 `Build Windows installer` workflow 下载 MSI/NSIS 构建产物。

## 开发验证

```bash
pnpm install
pnpm test
pnpm build
pnpm tauri dev
```

前端测试和构建不需要真实 Anki；完整联调需要 Mac 上的 Anki 处于复习页面。

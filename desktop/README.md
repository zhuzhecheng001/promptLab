# promptLab 桌面版（Tauri 壳）

桌面版是 promptLab Web 版的轻量壳应用：Tauri 窗口直接加载线上服务
（https://skills.zhecheng.fun），登录、项目、对话全部沿用 Web 版，数据天然云端隔离。
首次发布为壳形态，窗口化 / 本地数据能力在后续版本（v1.3）演进。

## 在 Windows 上构建

前置环境：

1. [Rust](https://rustup.rs/)（安装时选默认 stable 工具链即可）
2. [Node.js](https://nodejs.org/) 18+
3. Windows 10/11（自带 WebView2 运行时）

构建步骤：

```bash
cd desktop
npm install
# （可选）从 src-tauri/icons/icon.png 生成全套图标：
npm run tauri icon src-tauri/icons/icon.png
npm run tauri build
```

产物在 `desktop/src-tauri/target/release/bundle/`：

- `nsis/promptLab_1.0.0_x64-setup.exe`（安装包）
- `msi/promptLab_1.0.0_x64_en-US.msi`

## 配置说明

- 应用启动地址在 `src-tauri/tauri.conf.json` 的 `app.windows[0].url`
- 应用标识 `identifier`：`fun.zhecheng.promptlab`
- 图标源文件：`src-tauri/icons/icon.png`（用 `npm run tauri icon` 生成全尺寸图标集）
- 窗口尺寸 / 最小尺寸：`app.windows[0]`

## 目录结构

```
desktop/
  package.json          # tauri CLI 脚本
  web/index.html        # 离线占位页（网络不可用时显示）
  src-tauri/
    Cargo.toml          # Rust 依赖
    tauri.conf.json     # 应用配置（窗口 / 启动地址 / 打包目标）
    src/main.rs         # 入口
    src/lib.rs          # 应用初始化
    capabilities/       # Tauri 2 权限
    icons/              # 应用图标
```

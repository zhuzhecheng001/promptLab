# promptLab

> 造 Skill 的 IDE：让 AI 帮你撰写、测试、调试属于你自己的 AI 助手。

promptLab 是一个可视化制作 AI Skill（技能）的在线工具。把你要的 AI 能力说给"工匠"听，它帮你写出 `SKILL.md`、规范文档等；再用"测试台"试跑效果，迭代打磨，最后导出成一个可复用的 Skill 文件夹。

在线体验：https://skills.zhecheng.fun（移动端适配中，请使用电脑访问）

## ✨ 功能

- **工匠台**：和 AI 对话，撰写 / 维护项目文档（`SKILL.md`、规范文档、prompt 草稿等），回复可按段落一键加入文件
- **测试台**：加载当前项目全部文档作为规范，试跑你的 Skill 与 AI 对话的真实效果
- **项目文件管理**：每个项目独立目录，内置文件树 / 编辑器 / 新建 / 重命名 / 删除 / 导出（zip）
- **按用户数据隔离**：登录后每个用户的数据完全隔离（项目 / 对话 / 设置）
- **模型自由配置**：任意 OpenAI 兼容接口（DeepSeek、豆包、OpenAI 等），可自定义 base_url / api_key / model
- **问题反馈**：内置反馈入口，直接提交到作者后台
- **使用文档**：站内文档实时从作者主站加载，后台可在线编辑

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + Zustand |
| 后端 | FastAPI + SQLite + SSE 流式对话 |
| 鉴权 | 转发主站（zhecheng.fun）登录态，按 user_id 隔离数据 |
| LLM | OpenAI 兼容协议（DeepSeek / 豆包 / OpenAI 等） |

## 🚀 本地开发

环境要求：Node 18+、Python 3.11+。

```bash
# 1. 后端（FastAPI，使用 uv 管理依赖）
cd backend
uv sync            # 或 pip install -r requirements.txt
uv run uvicorn backend.main:app --port 8000 --reload

# 2. 前端（Vite）
cd frontend
npm install
npm run dev
```

> 说明：后端默认使用本地单用户模式；接入主站登录只需配置主站地址并开启 site 鉴权（见 `backend/src/backend/core/auth.py`）。

## 🗂 项目结构

```
backend/                 # FastAPI 后端（src/backend 布局，uv 管理依赖）
  src/backend/core/      # 提示词模板、LLM 客户端、skill 渲染、鉴权
  src/backend/routers/   # 路由：项目 / 文件 / 对话 / 设置 / 反馈 / 站点文档
  src/backend/db.py      # SQLite 数据层（项目、会话、消息、设置、快照、用例）
frontend/                # React 前端（Vite 标准工程）
  src/components/        # 文件树 / 编辑器 / 对话面板 / 设置弹窗 / 登录门
  src/App.tsx            # 主应用与状态编排
  mobile.html            # 移动端访问提示页（nginx 按 UA 拦截）
desktop/                 # 桌面版（Tauri 壳，加载线上 Web 版）
docs/                    # 项目文档（MVP 清单 / 使用说明 / 接口设计 / 版本路线）
```

## 🗓 版本路线

- **v1.0**：正式发布（Web + 桌面版壳应用）
- **v1.1**：单独屏蔽文件（被屏蔽文档不进 AI 上下文）、导出聊天记录、AI 自动写入文件
- **v1.2**：AI 质检（质检意见 + 自动调试）
- **v1.3**：窗口化（对话框 / 编辑区 / 文件列表自由调整）

## 📄 License

[MIT](LICENSE)

© 2026 朱柘成（Zhecheng Zhu） · zhecheng.fun

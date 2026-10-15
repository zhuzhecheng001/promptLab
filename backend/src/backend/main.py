"""PromptLab 后端入口（FastAPI 应用）"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db import init_db
from backend.routers import auth, chat, files, projects, settings, site, test_cases

app = FastAPI(
    title="PromptLab Backend",
    version="1.0.0",
    description="一个造 Skill 的 IDE 后端：工匠 / 执行者（用户系统：主站登录）",
)

# 开发阶段允许前端 dev server 跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(files.router)
app.include_router(settings.router)
app.include_router(chat.router)
app.include_router(test_cases.router)
app.include_router(site.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "promptlab-backend", "version": "1.0.0"}


@app.get("/")
def root() -> dict:
    return {"message": "PromptLab Backend is running", "docs": "/docs"}

"""工匠 / 执行者 对话接口（SSE 流式，按用户隔离）"""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core import llm
from backend.core.auth import get_current_user
from backend.core.prompts import BUILDER_PROMPT
from backend.core.skill_renderer import render_runner_prompt
from backend.db import (
    PROJECTS_DIR,
    add_message,
    create_conversation,
    get_messages,
    get_setting,
    init_db,
    project_belongs,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    project_id: int
    message: str
    conversation_id: int | None = None
    skill_file: str | None = None  # 选中的 skill 文件（相对路径，如 SKILL.md）


def _load_model_config(user_id: int, name: str, use_author: bool = False) -> dict:
    """读取模型配置；use_author=True 时改用作者的公共 API（全局配置）。"""
    if use_author:
        raw = get_setting(0, "author_api")
        which = "作者的 API"
    else:
        raw = get_setting(user_id, name)
        if raw is None:
            raw = get_setting(0, name)  # 回退全局（迁移的旧配置）
        which = name
    if not raw:
        raise HTTPException(
            status_code=400,
            detail=f"模型未配置：请在设置中先配置{which}",
        )
    return json.loads(raw)


def _project_files(project_id: int) -> tuple[str, str]:
    """读取项目的 SKILL.md 与规范文档（新项目规范文档在 assets/，兼容旧项目根目录）。"""
    base = PROJECTS_DIR / str(project_id)
    skill_md = ""
    spec_md = ""
    skill_path = base / "SKILL.md"
    spec_path = base / "assets" / "规范文档.md"
    if not spec_path.exists():
        spec_path = base / "规范文档.md"  # 兼容旧项目结构
    if skill_path.exists():
        skill_md = skill_path.read_text(encoding="utf-8")
    if spec_path.exists():
        spec_md = spec_path.read_text(encoding="utf-8")
    return skill_md, spec_md


def _build_context(project_id: int, role: str, skill_file: str | None = None) -> str:
    """构建系统提示词：工匠带项目文件上下文，执行者用心脏函数渲染。

    AI2 的 skill 跟随左侧选中的文件：选中哪个 .md，AI2 就按哪个工作；
    选中 SKILL.md（或未选中/非 md）时，加载 SKILL.md + 规范文档。
    """
    skill_md, spec_md = _project_files(project_id)
    if role == "builder":
        return (
            BUILDER_PROMPT
            + "\n\n【当前项目文件】\nSKILL.md:\n"
            + (skill_md or "（空）")
            + "\n\n规范文档.md:\n"
            + (spec_md or "（空）")
        )
    if role == "runner":
        if skill_file and skill_file.endswith(".md") and skill_file != "SKILL.md":
            base = PROJECTS_DIR / str(project_id)
            chosen = base / skill_file
            if chosen.exists() and chosen.is_file():
                return render_runner_prompt(chosen.read_text(encoding="utf-8"), "")
        return render_runner_prompt(skill_md, spec_md)
    return ""


def _sse_stream(
    messages: list[dict],
    cfg: dict,
    system_prompt: str,
    conversation_id: int,
) -> StreamingResponse:
    """SSE 流式对话；完成时把完整回复写入会话记录。"""

    def gen():
        client = llm.build_client(cfg["base_url"], cfg["api_key"])
        collected: list[str] = []
        try:
            for delta in llm.chat_stream(
                client,
                system_prompt=system_prompt,
                messages=messages,
                model=cfg["model"],
            ):
                collected.append(delta)
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            full = "".join(collected)
            add_message(conversation_id, "assistant", full)
            yield (
                "data: "
                + json.dumps(
                    {"done": True, "conversation_id": conversation_id},
                    ensure_ascii=False,
                )
                + "\n\n"
            )
        except Exception as e:  # 模型调用失败（key 无效、网络错误等）
            yield (
                "data: "
                + json.dumps({"error": str(e)}, ensure_ascii=False)
                + "\n\n"
            )

    return StreamingResponse(gen(), media_type="text/event-stream")


def _chat(body: ChatRequest, role: str, user: dict) -> StreamingResponse:
    uid = int(user["id"])
    init_db()
    if not project_belongs(uid, body.project_id):
        raise HTTPException(status_code=404, detail="项目不存在")
    use_author = get_setting(uid, f"{role}_use_author")
    if use_author is None:
        use_author = get_setting(0, f"{role}_use_author")
    cfg = _load_model_config(uid, f"{role}_model", use_author == "1")
    cid = body.conversation_id
    if cid is None:
        cid = create_conversation(uid, body.project_id, role)
    history = get_messages(cid)
    system_prompt = _build_context(body.project_id, role, body.skill_file)
    add_message(cid, "user", body.message)
    msgs = [{"role": m["role"], "content": m["content"]} for m in history]
    msgs.append({"role": "user", "content": body.message})
    return _sse_stream(msgs, cfg, system_prompt, cid)


@router.post("/builder")
def chat_builder(body: ChatRequest, user: dict = Depends(get_current_user)) -> StreamingResponse:
    """工匠对话：基于项目文件生成 / 修改 skill。"""
    return _chat(body, "builder", user)


@router.post("/runner")
def chat_runner(body: ChatRequest, user: dict = Depends(get_current_user)) -> StreamingResponse:
    """执行者对话：加载当前 skill 试跑。"""
    return _chat(body, "runner", user)

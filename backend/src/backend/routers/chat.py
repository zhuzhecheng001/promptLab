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


def _project_docs(project_id: int) -> dict[str, str]:
    """读取项目下所有 Markdown 文档（递归），返回 相对路径 -> 内容。"""
    base = PROJECTS_DIR / str(project_id)
    if not base.exists():
        return {}
    docs: dict[str, str] = {}
    for p in sorted(base.rglob("*.md")):
        rel = p.relative_to(base).as_posix()
        try:
            docs[rel] = p.read_text(encoding="utf-8")
        except Exception:
            continue
    return docs


def _build_context(project_id: int, role: str, skill_file: str | None = None) -> str:
    """构建系统提示词：工匠 / 执行者都基于当前项目下的全部 Markdown 文档。"""
    docs = _project_docs(project_id)
    if role == "builder":
        parts = [BUILDER_PROMPT]
        for path, content in docs.items():
            parts.append(f"\n\n【{path}】\n{content or '（空）'}")
        return "".join(parts)
    if role == "runner":
        return render_runner_prompt(docs)
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

"""主站内容代理：读取主站公开接口（如 promptLab 使用文档，后台可编辑）"""

import json
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.core.auth import get_current_user

router = APIRouter(prefix="/api", tags=["site"])

SITE_BASE = "http://127.0.0.1:8002"
# 与主站约定的内部密钥：仅 promptLab 后端可写入反馈
FEEDBACK_SECRET = "plab-fb-2026-zzc"


@router.get("/site-doc")
def site_doc() -> dict:
    """promptLab 使用文档（主站后台编辑，这里代理读取供 IDE 展示）"""
    try:
        with urllib.request.urlopen(f"{SITE_BASE}/api/promptlab-doc", timeout=5) as r:
            data = json.loads(r.read().decode("utf-8"))
        return {
            "content": data.get("content", ""),
            "published": data.get("published", False),
            "updated_at": data.get("updated_at", ""),
        }
    except Exception as e:  # noqa: BLE001 - 主站不可用时给出可读错误
        return {"content": "", "published": False, "updated_at": "", "error": str(e)}


@router.post("/feedback")
def post_feedback(body: dict, request: Request, user: dict = Depends(get_current_user)):
    """收集 promptLab 问题反馈：登录用户提交，转发主站存储（后台可查看/删除）"""
    content = str(body.get("message") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")
    if len(content) > 5000:
        content = content[:5000]
    username = (user.get("username") or user.get("nickname") or "匿名")[:50]
    payload = json.dumps(
        {"secret": FEEDBACK_SECRET, "username": username, "content": content}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{SITE_BASE}/api/feedback",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        return {"ok": True, **data}
    except Exception as e:  # noqa: BLE001 - 主站不可用时给出可读错误
        raise HTTPException(status_code=502, detail=f"反馈提交失败，请稍后再试：{e}")

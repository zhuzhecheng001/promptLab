"""主站内容代理：读取主站公开接口（如 promptLab 使用文档，后台可编辑）"""

import json
import urllib.request

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["site"])

SITE_BASE = "http://127.0.0.1:8002"


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

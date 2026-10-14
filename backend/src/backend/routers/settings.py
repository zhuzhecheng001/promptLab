"""模型配置接口（按用户隔离）。

- builder_model：工匠 使用（内置，当前为 DeepSeek）
- runner_model：执行者 使用（用户自定义，OpenAI 兼容）
- author_api：作者的公共 API（其他用户勾选"借用作者的 API"时使用；全局配置，仅站长可改）
- builder_use_author / runner_use_author：是否借用作者的 API（"1"/"0"，按用户存）
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import get_current_user
from backend.db import get_setting, is_owner, set_setting

router = APIRouter(prefix="/api/settings", tags=["settings"])

ALLOWED_MODELS = {"builder_model", "runner_model", "author_api"}
ALLOWED_FLAGS = {"builder_use_author", "runner_use_author"}


class ModelConfig(BaseModel):
    base_url: str
    api_key: str
    model: str


class FlagConfig(BaseModel):
    use_author: bool


def _check_name(name: str) -> None:
    if name not in ALLOWED_MODELS and name not in ALLOWED_FLAGS:
        raise HTTPException(status_code=400, detail="未知配置项")


def _is_global(name: str) -> bool:
    """author_api 为全局配置；其余按用户。"""
    return name == "author_api"


@router.get("/{name}")
def get_model_setting(name: str, user: dict = Depends(get_current_user)) -> dict:
    """读取配置；模型配置的 API key 打码返回。"""
    _check_name(name)
    uid = int(user["id"])
    # 用户配置优先；无则回退全局（单用户版本迁移的旧配置）
    raw = get_setting(0 if _is_global(name) else uid, name)
    if raw is None and not _is_global(name):
        raw = get_setting(0, name)
    if raw is None:
        return {"configured": False}
    if name in ALLOWED_FLAGS:
        return {"configured": True, "use_author": raw == "1"}
    cfg = json.loads(raw)
    key = cfg["api_key"]
    masked = (key[:4] + "****" + key[-4:]) if len(key) > 8 else "****"
    return {
        "configured": True,
        "base_url": cfg["base_url"],
        "api_key_masked": masked,
        "model": cfg["model"],
    }


@router.put("/{name}")
def put_model_setting(
    name: str, body: ModelConfig | FlagConfig, user: dict = Depends(get_current_user)
) -> dict:
    """保存模型配置或借用开关。"""
    _check_name(name)
    uid = int(user["id"])
    if _is_global(name):
        # 作者公共 API 仅站长可修改
        if not is_owner(uid):
            raise HTTPException(status_code=403, detail="仅作者可修改公共 API 配置")
        target = 0
    else:
        target = uid
    if name in ALLOWED_FLAGS:
        if not isinstance(body, FlagConfig):
            raise HTTPException(status_code=400, detail="开关配置需传 {use_author: bool}")
        set_setting(target, name, "1" if body.use_author else "0")
    else:
        if not isinstance(body, ModelConfig):
            raise HTTPException(status_code=400, detail="模型配置需传 base_url/api_key/model")
        cfg = body.model_dump()
        if not cfg.get("api_key"):
            # 留空 = 保留已保存的 key，避免把已有 key 覆盖成空
            existing = get_setting(target, name)
            if existing:
                old = json.loads(existing)
                cfg["api_key"] = old.get("api_key", "")
        set_setting(target, name, json.dumps(cfg, ensure_ascii=False))
    return {"saved": True, "name": name}

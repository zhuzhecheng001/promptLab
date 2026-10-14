"""用户鉴权：转发主站（zhecheng.fun 后端）验证登录态。

主站登录后写入跨子域 Cookie（Domain=.zhecheng.fun），本服务（skills 子域）
能自动收到 site_token Cookie；转发到主站 /api/auth/me 换取用户信息。
- PROMPTLAB_AUTH_MODE=site  线上：严格转发主站验证（未登录 401）
- PROMPTLAB_AUTH_MODE=dev   本地开发：放行（假用户 id=1），便于无主站环境联调
"""

import json
import os
import time
import urllib.request

from fastapi import HTTPException, Request

SITE_API = os.environ.get("PROMPTLAB_SITE_API", "http://127.0.0.1:8002")
AUTH_MODE = os.environ.get("PROMPTLAB_AUTH_MODE", "dev")

_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 60  # 秒

DEV_USER = {"id": 1, "username": "local-dev", "nickname": "本地开发", "avatar": ""}


def extract_token(request: Request) -> str:
    """从 Cookie(site_token) 或 Authorization: Bearer 提取 token。"""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return request.cookies.get("site_token", "")


def verify_token(token: str) -> dict | None:
    """校验 token，返回主站用户信息；无效/过期返回 None。"""
    if AUTH_MODE == "dev":
        return DEV_USER
    if not token:
        return None
    now = time.time()
    hit = _cache.get(token)
    if hit and hit[0] > now:
        return hit[1]
    req = urllib.request.Request(
        SITE_API + "/api/auth/me", headers={"Authorization": "Bearer " + token}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            user = json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None
    _cache[token] = (now + _CACHE_TTL, user)
    return user


def get_current_user(request: Request) -> dict:
    """FastAPI 依赖：要求有效登录，返回用户 dict。"""
    token = extract_token(request)
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    return user

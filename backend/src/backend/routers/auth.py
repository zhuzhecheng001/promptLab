"""主站登录代理：本服务不提供注册/登录表单，登录全在主站完成。

- GET  /api/auth/me      验证登录态并返回用户信息（同时记录用户、认领旧数据）
- POST /api/auth/logout  转发主站清除跨子域 Cookie
"""

import json
import urllib.request

from fastapi import APIRouter, HTTPException, Request, Response

from backend.core.auth import AUTH_MODE, DEV_USER, SITE_API, extract_token, verify_token
from backend.db import claim_orphan_data, upsert_user

router = APIRouter(prefix="/api/auth", tags=["auth-proxy"])


@router.get("/me")
def me(request: Request) -> dict:
    """当前登录用户；未登录 401。"""
    if AUTH_MODE == "dev":
        upsert_user(DEV_USER)
        claim_orphan_data(DEV_USER["id"])
        return DEV_USER
    token = extract_token(request)
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    upsert_user(user)
    claim_orphan_data(user["id"])
    return user


@router.post("/logout")
def logout() -> Response:
    """转发主站退出接口，把清除 Cookie 的 Set-Cookie 透传给浏览器。"""
    req = urllib.request.Request(SITE_API + "/api/auth/logout", method="POST")
    set_cookie = ""
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            set_cookie = r.headers.get("Set-Cookie", "")
    except Exception:
        pass
    resp = Response(content=json.dumps({"ok": True, "msg": "已退出登录"}), media_type="application/json")
    if set_cookie:
        resp.headers["Set-Cookie"] = set_cookie
    return resp

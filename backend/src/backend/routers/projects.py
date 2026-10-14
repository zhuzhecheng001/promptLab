"""项目管理接口：创建 / 列表 / 详情 / 重命名 / 删除 / 导出（按用户隔离）"""

import io
import shutil
import urllib.parse
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core.auth import get_current_user
from backend.db import (
    DEFAULT_FILES,
    PROJECTS_DIR,
    SNAPSHOTS_DIR,
    _connect,
    create_project,
    delete_project,
    get_messages,
    get_project,
    latest_conversation,
    list_projects,
    project_belongs,
    rename_project,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str


class ProjectRename(BaseModel):
    name: str


def _owner(user: dict) -> int:
    return int(user["id"])


def _write_defaults(base: Path, files: dict) -> None:
    """递归写出项目骨架（文件/目录/嵌套目录）。"""
    for filename, content in files.items():
        target = base / filename
        if content is None:
            target.mkdir(exist_ok=True)
        elif isinstance(content, dict):
            target.mkdir(exist_ok=True)
            _write_defaults(target, content)
        else:
            target.write_text(content, encoding="utf-8")


@router.post("")
def create_project_ep(body: ProjectCreate, user: dict = Depends(get_current_user)) -> dict:
    """新建项目：创建目录骨架 + 数据库记录。"""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="项目名称不能为空")
    uid = _owner(user)
    project_id = create_project(uid, name)
    project_dir = PROJECTS_DIR / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    _write_defaults(project_dir, DEFAULT_FILES)
    return {"id": project_id, "name": name}


@router.get("")
def list_projects_ep(user: dict = Depends(get_current_user)) -> list[dict]:
    """当前用户的项目列表。"""
    return list_projects(_owner(user))


@router.get("/{project_id}")
def get_project_ep(project_id: int, user: dict = Depends(get_current_user)) -> dict:
    """项目详情（名称 + 创建时间）。"""
    row = get_project(_owner(user), project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return row


@router.put("/{project_id}")
def rename_project_ep(project_id: int, body: ProjectRename, user: dict = Depends(get_current_user)) -> dict:
    """重命名项目。"""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="项目名称不能为空")
    if not rename_project(_owner(user), project_id, name):
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"id": project_id, "name": name}


@router.delete("/{project_id}")
def delete_project_ep(project_id: int, user: dict = Depends(get_current_user)) -> dict:
    """删除项目：数据库记录 + 项目目录 + 快照目录。"""
    uid = _owner(user)
    if not delete_project(uid, project_id):
        raise HTTPException(status_code=404, detail="项目不存在")
    # 清理该项目相关会话/快照记录与目录
    with _connect() as conn:
        conn.execute(
            "DELETE FROM messages WHERE conversation_id IN "
            "(SELECT id FROM conversations WHERE project_id = ?)",
            (project_id,),
        )
        conn.execute("DELETE FROM conversations WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM snapshots WHERE project_id = ?", (project_id,))
    proj_dir = PROJECTS_DIR / str(project_id)
    snap_dir = SNAPSHOTS_DIR / str(project_id)
    if proj_dir.exists():
        shutil.rmtree(proj_dir)
    if snap_dir.exists():
        shutil.rmtree(snap_dir)
    return {"deleted": True, "id": project_id}


@router.get("/{project_id}/history")
def project_history_ep(project_id: int, role: str = "runner", user: dict = Depends(get_current_user)) -> dict:
    """某项目下指定角色（builder/runner）的最近会话及消息历史。"""
    if role not in ("builder", "runner"):
        raise HTTPException(status_code=400, detail="role 须为 builder 或 runner")
    uid = _owner(user)
    if not project_belongs(uid, project_id):
        raise HTTPException(status_code=404, detail="项目不存在")
    cid = latest_conversation(uid, project_id, role)
    if cid is None:
        return {"conversation_id": None, "messages": []}
    return {"conversation_id": cid, "messages": get_messages(cid)}


@router.get("/{project_id}/export")
def export_project_ep(project_id: int, user: dict = Depends(get_current_user)) -> StreamingResponse:
    """导出项目为 zip（包含全部文件），方便分享 / 备份 / 开源。"""
    row = get_project(_owner(user), project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    base = PROJECTS_DIR / str(project_id)
    if not base.exists():
        raise HTTPException(status_code=404, detail="项目目录不存在")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(base.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(base).as_posix())
    buf.seek(0)
    fname = urllib.parse.quote(f"{row['name']}.zip")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=project.zip; filename*=UTF-8''{fname}"
        },
    )

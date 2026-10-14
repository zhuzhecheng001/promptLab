"""文件操作接口：文件树 / 读取 / 写入 / 新建 / 删除 / 重命名（写删前自动快照，按用户隔离）"""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import get_current_user
from backend.db import PROJECTS_DIR, SNAPSHOTS_DIR, _connect, init_db, now, project_belongs

router = APIRouter(tags=["files"])

PROJECTS_ROOT = PROJECTS_DIR.resolve()


def _project_dir(project_id: int) -> Path:
    d = (PROJECTS_DIR / str(project_id)).resolve()
    if not d.is_relative_to(PROJECTS_ROOT):
        raise HTTPException(status_code=400, detail="非法路径")
    if not d.exists():
        raise HTTPException(status_code=404, detail="项目不存在")
    return d


def _safe_file_path(project_id: int, rel: str) -> Path:
    base = _project_dir(project_id)
    full = (base / rel).resolve()
    if not full.is_relative_to(base):
        raise HTTPException(status_code=400, detail="非法路径（禁止目录穿越）")
    return full


def _tree(base: Path, prefix: str = "") -> list[dict]:
    nodes = []
    for p in sorted(base.iterdir()):
        rel = p.name if not prefix else f"{prefix}/{p.name}"
        if p.is_dir():
            nodes.append(
                {"name": p.name, "path": rel, "type": "dir", "children": _tree(p, rel)}
            )
        else:
            nodes.append({"name": p.name, "path": rel, "type": "file"})
    return nodes


def _check_project(uid: int, project_id: int) -> None:
    """校验项目存在且属于当前用户。"""
    if not project_belongs(uid, project_id):
        raise HTTPException(status_code=404, detail="项目不存在")


@router.get("/api/projects/{project_id}/files")
def list_files(project_id: int, user: dict = Depends(get_current_user)) -> list[dict]:
    """递归列出项目文件树。"""
    _check_project(int(user["id"]), project_id)
    return _tree(_project_dir(project_id))


def _split_path(path: str) -> tuple[int, str]:
    parts = path.split("/", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="路径格式应为 <项目ID>/<文件路径>")
    try:
        return int(parts[0]), parts[1]
    except ValueError:
        raise HTTPException(status_code=400, detail="项目 ID 非法")


@router.get("/api/files/{path:path}")
def read_file(path: str, user: dict = Depends(get_current_user)) -> dict:
    """读取文件内容。路径示例：1/SKILL.md"""
    project_id, rel = _split_path(path)
    _check_project(int(user["id"]), project_id)
    full = _safe_file_path(project_id, rel)
    if not full.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return {"path": path, "content": full.read_text(encoding="utf-8")}


class FileWrite(BaseModel):
    content: str


def _snapshot(project_id: int, rel: str, full: Path) -> None:
    """把文件当前内容存为快照（写入/删除前调用）。"""
    init_db()
    old_content = full.read_text(encoding="utf-8")
    snapshot_dir = SNAPSHOTS_DIR / str(project_id)
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    stamp = now().replace(":", "").replace(" ", "-")
    (snapshot_dir / f"{stamp}_{full.name}").write_text(old_content, encoding="utf-8")
    with _connect() as conn:
        conn.execute(
            "INSERT INTO snapshots (project_id, file_path, content, created_at) VALUES (?, ?, ?, ?)",
            (project_id, rel, old_content, now()),
        )


class FileRename(BaseModel):
    from_path: str
    to_path: str


# 注意：此路由必须在 /api/files/{path:path} 之前注册（否则 "rename" 会被当作 path）
@router.post("/api/files/rename")
def rename_file(body: FileRename, user: dict = Depends(get_current_user)) -> dict:
    """重命名 / 移动文件或目录（仅限同项目内）。"""
    uid = int(user["id"])
    fpid, frel = _split_path(body.from_path)
    tpid, trel = _split_path(body.to_path)
    if fpid != tpid:
        raise HTTPException(status_code=400, detail="只能在同项目内重命名")
    _check_project(uid, fpid)
    src = _safe_file_path(fpid, frel)
    dst = _safe_file_path(tpid, trel)
    if not src.exists():
        raise HTTPException(status_code=404, detail="源文件不存在")
    if dst.exists():
        raise HTTPException(status_code=409, detail="目标已存在")
    if src.is_dir() and dst.is_relative_to(src):
        raise HTTPException(status_code=400, detail="不能移动到自身内部")
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        shutil.move(str(src), str(dst))
    else:
        src.rename(dst)
    return {"from": body.from_path, "to": body.to_path, "renamed": True}


@router.post("/api/files/{path:path}")
def create_file(path: str, user: dict = Depends(get_current_user)) -> dict:
    """新建文件（空文件）。"""
    project_id, rel = _split_path(path)
    _check_project(int(user["id"]), project_id)
    if not rel or rel.endswith("/") or rel == ".":
        raise HTTPException(status_code=400, detail="文件名非法")
    full = _safe_file_path(project_id, rel)
    if full.exists():
        raise HTTPException(status_code=409, detail="文件已存在")
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text("", encoding="utf-8")
    return {"path": path, "created": True}


@router.delete("/api/files/{path:path}")
def delete_file(path: str, user: dict = Depends(get_current_user)) -> dict:
    """删除文件（删除前自动快照，可从快照恢复）。"""
    project_id, rel = _split_path(path)
    _check_project(int(user["id"]), project_id)
    full = _safe_file_path(project_id, rel)
    if full.is_dir():
        raise HTTPException(status_code=400, detail="暂不支持删除目录")
    if not full.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    _snapshot(project_id, rel, full)
    full.unlink()
    return {"path": path, "deleted": True}


@router.put("/api/files/{path:path}")
def write_file(path: str, body: FileWrite, user: dict = Depends(get_current_user)) -> dict:
    """写入文件；保存前自动把旧内容存为快照。"""
    project_id, rel = _split_path(path)
    _check_project(int(user["id"]), project_id)
    full = _safe_file_path(project_id, rel)
    if full.is_dir():
        raise HTTPException(status_code=400, detail="不能写入目录")

    if full.exists():
        _snapshot(project_id, rel, full)

    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(body.content, encoding="utf-8")
    return {"path": path, "saved": True}

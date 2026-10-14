"""用例记录接口：好/坏回答标注（质检的尺子，按用户隔离）"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import get_current_user
from backend.db import _connect, init_db, now, project_belongs

router = APIRouter(prefix="/api/test-cases", tags=["test-cases"])


class TestCaseCreate(BaseModel):
    project_id: int
    user_message: str
    ai2_reply: str
    verdict: str  # good / bad
    note: str = ""


@router.post("")
def create_test_case(body: TestCaseCreate, user: dict = Depends(get_current_user)) -> dict:
    """记录一条用例（好/坏回答）。"""
    if body.verdict not in ("good", "bad"):
        raise HTTPException(status_code=400, detail="verdict 必须为 good 或 bad")
    if not project_belongs(int(user["id"]), body.project_id):
        raise HTTPException(status_code=404, detail="项目不存在")
    init_db()
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO test_cases (project_id, user_message, ai2_reply, verdict, note, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (body.project_id, body.user_message, body.ai2_reply, body.verdict, body.note, now()),
        )
        return {"id": cur.lastrowid, "saved": True}


@router.get("")
def list_test_cases(project_id: int | None = None, user: dict = Depends(get_current_user)) -> list[dict]:
    """用例列表；可按项目过滤。"""
    uid = int(user["id"])
    init_db()
    with _connect() as conn:
        if project_id is not None:
            if not project_belongs(uid, project_id):
                raise HTTPException(status_code=404, detail="项目不存在")
            rows = conn.execute(
                "SELECT * FROM test_cases WHERE project_id = ? ORDER BY id DESC",
                (project_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT tc.* FROM test_cases tc "
                "JOIN projects p ON p.id = tc.project_id AND p.user_id = ? "
                "ORDER BY tc.id DESC",
                (uid,),
            ).fetchall()
    return [dict(r) for r in rows]

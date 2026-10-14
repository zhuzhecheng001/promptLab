"""SQLite 数据层：初始化数据库与表结构。

数据存放于项目根 data/ 目录：
- data/projects/<id>/    skill 项目文件（SKILL.md、规范文档.md、assets/）
- data/snapshots/        自动快照
- data/promptlab.db      元数据（用户、项目、对话、快照记录、用例、设置）

多用户：登录态由主站（zhecheng.fun）认证，此处只按 user_id 隔离数据。
user_id 直接使用主站用户 id；settings 的 user_id=0 表示全局（作者公共 API）。
"""

import sqlite3
from datetime import datetime
from pathlib import Path

DATA_ROOT = Path(__file__).resolve().parents[3] / "data"
PROJECTS_DIR = DATA_ROOT / "projects"
SNAPSHOTS_DIR = DATA_ROOT / "snapshots"
DB_PATH = DATA_ROOT / "promptlab.db"

DEFAULT_FILES = {
    "SKILL.md": (
        "# 技能名称\n\n"
        "<!-- 描述区：写清楚这个技能是干什么的、什么情况下该用、什么情况下不该用（本行注释 AI 不可见） -->\n"
        "## 描述区\n\n"
        "<!-- 指令区：写具体怎么做——步骤、规则、示例、边界（本行注释 AI 不可见） -->\n"
        "## 指令区\n"
    ),
    "assets": {
        "规范文档.md": (
            "# 规范文档\n\n"
            "<!-- 补充规范说明，可选；本行注释 AI 不可见，正文才会被读取 -->\n"
        ),
        "prompt.md": (
            "# Prompt\n\n"
            "<!-- 核心指令草稿，可选；工匠生成 SKILL.md 时会参考这里的正文，本行注释 AI 不可见 -->\n"
        ),
    },
}


def _connect() -> sqlite3.Connection:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _column_names(table: str) -> set[str]:
    with _connect() as conn:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {r["name"] for r in rows}


def init_db() -> None:
    """建表（幂等）+ 单用户版本迁移。"""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                nickname TEXT NOT NULL DEFAULT '',
                avatar TEXT NOT NULL DEFAULT '',
                first_seen TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                user_id INTEGER,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                user_id INTEGER,
                role TEXT NOT NULL,          -- builder / runner / reviewer
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,          -- user / assistant
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS test_cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                user_message TEXT NOT NULL,
                ai2_reply TEXT NOT NULL,
                verdict TEXT NOT NULL,       -- good / bad
                note TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                user_id INTEGER NOT NULL DEFAULT 0,   -- 0 = 全局（作者公共 API）
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (user_id, key)
            );
            """
        )

    # ---- 单用户版本迁移（幂等）----
    # projects / conversations 补 user_id 列
    for table in ("projects", "conversations"):
        cols = _column_names(table)
        if "user_id" not in cols:
            with _connect() as conn:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER")

    # settings 表结构升级：key 主键 → (user_id, key) 复合主键
    cols = _column_names("settings")
    if "user_id" not in cols:
        with _connect() as conn:
            conn.execute("ALTER TABLE settings RENAME TO settings_old")
            conn.execute(
                "CREATE TABLE settings ("
                " user_id INTEGER NOT NULL DEFAULT 0,"
                " key TEXT NOT NULL,"
                " value TEXT NOT NULL,"
                " PRIMARY KEY (user_id, key))"
            )
            conn.execute(
                "INSERT INTO settings (user_id, key, value) SELECT 0, key, value FROM settings_old"
            )
            conn.execute("DROP TABLE settings_old")


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------- 用户 ----------

def upsert_user(user: dict) -> None:
    """登录成功后记录/更新用户信息（主站 id 作为主键）。"""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO users (user_id, username, nickname, avatar, first_seen) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET "
            " username = excluded.username,"
            " nickname = excluded.nickname,"
            " avatar = excluded.avatar",
            (user["id"], user.get("username", ""), user.get("nickname", "") or user.get("username", ""),
             user.get("avatar", "") or "", now()),
        )


def claim_orphan_data(user_id: int) -> None:
    """第一个登录的用户认领单用户版本的旧数据（项目/会话）。"""
    with _connect() as conn:
        cnt = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if cnt > 1:
            return
        conn.execute("UPDATE projects SET user_id = ? WHERE user_id IS NULL", (user_id,))
        conn.execute("UPDATE conversations SET user_id = ? WHERE user_id IS NULL", (user_id,))


def is_owner(user_id: int) -> bool:
    """站长 = users 表里最早注册的用户（迁移时第一个认领旧数据的用户）。"""
    with _connect() as conn:
        row = conn.execute("SELECT MIN(user_id) AS uid FROM users").fetchone()
    return row is not None and row["uid"] == user_id


# ---------- 设置 ----------
# user_id=0 表示全局配置（作者公共 API）

def get_setting(user_id: int, key: str) -> str | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE user_id = ? AND key = ?", (user_id, key)
        ).fetchone()
    return row["value"] if row else None


def set_setting(user_id: int, key: str, value: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) "
            "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
            (user_id, key, value),
        )


# ---------- 项目 ----------

def create_project(user_id: int, name: str) -> int:
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO projects (name, user_id, created_at) VALUES (?, ?, ?)",
            (name, user_id, now()),
        )
        return cur.lastrowid


def list_projects(user_id: int) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, name, created_at FROM projects WHERE user_id = ? ORDER BY id",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_project(user_id: int, project_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, name, created_at FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
    return dict(row) if row else None


def rename_project(user_id: int, project_id: int, name: str) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE projects SET name = ? WHERE id = ? AND user_id = ?",
            (name, project_id, user_id),
        )
        return cur.rowcount > 0


def delete_project(user_id: int, project_id: int) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id)
        )
        return cur.rowcount > 0


def project_belongs(user_id: int, project_id: int) -> bool:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id)
        ).fetchone()
    return row is not None


# ---------- 对话 ----------

def create_conversation(user_id: int, project_id: int, role: str) -> int:
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO conversations (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
            (project_id, user_id, role, now()),
        )
        return cur.lastrowid


def latest_conversation(user_id: int, project_id: int, role: str) -> int | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM conversations "
            "WHERE project_id = ? AND user_id = ? AND role = ? ORDER BY id DESC LIMIT 1",
            (project_id, user_id, role),
        ).fetchone()
    return row["id"] if row else None


def add_message(conversation_id: int, role: str, content: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (conversation_id, role, content, now()),
        )


def get_messages(conversation_id: int) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id",
            (conversation_id,),
        ).fetchall()
    return [dict(r) for r in rows]

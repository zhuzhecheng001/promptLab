"""心脏函数：把 skill 文件渲染成 AI2 执行者的系统提示词。

整个产品的核心——AI2 所谓"加载 skill"，本质就是这一步。

注释约定：skill 文件里用 <!-- ... --> 写的注释是"作者备注"，
加载时会剥离，AI2（agent）永远看不到。
"""

import re

from backend.core.prompts import RUNNER_BASE_PROMPT

_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def strip_comments(text: str) -> str:
    """剥离 HTML 风格注释 <!-- ... -->。"""
    return _COMMENT_RE.sub("", text)


def render_runner_prompt(docs: dict[str, str]) -> str:
    """把项目的全部 Markdown 文档渲染为 AI2 执行者的系统提示词。

    SKILL.md 作为【工作指南】；其余文档（规范文档、prompt 等）依次作为补充细则。
    """
    main = strip_comments(docs.get("SKILL.md", "")).strip()
    parts = [RUNNER_BASE_PROMPT + "\n\n【工作指南】\n" + (main or "（无）")]
    for path, content in docs.items():
        if path == "SKILL.md":
            continue
        text = strip_comments(content).strip()
        if text:
            parts.append(f"\n\n【{path}】\n{text}")
    return "".join(parts)

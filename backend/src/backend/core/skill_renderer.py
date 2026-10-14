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


def render_runner_prompt(skill_md: str, spec_md: str = "") -> str:
    """把 SKILL.md（+ 可选规范文档）渲染为 AI2 的系统提示词。"""
    skill_md = strip_comments(skill_md).strip()
    spec_md = strip_comments(spec_md).strip()
    spec_section = spec_md if spec_md else "（无补充细则）"
    return (
        RUNNER_BASE_PROMPT
        + "\n\n【工作指南】\n"
        + skill_md
        + "\n\n【补充细则】\n"
        + spec_section
    )

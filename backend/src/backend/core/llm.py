"""OpenAI 兼容 LLM 客户端封装，支持流式输出。

DeepSeek、豆包、智谱、OpenAI 等都走 OpenAI 兼容协议，
用户只需提供 base_url + api_key + model 即可接入。
"""

from collections.abc import Iterator

from openai import OpenAI


def build_client(base_url: str, api_key: str) -> OpenAI:
    """创建 OpenAI 兼容客户端。"""
    return OpenAI(base_url=base_url, api_key=api_key)


def chat_stream(
    client: OpenAI,
    *,
    system_prompt: str,
    messages: list[dict],
    model: str,
    temperature: float = 0.7,
) -> Iterator[str]:
    """流式对话：逐段 yield 文本增量。

    messages 为不含 system 的对话消息列表：[{"role": "user"/"assistant", "content": ...}, ...]
    """
    full_messages = [{"role": "system", "content": system_prompt}, *messages]
    stream = client.chat.completions.create(
        model=model,
        messages=full_messages,
        temperature=temperature,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta

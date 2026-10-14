import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Loader2, Send } from 'lucide-react'
import type { Message } from '../types'

interface Props {
  title: string
  accent: string
  placeholder: string
  messages: Message[]
  streaming: boolean
  onSend: (text: string) => void
  hint?: string
  saveAction?: { label: string; onClick: (content: string) => void }
  guideFile?: string | null
  assistantName?: string
}

export default function ChatPanel({
  title,
  accent,
  placeholder,
  messages,
  streaming,
  onSend,
  hint,
  saveAction,
  guideFile,
  assistantName,
}: Props) {
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // 新消息到来时自动滚到底部；用户往上翻看历史时（远离底部）不打扰
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  const send = () => {
    const text = input.trim()
    if (!text || streaming) return
    onSend(text)
    setInput('')
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-header-dot" style={{ background: accent }} />
        <span style={{ color: accent }}>{title}</span>
      </div>
      {guideFile && <div className="chat-guide">当前指南：{guideFile}</div>}
      <div className="chat-body" ref={listRef}>
        {messages.length === 0 && <div className="chat-empty">{hint ?? '输入消息开始对话'}</div>}
        {messages.map((m, i) =>
          m.role === 'system' ? (
            <div key={i} className="msg-system">
              {m.content}
            </div>
          ) : (
            <div key={i} className={m.role === 'user' ? 'msg-user' : 'msg-ai'}>
              <div className="msg-label">
                {m.role === 'user' ? (
                  '你'
                ) : (
                  <>
                    <span style={{ color: accent }}>●</span>
                    {assistantName ?? title}
                  </>
                )}
              </div>
              <div className="msg-content" style={m.error ? { color: '#f87171' } : undefined}>
                {m.role === 'assistant' && !m.error ? (
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
              {m.role === 'assistant' && !m.error && saveAction && (
                <button
                  className="save-reply-btn"
                  onClick={() => saveAction.onClick(m.content)}
                >
                  {saveAction.label}
                </button>
              )}
            </div>
          ),
        )}
        {streaming && (
          <div className="streaming-dot">
            <Loader2 size={13} className="spin" />
            正在思考…
          </div>
        )}
      </div>
      <div className="chat-input-row">
        <input
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send} disabled={streaming || !input.trim()} title="发送">
          <Send size={14} />
          发送
        </button>
      </div>
    </div>
  )
}

import type { FileNode, ModelConfig, Project, User } from './types'
import { useAppStore } from './store'

// 部署时前端与后端同域（nginx 将 /api 反代到后端），本地开发用全路径
export const BASE = ''

async function j<T>(resp: Response): Promise<T> {
  if (resp.status === 401) {
    // 登录态失效：全局退回登录门
    useAppStore.getState().setUser(null)
    throw new Error('未登录')
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(body || `HTTP ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

export const api = {
  me: () => fetch(`${BASE}/api/auth/me`).then((r) => j<User>(r)),

  logout: () =>
    fetch(`${BASE}/api/auth/logout`, { method: 'POST' }).then((r) => j<{ ok: boolean }>(r)),

  listProjects: () => fetch(`${BASE}/api/projects`).then((r) => j<Project[]>(r)),

  createProject: (name: string) =>
    fetch(`${BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => j<Project>(r)),

  renameProject: (id: number, name: string) =>
    fetch(`${BASE}/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => j<{ id: number; name: string }>(r)),

  deleteProject: (id: number) =>
    fetch(`${BASE}/api/projects/${id}`, { method: 'DELETE' }).then((r) =>
      j<{ deleted: boolean; id: number }>(r),
    ),

  exportUrl: (id: number) => `${BASE}/api/projects/${id}/export`,

  getHistory: (projectId: number, role: 'builder' | 'runner') =>
    fetch(`${BASE}/api/projects/${projectId}/history?role=${role}`).then((r) =>
      j<{ conversation_id: number | null; messages: { role: string; content: string }[] }>(r),
    ),

  getFileTree: (projectId: number) =>
    fetch(`${BASE}/api/projects/${projectId}/files`).then((r) => j<FileNode[]>(r)),

  readFile: (path: string) =>
    fetch(`${BASE}/api/files/${path}`).then((r) => j<{ path: string; content: string }>(r)),

  writeFile: (path: string, content: string) =>
    fetch(`${BASE}/api/files/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then((r) => j<{ path: string; saved: boolean }>(r)),

  createFile: (path: string) =>
    fetch(`${BASE}/api/files/${path}`, { method: 'POST' }).then((r) =>
      j<{ path: string; created: boolean }>(r),
    ),

  deleteFile: (path: string) =>
    fetch(`${BASE}/api/files/${path}`, { method: 'DELETE' }).then((r) =>
      j<{ path: string; deleted: boolean }>(r),
    ),

  renameFile: (fromPath: string, toPath: string) =>
    fetch(`${BASE}/api/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_path: fromPath, to_path: toPath }),
    }).then((r) => j<{ from: string; to: string; renamed: boolean }>(r)),

  getSetting: (name: string) =>
    fetch(`${BASE}/api/settings/${name}`).then((r) => j<any>(r)),

  putSetting: (name: string, cfg: ModelConfig) =>
    fetch(`${BASE}/api/settings/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    }).then((r) => j<{ saved: boolean }>(r)),

  putFlag: (name: string, useAuthor: boolean) =>
    fetch(`${BASE}/api/settings/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_author: useAuthor }),
    }).then((r) => j<{ saved: boolean }>(r)),

  siteDoc: () =>
    fetch(`${BASE}/api/site-doc`).then((r) =>
      j<{ content: string; published: boolean; updated_at: string }>(r),
    ),

  submitFeedback: (text: string) =>
    fetch(`${BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    }).then((r) => j<{ ok: boolean }>(r)),
}

export interface StreamHandlers {
  onDelta: (t: string) => void
  onDone?: (conversationId: number) => void
  onError?: (msg: string) => void
}

export async function streamChat(
  endpoint: 'builder' | 'runner',
  body: {
    project_id: number
    message: string
    conversation_id?: number | null
    skill_file?: string | null
  },
  h: StreamHandlers,
): Promise<void> {
  let resp: Response
  try {
    resp = await fetch(`${BASE}/api/chat/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    h.onError?.('网络错误：无法连接后端（请确认后端已启动）')
    return
  }
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '')
    h.onError?.(text || `HTTP ${resp.status}`)
    return
  }
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const events = buf.split('\n\n')
      buf = events.pop() ?? ''
      for (const ev of events) {
        if (!ev.startsWith('data: ')) continue
        let payload: any
        try {
          payload = JSON.parse(ev.slice(6))
        } catch {
          continue
        }
        if (payload.delta) h.onDelta(payload.delta)
        if (payload.error) h.onError?.(payload.error)
        if (payload.done) h.onDone?.(payload.conversation_id)
      }
    }
  } catch (e) {
    h.onError?.(`流中断：${String(e)}`)
  }
}

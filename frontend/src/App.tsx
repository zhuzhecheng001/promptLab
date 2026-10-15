import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { BookOpen, ExternalLink, Hammer, Info, MessageSquare, Settings } from 'lucide-react'
import { api, streamChat } from './api'
import { useAppStore } from './store'
import FileTree from './components/FileTree'
import EditorView from './components/Editor'
import ChatPanel from './components/ChatPanel'
import SettingsModal from './components/SettingsModal'
import ModalInput from './components/ModalInput'
import ModalConfirm from './components/ModalConfirm'
import LoginGate from './components/LoginGate'

const APP_VERSION = 'v1.0.0'

type ModalState =
  | { kind: 'newProject' }
  | { kind: 'newFile' }
  | { kind: 'renameFile'; path: string }
  | { kind: 'renameProject'; id: number; name: string }
  | { kind: 'deleteFile'; path: string }
  | { kind: 'deleteProject'; id: number; name: string }
  | null

export default function App() {
  const store = useAppStore()
  const [modal, setModal] = useState<ModalState>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [docOpen, setDocOpen] = useState(false)
  const [docContent, setDocContent] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  // 问题反馈
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState('')
  // 模型是否已配置（决定对话框提示是否显示"需先配置模型"）
  const [modelReady, setModelReady] = useState({ builder: false, runner: false })

  // 登录后 / 关闭设置弹窗后刷新模型配置状态
  useEffect(() => {
    if (!store.user || store.settingsOpen) return
    let alive = true
    const load = (name: string) =>
      api.getSetting(name).catch(() => ({ configured: false }))
    Promise.all([
      load('author_api'),
      load('builder_model'),
      load('runner_model'),
      load('builder_use_author'),
      load('runner_use_author'),
    ]).then(([author, bm, rm, bua, rua]) => {
      if (!alive) return
      const useAuthorB = (author as any).configured && (bua as any).use_author
      const useAuthorR = (author as any).configured && (rua as any).use_author
      setModelReady({
        builder: !!useAuthorB || !!(bm as any).configured,
        runner: !!useAuthorR || !!(rm as any).configured,
      })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.user, store.settingsOpen])

  // 打开使用文档时实时从主站加载（后台编辑后刷新即见）
  useEffect(() => {
    if (!docOpen) return
    setDocLoading(true)
    api
      .siteDoc()
      .then((d) => setDocContent(d.published ? d.content : ''))
      .catch(() => setDocContent(''))
      .finally(() => setDocLoading(false))
  }, [docOpen])

  useEffect(() => {
    // 先验证登录态，成功后再加载项目
    api
      .me()
      .then((u) => {
        store.setUser(u)
        return api.listProjects()
      })
      .then((ps) => store.setProjects(ps))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectProject = async (id: number) => {
    store.setCurrentProjectId(id)
    store.setCurrentFile(null, '')
    try {
      const tree = await api.getFileTree(id)
      store.setFileTree(tree)
    } catch {
      store.setFileTree([])
    }
    // 加载该项目的工匠/测试历史（每个项目独立会话）
    const [bh, rh] = await Promise.all([
      api.getHistory(id, 'builder').catch(() => null),
      api.getHistory(id, 'runner').catch(() => null),
    ])
    if (bh) {
      store.setBuilderConvId(bh.conversation_id)
      store.setBuilderMessages(
        bh.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      )
    } else {
      store.setBuilderConvId(null)
      store.setBuilderMessages([])
    }
    if (rh) {
      store.setRunnerConvId(rh.conversation_id)
      store.setRunnerMessages(
        rh.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      )
    } else {
      store.setRunnerConvId(null)
      store.setRunnerMessages([])
    }
  }

  const openModal = (m: NonNullable<ModalState>) => setModal(m)
  const closeModal = () => setModal(null)

  const handleNewProject = async (name: string) => {
    closeModal()
    try {
      await api.createProject(name)
      const ps = await api.listProjects()
      store.setProjects(ps)
      const last = ps[ps.length - 1]
      if (last) await selectProject(last.id)
    } catch (e) {
      window.alert(`创建失败：${String(e)}`)
    }
  }

  const openFile = async (path: string) => {
    try {
      // 文件树返回相对路径，这里拼上项目 ID（接口要求 <项目ID>/<路径>）
      const fullPath = `${store.currentProjectId}/${path}`
      const f = await api.readFile(fullPath)
      store.setCurrentFile(f.path, f.content)
    } catch (e) {
      window.alert(`打开失败：${String(e)}`)
    }
  }

  const refreshTree = async () => {
    if (store.currentProjectId === null) return
    try {
      const tree = await api.getFileTree(store.currentProjectId)
      store.setFileTree(tree)
    } catch {
      store.setFileTree([])
    }
  }

  const handleNewFile = async (name: string) => {
    if (store.currentProjectId === null) return
    closeModal()
    // 不带扩展名时默认创建 markdown 文件（自动补 .md）
    const final = name.includes('.') ? name : `${name}.md`
    try {
      await api.createFile(`${store.currentProjectId}/${final}`)
      await refreshTree()
      await openFile(final)
    } catch (e) {
      window.alert(`新建失败：${String(e)}`)
    }
  }

  const handleRenameFile = async (newName: string) => {
    if (modal?.kind !== 'renameFile' || store.currentProjectId === null) return
    const oldFull = `${store.currentProjectId}/${modal.path}`
    const newFull = `${store.currentProjectId}/${newName}`
    closeModal()
    try {
      await api.renameFile(oldFull, newFull)
      await refreshTree()
      if (store.currentFilePath === oldFull) {
        // 正在编辑的文件被重命名：沿用当前内容打开新路径
        store.setCurrentFile(newFull, store.currentFileContent)
      }
    } catch (e) {
      window.alert(`重命名失败：${String(e)}`)
    }
  }

  const handleDeleteFile = async () => {
    if (modal?.kind !== 'deleteFile' || store.currentProjectId === null) return
    const full = `${store.currentProjectId}/${modal.path}`
    closeModal()
    try {
      await api.deleteFile(full)
      await refreshTree()
      if (store.currentFilePath === full) {
        store.setCurrentFile(null, '')
      }
    } catch (e) {
      window.alert(`删除失败：${String(e)}`)
    }
  }

  const handleRenameProject = async (newName: string) => {
    if (modal?.kind !== 'renameProject') return
    const id = modal.id
    closeModal()
    try {
      await api.renameProject(id, newName)
      const ps = await api.listProjects()
      store.setProjects(ps)
    } catch (e) {
      window.alert(`重命名失败：${String(e)}`)
    }
  }

  const handleDeleteProject = async () => {
    if (modal?.kind !== 'deleteProject') return
    const id = modal.id
    closeModal()
    try {
      await api.deleteProject(id)
      const ps = await api.listProjects()
      store.setProjects(ps)
      if (store.currentProjectId === id) {
        store.setCurrentProjectId(null)
        store.setFileTree([])
        store.setCurrentFile(null, '')
        store.setBuilderConvId(null)
        store.setBuilderMessages([])
        store.setRunnerConvId(null)
        store.setRunnerMessages([])
      }
    } catch (e) {
      window.alert(`删除失败：${String(e)}`)
    }
  }

  const exportProject = (id: number, name: string) => {
    const a = document.createElement('a')
    a.href = api.exportUrl(id)
    a.download = `${name}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const saveFile = async () => {
    if (!store.currentFilePath) return
    try {
      await api.writeFile(store.currentFilePath, store.currentFileContent)
      store.markSaved()
      store.setLastSaved(store.currentFileContent)
      // skill 文件变了：AI2 测试开启新会话，避免旧上下文干扰新 skill
      store.setRunnerConvId(null)
      store.setRunnerMessages([
        ...store.runnerMessages,
        { role: 'system', content: `skill 已更新（${store.currentFilePath}），本轮对话使用新会话` },
      ])
    } catch (e) {
      window.alert(`保存失败：${String(e)}`)
    }
  }

  const sendBuilder = async (text: string) => {
    if (!store.currentProjectId) return
    const base = store.builderMessages.filter((m) => !m.error)
    store.setBuilderMessages([...base, { role: 'user', content: text }])
    store.setBuilderStreaming(true)
    let acc = ''
    await streamChat(
      'builder',
      { project_id: store.currentProjectId, message: text, conversation_id: store.builderConvId },
      {
        onDelta: (t) => {
          acc += t
          store.setBuilderMessages([
            ...base,
            { role: 'user', content: text },
            { role: 'assistant', content: acc },
          ])
        },
        onDone: (id) => store.setBuilderConvId(id),
        onError: (e) =>
          store.setBuilderMessages([
            ...base,
            { role: 'user', content: text },
            { role: 'assistant', content: `[错误] ${e}`, error: true },
          ]),
      },
    )
    store.setBuilderStreaming(false)
  }

  const sendRunner = async (text: string) => {
    if (!store.currentProjectId) return
    // 自动保存当前打开的文件（如果有未保存改动），保证 AI2 用的是最新 skill
    if (store.currentFilePath && store.currentFileContent !== store.lastSavedContent) {
      try {
        await api.writeFile(store.currentFilePath, store.currentFileContent)
        store.setLastSaved(store.currentFileContent)
        // skill 变了，本轮自动开新会话
        store.setRunnerConvId(null)
      } catch {
        // 保存失败不阻塞对话，让用户自行处理
      }
    }
    const base = store.runnerMessages.filter((m) => !m.error)
    store.setRunnerMessages([...base, { role: 'user', content: text }])
    store.setRunnerStreaming(true)
    let acc = ''
    // 当前打开的是 .md 文件时，AI2 跟随该文件（去掉 "项目ID/" 前缀）
    const cur = store.currentFilePath ?? ''
    const skillFile = cur.endsWith('.md') ? cur.split('/').slice(1).join('/') : null
    await streamChat(
      'runner',
      {
        project_id: store.currentProjectId,
        message: text,
        conversation_id: store.runnerConvId,
        skill_file: skillFile,
      },
      {
        onDelta: (t) => {
          acc += t
          store.setRunnerMessages([
            ...base,
            { role: 'user', content: text },
            { role: 'assistant', content: acc },
          ])
        },
        onDone: (id) => store.setRunnerConvId(id),
        onError: (e) =>
          store.setRunnerMessages([
            ...base,
            { role: 'user', content: text },
            { role: 'assistant', content: `[错误] ${e}`, error: true },
          ]),
      },
    )
    store.setRunnerStreaming(false)
  }

  const submitFeedback = async () => {
    const text = feedbackText.trim()
    if (!text || feedbackSending) return
    setFeedbackSending(true)
    setFeedbackMsg('')
    try {
      await api.submitFeedback(text)
      setFeedbackMsg('已收到，谢谢反馈！')
      setFeedbackText('')
    } catch (e) {
      setFeedbackMsg(`发送失败：${String(e)}`)
    } finally {
      setFeedbackSending(false)
    }
  }

  const saveBuilderReplyToSkill = async (content: string) => {
    if (!store.currentProjectId) return
    // 优先提取 ```markdown 代码块，没有则整段写入
    const m = content.match(/```markdown\s*([\s\S]*?)```/)
    const toWrite = (m ? m[1] : content).trim()
    const path = store.currentFilePath ?? `${store.currentProjectId}/SKILL.md`
    try {
      await api.writeFile(path, toWrite)
      store.markSaved()
      const f = await api.readFile(path)
      store.setCurrentFile(f.path, f.content)
      window.alert(`已写入 ${path.split('/').pop()}，可在编辑器查看/修改，测试台将使用最新内容`)
    } catch (e) {
      window.alert(`写入失败：${String(e)}`)
    }
  }

  const addSegmentToFile = async (content: string) => {
    if (!store.currentProjectId) return
    const path = store.currentFilePath ?? `${store.currentProjectId}/SKILL.md`
    try {
      let existing = ''
      try {
        existing = (await api.readFile(path)).content
      } catch {
        // 文件不存在：视为新建
      }
      const toWrite = existing
        ? `${existing.trimEnd()}\n\n${content.trim()}\n`
        : `${content.trim()}\n`
      await api.writeFile(path, toWrite)
      store.markSaved()
      const f = await api.readFile(path)
      store.setCurrentFile(f.path, f.content)
      // skill 变化：测试台开新会话，避免旧上下文干扰
      store.setRunnerConvId(null)
      store.setRunnerMessages([
        ...store.runnerMessages,
        { role: 'system', content: `skill 已更新（${path}），本轮对话使用新会话` },
      ])
      window.alert(`已加入 ${path.split('/').pop()}（追加到末尾），可在编辑器查看`)
    } catch (e) {
      window.alert(`写入失败：${String(e)}`)
    }
  }

  return store.user === null ? (
    <LoginGate />
  ) : (
    <div className="app">
      <div className="topbar">
        <span className="logo">
          <span className="logo-icon">
            <Hammer size={15} />
          </span>
          promptLab
        </span>
        <span className="topbar-spacer" />
        <button onClick={() => setDocOpen(true)}>
          <BookOpen size={14} />
          使用文档
        </button>
        <button onClick={() => store.setSettingsOpen(true)}>
          <Settings size={14} />
          模型设置
        </button>
        <button onClick={() => setFeedbackOpen(true)}>
          <MessageSquare size={14} />
          问题反馈
        </button>
        <button onClick={() => setAboutOpen(true)}>
          <Info size={14} />
          关于
        </button>
        <span className="topbar-status">
          <span className={`status-dot ${store.currentProjectId !== null ? '' : 'off'}`} />
          {store.currentProjectId !== null ? '已选择项目' : '未选择项目'}
        </span>
        <div className="topbar-user">
          <span className="user-name">{store.user?.nickname || store.user?.username}</span>
          <a
            className="topbar-back"
            href="https://zhecheng.fun"
            target="_blank"
            rel="noreferrer"
            title="返回主站"
          >
            <ExternalLink size={13} />
            返回主站
          </a>
        </div>
      </div>
      <div className="main">
        <FileTree
          projects={store.projects}
          currentProjectId={store.currentProjectId}
          fileTree={store.fileTree}
          onSelectProject={selectProject}
          onSelectFile={openFile}
          onNewProject={() => openModal({ kind: 'newProject' })}
          onNewFile={() => openModal({ kind: 'newFile' })}
          onRename={(path) => openModal({ kind: 'renameFile', path })}
          onDelete={(path) => openModal({ kind: 'deleteFile', path })}
          onRenameProject={(id, name) => openModal({ kind: 'renameProject', id, name })}
          onDeleteProject={(id) => {
            const p = store.projects.find((x) => x.id === id)
            openModal({ kind: 'deleteProject', id, name: p?.name ?? `项目 ${id}` })
          }}
          onExportProject={exportProject}
        />
        <EditorView
          path={store.currentFilePath}
          content={store.currentFileContent}
          dirty={store.currentFileContent !== store.lastSavedContent}
          onChange={(v) => store.setCurrentFile(store.currentFilePath, v)}
          onSave={saveFile}
          savedFlag={store.savedFlag}
        />
        <div className="right-panels">
          <ChatPanel
            title="工匠台"
            accent="#3b82f6"
            placeholder="描述你想要的 skill…"
            messages={store.builderMessages}
            streaming={store.builderStreaming}
            onSend={sendBuilder}
            hint={modelReady.builder ? '让工匠帮你撰写项目文档（SKILL.md、规范文档等）' : '让工匠帮你撰写项目文档（SKILL.md、规范文档等，需先配置模型）'}
            saveAction={{
              label: `写入 ${store.currentFilePath?.split('/').pop() ?? 'SKILL.md'}`,
              onClick: saveBuilderReplyToSkill,
            }}
            addToFile={{
              name: store.currentFilePath?.split('/').pop() ?? 'SKILL.md',
              onAdd: addSegmentToFile,
            }}
          />
          <ChatPanel
            title="测试台"
            accent="#f59e0b"
            placeholder="对 skill 说话试试…"
            messages={store.runnerMessages}
            streaming={store.runnerStreaming}
            onSend={sendRunner}
            hint={modelReady.runner ? '让执行者按当前 skill 回答' : '让执行者按当前 skill 回答（需先配置模型）'}
            assistantName={
              store.projects.find((p) => p.id === store.currentProjectId)?.name ?? '测试台'
            }
            guideFile={
              store.currentFilePath?.endsWith('.md')
                ? store.currentFilePath.split('/').slice(1).join('/')
                : null
            }
          />
        </div>
      </div>
      <SettingsModal open={store.settingsOpen} onClose={() => store.setSettingsOpen(false)} />

      {docOpen && (
        <div className="modal-mask" onClick={() => setDocOpen(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} color="var(--accent)" />
              使用文档
            </h3>
            <div className="doc-body">
              {docLoading ? (
                <div className="doc-empty">加载中…</div>
              ) : docContent ? (
                <div className="doc-markdown">
                  <ReactMarkdown
                    components={{
                      img: ({ src, alt }) => (
                        <img
                          src={src?.startsWith('/avatars/') ? `https://zhecheng.fun${src}` : src}
                          alt={alt}
                          style={{ maxWidth: '100%', borderRadius: 8, margin: '8px 0' }}
                        />
                      ),
                    }}
                  >
                    {docContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="doc-empty">文档整理中，敬请期待…</div>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={() => setDocOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div className="modal-mask" onClick={() => setAboutOpen(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Hammer size={15} color="var(--accent)" />
              promptLab {APP_VERSION}
            </h3>
            <p className="about-desc">
              造 Skill 的 IDE：让 AI 帮你撰写、测试、调试属于你自己的 AI 助手。
            </p>
            <div className="modal-hint">© 2026 朱柘成 · zhecheng.fun</div>
            <div className="modal-hint">
              开源协议 MIT ·{' '}
              <a
                href="https://github.com/zhuzhecheng001/promptLab"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)' }}
              >
                GitHub 仓库
              </a>
            </div>
            <div className="modal-actions">
              <button onClick={() => setAboutOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {feedbackOpen && (
        <div className="modal-mask" onClick={() => setFeedbackOpen(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={15} color="var(--accent)" />
              问题反馈
            </h3>
            <textarea
              className="feedback-input"
              placeholder="遇到的问题、想加的功能，都可以写在这里…"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={5}
            />
            <div className="modal-hint">{feedbackMsg || '反馈会直接发到作者的站内后台，感谢帮助改进 promptLab！'}</div>
            <div className="modal-actions">
              <button onClick={submitFeedback} disabled={feedbackSending || !feedbackText.trim()}>
                {feedbackSending ? '发送中…' : '发送'}
              </button>
              <button onClick={() => setFeedbackOpen(false)} style={{ background: '#555' }}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalInput
        open={modal?.kind === 'newProject'}
        title="新建项目"
        label="项目名称"
        placeholder="例如：周报助手"
        confirmText="创建"
        onConfirm={handleNewProject}
        onClose={closeModal}
      />
      <ModalInput
        open={modal?.kind === 'newFile'}
        title="新建文件"
        label="文件名（不填扩展名时自动加 .md）"
        placeholder="prompt"
        confirmText="创建"
        onConfirm={handleNewFile}
        onClose={closeModal}
      />
      <ModalInput
        open={modal?.kind === 'renameFile'}
        title="重命名文件"
        label="新文件名"
        defaultValue={modal?.kind === 'renameFile' ? modal.path.split('/').pop() ?? '' : ''}
        confirmText="重命名"
        onConfirm={handleRenameFile}
        onClose={closeModal}
      />
      <ModalInput
        open={modal?.kind === 'renameProject'}
        title="重命名项目"
        label="新项目名称"
        defaultValue={modal?.kind === 'renameProject' ? modal.name : ''}
        confirmText="重命名"
        onConfirm={handleRenameProject}
        onClose={closeModal}
      />
      <ModalConfirm
        open={modal?.kind === 'deleteFile'}
        title="删除文件"
        message={`确定删除 "${modal?.kind === 'deleteFile' ? modal.path : ''}" 吗？删除前的版本会自动存为快照。`}
        confirmText="删除"
        onConfirm={handleDeleteFile}
        onClose={closeModal}
      />
      <ModalConfirm
        open={modal?.kind === 'deleteProject'}
        title="删除项目"
        message={`确定删除项目 "${modal?.kind === 'deleteProject' ? modal.name : ''}" 吗？项目文件和快照都会被删除，不可恢复。`}
        confirmText="删除"
        onConfirm={handleDeleteProject}
        onClose={closeModal}
      />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Hammer, LogOut, Plus, Settings } from 'lucide-react'
import { api, streamChat } from './api'
import { useAppStore } from './store'
import FileTree from './components/FileTree'
import EditorView from './components/Editor'
import ChatPanel from './components/ChatPanel'
import SettingsModal from './components/SettingsModal'
import ModalInput from './components/ModalInput'
import ModalConfirm from './components/ModalConfirm'
import LoginGate from './components/LoginGate'

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
    try {
      await api.createFile(`${store.currentProjectId}/${name}`)
      await refreshTree()
      await openFile(name)
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

  const saveBuilderReplyToSkill = async (content: string) => {
    if (!store.currentProjectId) return
    // 优先提取 ```markdown 代码块，没有则整段写入
    const m = content.match(/```markdown\s*([\s\S]*?)```/)
    const toWrite = (m ? m[1] : content).trim()
    const path = `${store.currentProjectId}/SKILL.md`
    try {
      await api.writeFile(path, toWrite)
      store.markSaved()
      const f = await api.readFile(path)
      store.setCurrentFile(f.path, f.content)
      window.alert('已写入 SKILL.md，可在编辑器查看/修改，测试台将使用最新内容')
    } catch (e) {
      window.alert(`写入失败：${String(e)}`)
    }
  }

  const handleLogout = async () => {
    try {
      await api.logout()
    } catch {
      // 忽略退出接口错误，直接刷新回登录门
    }
    location.reload()
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
          PromptLab
        </span>
        <button className="primary" onClick={() => openModal({ kind: 'newProject' })}>
          <Plus size={14} />
          新建项目
        </button>
        <button onClick={() => store.setSettingsOpen(true)}>
          <Settings size={14} />
          模型设置
        </button>
        <span className="topbar-status">
          <span className={`status-dot ${store.currentProjectId !== null ? '' : 'off'}`} />
          {store.currentProjectId !== null ? '已选择项目' : '未选择项目'}
        </span>
        <div className="topbar-user">
          <span className="user-name">{store.user?.nickname || store.user?.username}</span>
          <button onClick={handleLogout} title="退出登录">
            <LogOut size={13} />
          </button>
        </div>
      </div>
      <div className="main">
        <FileTree
          projects={store.projects}
          currentProjectId={store.currentProjectId}
          fileTree={store.fileTree}
          onSelectProject={selectProject}
          onSelectFile={openFile}
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
            hint="让工匠帮你写 SKILL.md（需先配置模型）"
            saveAction={{ label: '写入 SKILL.md', onClick: saveBuilderReplyToSkill }}
          />
          <ChatPanel
            title="测试台"
            accent="#f59e0b"
            placeholder="对 skill 说话试试…"
            messages={store.runnerMessages}
            streaming={store.runnerStreaming}
            onSend={sendRunner}
            hint="让执行者按当前 skill 回答（需先配置模型）"
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
        label="文件名（含扩展名，如 prompt.md）"
        placeholder="prompt.md"
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

import { create } from 'zustand'
import type { FileNode, Message, Project, User } from './types'

interface AppState {
  user: User | null
  projects: Project[]
  currentProjectId: number | null
  fileTree: FileNode[]
  currentFilePath: string | null
  currentFileContent: string
  lastSavedContent: string
  savedFlag: number
  builderMessages: Message[]
  runnerMessages: Message[]
  builderConvId: number | null
  runnerConvId: number | null
  builderStreaming: boolean
  runnerStreaming: boolean
  settingsOpen: boolean

  setUser: (u: User | null) => void
  setProjects: (p: Project[]) => void
  setCurrentProjectId: (id: number | null) => void
  setFileTree: (t: FileNode[]) => void
  setCurrentFile: (path: string | null, content: string) => void
  setLastSaved: (c: string) => void
  markSaved: () => void
  setBuilderMessages: (m: Message[]) => void
  setRunnerMessages: (m: Message[]) => void
  setBuilderConvId: (id: number | null) => void
  setRunnerConvId: (id: number | null) => void
  setBuilderStreaming: (v: boolean) => void
  setRunnerStreaming: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  projects: [],
  currentProjectId: null,
  fileTree: [],
  currentFilePath: null,
  currentFileContent: '',
  lastSavedContent: '',
  savedFlag: 0,
  builderMessages: [],
  runnerMessages: [],
  builderConvId: null,
  runnerConvId: null,
  builderStreaming: false,
  runnerStreaming: false,
  settingsOpen: false,

  setUser: (u) => set({ user: u }),
  setProjects: (p) => set({ projects: p }),
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  setFileTree: (t) => set({ fileTree: t }),
  setCurrentFile: (path, content) =>
    set({ currentFilePath: path, currentFileContent: content, lastSavedContent: content }),
  setLastSaved: (c) => set({ lastSavedContent: c }),
  markSaved: () => set((s) => ({ savedFlag: s.savedFlag + 1 })),
  setBuilderMessages: (m) => set({ builderMessages: m }),
  setRunnerMessages: (m) => set({ runnerMessages: m }),
  setBuilderConvId: (id) => set({ builderConvId: id }),
  setRunnerConvId: (id) => set({ runnerConvId: id }),
  setBuilderStreaming: (v) => set({ builderStreaming: v }),
  setRunnerStreaming: (v) => set({ runnerStreaming: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
}))

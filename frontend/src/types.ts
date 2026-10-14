export interface Project {
  id: number
  name: string
  created_at: string
}

export interface User {
  id: number
  username: string
  nickname: string
  avatar?: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  error?: boolean
}

export interface ModelConfig {
  base_url: string
  api_key: string
  model: string
}

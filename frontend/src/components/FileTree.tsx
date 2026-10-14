import { Download, FileText, Folder, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FileNode, Project } from '../types'

interface Props {
  projects: Project[]
  currentProjectId: number | null
  fileTree: FileNode[]
  onSelectProject: (id: number) => void
  onSelectFile: (path: string) => void
  onNewProject: () => void
  onNewFile: () => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
  onRenameProject: (id: number, name: string) => void
  onDeleteProject: (id: number) => void
  onExportProject: (id: number, name: string) => void
}

function renderTree(
  nodes: FileNode[],
  onSelectFile: (p: string) => void,
  onRename: (p: string) => void,
  onDelete: (p: string) => void,
  depth: number,
) {
  return nodes.map((n) => (
    <div key={n.path}>
      {n.type === 'dir' ? (
        <div className="dir-item" style={{ paddingLeft: 12 + depth * 16 }}>
          <Folder size={14} />
          {n.name}
          {n.children && renderTree(n.children, onSelectFile, onRename, onDelete, depth + 1)}
        </div>
      ) : (
        <div
          className="file-item"
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => onSelectFile(n.path)}
        >
          <span className="file-name">
            <span className="file-icon">
              <FileText size={13} />
            </span>
            {n.name}
          </span>
          <span className="file-actions" onClick={(e) => e.stopPropagation()}>
            <button title="重命名" onClick={() => onRename(n.path)}>
              <Pencil size={12} />
            </button>
            <button title="删除" onClick={() => onDelete(n.path)}>
              <Trash2 size={12} />
            </button>
          </span>
        </div>
      )}
    </div>
  ))
}

export default function FileTree({
  projects,
  currentProjectId,
  fileTree,
  onSelectProject,
  onSelectFile,
  onNewProject,
  onNewFile,
  onRename,
  onDelete,
  onRenameProject,
  onDeleteProject,
  onExportProject,
}: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-title">
        项目
        <button className="new-file-btn" title="新建项目" onClick={onNewProject}>
          <Plus size={13} />
        </button>
      </div>
      {projects.length === 0 && (
        <div className="file-item" style={{ color: 'var(--text-faint)' }}>
          暂无项目，点上方"+"新建
        </div>
      )}
      {projects.map((p) => (
        <div
          key={p.id}
          className={`project-item ${p.id === currentProjectId ? 'active' : ''}`}
          onClick={() => onSelectProject(p.id)}
        >
          <span className="file-name">
            <span className="file-icon">
              <Folder size={14} />
            </span>
            {p.name}
          </span>
          <span className="file-actions" onClick={(e) => e.stopPropagation()}>
            <button title="重命名项目" onClick={() => onRenameProject(p.id, p.name)}>
              <Pencil size={12} />
            </button>
            <button title="导出项目" onClick={() => onExportProject(p.id, p.name)}>
              <Download size={12} />
            </button>
            <button title="删除项目" onClick={() => onDeleteProject(p.id)}>
              <Trash2 size={12} />
            </button>
          </span>
        </div>
      ))}
      {currentProjectId !== null && (
        <>
          <div className="sidebar-title" style={{ marginTop: 10 }}>
            文件
            <button className="new-file-btn" title="新建文件" onClick={onNewFile}>
              <Plus size={13} />
            </button>
          </div>
          {fileTree.length === 0 ? (
            <div className="file-item" style={{ color: 'var(--text-faint)' }}>无文件</div>
          ) : (
            renderTree(fileTree, onSelectFile, onRename, onDelete, 0)
          )}
        </>
      )}
    </div>
  )
}

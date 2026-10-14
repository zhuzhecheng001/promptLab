import Editor, { type Monaco } from '@monaco-editor/react'
import { FileCode2, Save } from 'lucide-react'

interface Props {
  path: string | null
  content: string
  dirty: boolean
  onChange: (v: string) => void
  onSave: () => void
  savedFlag: number
}

function langOf(path: string | null): string {
  if (!path) return 'plaintext'
  if (path.endsWith('.md')) return 'markdown'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.py')) return 'python'
  if (path.endsWith('.js') || path.endsWith('.ts')) return 'typescript'
  return 'plaintext'
}

/** PromptLab 定制 Monaco 深色主题 */
function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme('promptlab-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '7d8ba1', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'string', foreground: 'addb67' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'type.identifier', foreground: '82aaff' },
      { token: 'function', foreground: 'dcdcaa' },
      { token: 'tag', foreground: 'f07178' },
      { token: 'attribute.name', foreground: 'c792ea' },
      { token: 'attribute.value', foreground: 'addb67' },
      { token: 'delimiter', foreground: 'd6deeb' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#d6deeb',
      'editor.lineHighlightBackground': '#12181f',
      'editorLineNumber.foreground': '#3d4451',
      'editorLineNumber.activeForeground': '#9aa5b5',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#5b8cff',
      'editorIndentGuide.background1': '#1c2330',
      'editorIndentGuide.activeBackground1': '#2b3444',
      'editorGutter.background': '#0d1117',
      'editorWidget.background': '#171c25',
      'editorSuggestWidget.background': '#171c25',
      'editorSuggestWidget.border': '#232c3a',
      'editorHoverWidget.background': '#171c25',
      'editorHoverWidget.border': '#232c3a',
    },
  })
}

export default function EditorView({ path, content, dirty, onChange, onSave, savedFlag }: Props) {
  return (
    <div className="editor-wrap">
      <div className="editor-header">
        <span>
          <FileCode2 size={14} color="#8b93a3" />
          {path ?? '未打开文件'}
        </span>
        <div>
          {path && dirty && <span className="dirty-hint">未保存</span>}
          {!dirty && savedFlag > 0 && <span className="saved-hint">已保存 ✓</span>}
          <button onClick={onSave} disabled={!path}>
            <Save size={13} />
            保存
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          height="100%"
          language={langOf(path)}
          value={content}
          onChange={(v) => onChange(v ?? '')}
          theme="promptlab-dark"
          beforeMount={defineTheme}
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
            minimap: { enabled: false },
            wordWrap: 'on',
            smoothScrolling: true,
            cursorSmoothCaretAnimation: 'on',
            padding: { top: 10 },
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Check, KeyRound } from 'lucide-react'
import { api } from '../api'
import type { ModelConfig } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

const DEFAULT_DS: ModelConfig = {
  base_url: 'https://api.deepseek.com',
  api_key: '',
  model: 'deepseek-chat',
}

export default function SettingsModal({ open, onClose }: Props) {
  const [author, setAuthor] = useState<ModelConfig>(DEFAULT_DS)
  const [builder, setBuilder] = useState<ModelConfig>(DEFAULT_DS)
  const [runner, setRunner] = useState<ModelConfig>(DEFAULT_DS)
  const [builderUseAuthor, setBuilderUseAuthor] = useState(false)
  const [runnerUseAuthor, setRunnerUseAuthor] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    if (!open) return
    const load = (name: string, set: (c: ModelConfig) => void) =>
      api
        .getSetting(name)
        .then((r) => {
          if (r.configured)
            set({ ...DEFAULT_DS, base_url: r.base_url, model: r.model, api_key: '' })
        })
        .catch(() => {})
    load('author_api', setAuthor)
    load('builder_model', setBuilder)
    load('runner_model', setRunner)
    api
      .getSetting('builder_use_author')
      .then((r) => r.configured && setBuilderUseAuthor(r.use_author))
      .catch(() => {})
    api
      .getSetting('runner_use_author')
      .then((r) => r.configured && setRunnerUseAuthor(r.use_author))
      .catch(() => {})
  }, [open])

  if (!open) return null

  const save = async () => {
    try {
      await api.putSetting('author_api', author)
      await api.putSetting('builder_model', builder)
      await api.putSetting('runner_model', runner)
      await api.putFlag('builder_use_author', builderUseAuthor)
      await api.putFlag('runner_use_author', runnerUseAuthor)
      setSaved('已保存 ✓（key 不会回显，留空表示不修改）')
      setTimeout(() => setSaved(''), 3000)
    } catch (e) {
      setSaved(`保存失败：${String(e)}`)
    }
  }

  const inputs = (
    cfg: ModelConfig,
    set: (c: ModelConfig) => void,
    disabled: boolean,
  ) => (
    <>
      <label>Base URL</label>
      <input
        value={cfg.base_url}
        disabled={disabled}
        onChange={(e) => set({ ...cfg, base_url: e.target.value })}
      />
      <label>API Key</label>
      <input
        type="password"
        placeholder="留空则不修改已保存的 key"
        value={cfg.api_key}
        disabled={disabled}
        onChange={(e) => set({ ...cfg, api_key: e.target.value })}
      />
      <label>模型名</label>
      <input
        value={cfg.model}
        disabled={disabled}
        onChange={(e) => set({ ...cfg, model: e.target.value })}
      />
    </>
  )

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={16} color="var(--accent)" />
          模型设置
        </h3>

        <div className="block-title">作者的 API（公共接口）</div>
        {inputs(author, setAuthor, false)}

        <div className="block-title">工匠</div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={builderUseAuthor}
            onChange={(e) => setBuilderUseAuthor(e.target.checked)}
          />
          <span className="cb-box">
            <Check size={11} />
          </span>
          借用作者的 API
        </label>
        <div className="modal-hint">
          勾选：工匠 调用上方"作者的 API"（无需填 key）；不勾选：用下方自定义配置
        </div>
        {inputs(builder, setBuilder, builderUseAuthor)}
        <div className="modal-hint">
          {builderUseAuthor ? '正在使用作者的 API，下方配置无需填写' : '自定义该角色的模型'}
        </div>

        <div className="block-title">执行者</div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={runnerUseAuthor}
            onChange={(e) => setRunnerUseAuthor(e.target.checked)}
          />
          <span className="cb-box">
            <Check size={11} />
          </span>
          借用作者的 API
        </label>
        <div className="modal-hint">
          勾选：执行者 调用上方"作者的 API"（无需填 key）；不勾选：用下方自定义配置
        </div>
        {inputs(runner, setRunner, runnerUseAuthor)}
        <div className="modal-hint">
          {runnerUseAuthor
            ? '正在使用作者的 API，下方配置无需填写'
            : '想测不同模型的表现，换成别的 base_url / key / model 即可'}
        </div>

        <div className="modal-actions">
          <span className="saved-hint">{saved}</span>
          <button onClick={save}>保存</button>
          <button onClick={onClose} style={{ background: '#555' }}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

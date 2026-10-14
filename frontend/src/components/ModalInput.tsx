import { useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  title: string
  label: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  onConfirm: (value: string) => void
  onClose: () => void
}

export default function ModalInput({
  open,
  title,
  label,
  defaultValue = '',
  placeholder,
  confirmText = '确定',
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 30)
    }
  }, [open, defaultValue])

  if (!open) return null

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onConfirm(v)
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <label>{label}</label>
        <input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="modal-actions">
          <button
            onClick={onClose}
            style={{ background: '#2a3446', color: 'var(--text-dim)', fontWeight: 400 }}
          >
            取消
          </button>
          <button onClick={submit} disabled={!value.trim()}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

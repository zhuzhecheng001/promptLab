import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmText?: string
  onConfirm: () => void
  onClose: () => void
}

export default function ModalConfirm({
  open,
  title,
  message,
  confirmText = '删除',
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="var(--danger)" />
          {title}
        </h3>
        <div className="modal-hint" style={{ marginTop: 10, color: 'var(--text-dim)' }}>
          {message}
        </div>
        <div className="modal-actions">
          <button
            onClick={onClose}
            style={{ background: '#2a3446', color: 'var(--text-dim)', fontWeight: 400 }}
          >
            取消
          </button>
          <button onClick={onConfirm} style={{ background: 'var(--danger)' }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

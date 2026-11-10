import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

export function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const label = useId()
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="workspace-dialog" aria-labelledby={label} onClose={close}>
    <button type="button" className="workspace-icon dialog-close" aria-label="Close dialog" onClick={close}><X size={18} aria-hidden="true" /></button>
    <h2 id={label}>{title}</h2>
    <div className="workspace-dialog-body">{children}</div>
  </dialog>
}

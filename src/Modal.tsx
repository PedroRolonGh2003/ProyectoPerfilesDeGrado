import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ children, label, className, onClose }: { children: ReactNode; label: string; className: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return createPortal(<dialog aria-label={label} className={className} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }} ref={ref}>{children}</dialog>, document.body)
}

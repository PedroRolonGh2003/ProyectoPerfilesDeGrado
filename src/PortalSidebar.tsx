import { type ReactNode, useState } from 'react'
import { Modal } from './Modal'

export function PortalSidebar({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <aside className={`student-sidebar ${className}`}>{children}</aside>
    <button aria-label="Abrir menú" aria-expanded={open} className="mobile-menu-trigger" onClick={() => setOpen(true)} type="button"><svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
    {open && <Modal className="mobile-menu-dialog" label="Menú de navegación" onClose={() => setOpen(false)}>
      <div className="mobile-menu-heading"><strong>Menú</strong><button aria-label="Cerrar menú" onClick={() => setOpen(false)} type="button">×</button></div>
      <div className="mobile-menu-content" onClick={(event) => { if ((event.target as HTMLElement).closest('button')) setOpen(false) }}>{children}</div>
    </Modal>}
  </>
}

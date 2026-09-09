import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useState } from 'react'

type IconName =
  | 'arrow'
  | 'bell'
  | 'check'
  | 'chevron'
  | 'clipboard'
  | 'dashboard'
  | 'download'
  | 'exit'
  | 'eye'
  | 'eyeOff'
  | 'file'
  | 'help'
  | 'lock'
  | 'plus'
  | 'trash'
  | 'upload'
  | 'user'

type RoleCode = 'ESTUDIANTE' | 'TUTOR' | 'REVISOR' | 'ADMINISTRADOR'

type UserBase = {
  id: string
  fullName: string
  email: string
  career: string
  roles: RoleCode[]
}
type StudentUser = UserBase & {
  role: Extract<RoleCode, 'ESTUDIANTE'>
  studentId: string
  teacherId: null
  registration: string
}
type TutorUser = UserBase & {
  role: Extract<RoleCode, 'TUTOR'>
  studentId: null
  teacherId: string
  registration: null
}
type ReviewerUser = UserBase & {
  role: Extract<RoleCode, 'REVISOR'>
  studentId: null
  teacherId: string
  registration: null
}
type AdministratorUser = UserBase & {
  role: Extract<RoleCode, 'ADMINISTRADOR'>
  studentId: null
  teacherId: null
  registration: null
}
type User = StudentUser | TutorUser | ReviewerUser | AdministratorUser
type TutorAssignment = {
  id: string
  projectId: string
  code: string
  title: string
  description: string
  generalObjective: string
  management: string
  modality: string
  phase: string
  status: string
  students: string
  registrations: string
  requestedAt: string
  respondedAt: string | null
  deadline: string | null
  profile: { documentId: string; versionId: string | null; filename: string | null; version: number | null; uploadedAt: string | null } | null
}
type AppNotification = {
  id: string
  projectId: string | null
  type: string
  title: string
  message: string
  link: string | null
  role: RoleCode
  readAt: string | null
  createdAt: string
}
type TutorDashboard = {
  user: TutorUser
  invitations: TutorAssignment[]
  projects: TutorAssignment[]
  notifications: AppNotification[]
  unreadCount: number
}
type ReviewerObservation = { id: string; number: number; detail: string; status: string }
type ReviewerReview = {
  id: string
  roundId: string
  assignmentId: string
  assignmentType: 'REVISOR_1' | 'REVISOR_2'
  projectId: string
  code: string
  title: string
  description: string
  generalObjective: string
  management: string
  modality: string
  phase: string
  status: string
  students: string
  registrations: string
  roundNumber: number
  requestedAt: string
  deadline: string
  closedAt: string | null
  decision: 'PENDIENTE' | 'APROBADO' | 'OBSERVADO' | 'RECHAZADO'
  generalComment: string | null
  decidedAt: string | null
  canSubmit: boolean
  profile: { documentId: string; versionId: string; filename: string; version: number; uploadedAt: string }
  observations: ReviewerObservation[]
  teamReviews: { assignmentType: string; reviewer: string; decision: string; decidedAt: string | null }[]
}
type ReviewerDashboard = {
  user: ReviewerUser
  summary: { pending: number; overdue: number; completed: number }
  pendingReviews: ReviewerReview[]
  completedReviews: ReviewerReview[]
  notifications: AppNotification[]
  unreadCount: number
}
type AdminProject = {
  id: string
  code: string
  title: string
  students: string
  tutor: string
  tutorStatus: 'CONFIRMADA' | 'PENDIENTE' | 'SIN_ASIGNAR'
  management: string
  modality: string
  phaseCode: string
  phase: string
  statusCode: string
  status: string
  isFinal: boolean
  registeredAt: string
  reviewDeadline: string | null
  pendingReviews: number
  isOverdue: boolean
}
type AdminDashboard = {
  user: AdministratorUser
  summary: { total: number; registered: number; inReview: number; observed: number; overdue: number }
  statuses: { code: string; name: string }[]
  projects: AdminProject[]
}
type AdminStaff = { id: string; name: string; email: string; roles: ('TUTOR' | 'REVISOR')[] }
type AdminAssignment = {
  id: string
  type: 'TUTOR' | 'REVISOR_1' | 'REVISOR_2'
  active: boolean
  teacherId: string
  teacher: string
  email: string
  assignedAt: string
  deadline: string | null
  finishedAt: string | null
  respondedAt: string | null
  reason: string | null
}
type AdminProjectDetail = {
  project: Omit<AdminProject, 'students' | 'tutor' | 'tutorStatus' | 'isFinal' | 'reviewDeadline' | 'pendingReviews' | 'isOverdue'> & { description: string; generalObjective: string }
  students: { name: string; registration: string }[]
  staff: AdminStaff[]
  assignments: AdminAssignment[]
  profiles: { documentId: string; versionId: string; version: number; filename: string; uploadedAt: string; size: number }[]
  rounds: { id: string; number: number; version: number; requestedAt: string; deadline: string; closedAt: string | null; reviews: { id: string; decision: string; decidedAt: string | null; comment: string | null; assignmentType: string; reviewer: string; openObservations: number }[] }[]
  statuses: { code: string; name: string }[]
  phases: { code: string; name: string }[]
  cancellation: { reason: string; detail: string; cancelledAt: string } | null
}
type SessionResponse = { user: User }
type NotificationsResponse = { notifications: AppNotification[]; unreadCount: number }

type Option = { id: string; codigo: string; nombre: string }
type Tutor = { id: string; name: string }
type Project = {
  id: string
  code: string
  title: string
  description: string
  generalObjective: string
  management: string
  modality: string
  phase: string
  status: string
  registeredAt: string
}
type Bootstrap = {
  user: StudentUser
  managements: Option[]
  modalities: Option[]
  tutors: Tutor[]
  project: Project | null
}
type DocumentVersion = {
  id: string
  number: number
  filename: string
  mimeType: string
  size: number
  uploadedAt: string
  comment: string | null
}
type StudentDocument = {
  id: string
  projectId: string
  projectCode: string
  name: string
  type: string
  phase: string
  status: string
  canUploadVersion: boolean
  createdAt: string
  totalVersions: number
  latest: DocumentVersion | null
  versions: DocumentVersion[]
}
type OverviewTutor = {
  name: string
  status: 'CONFIRMADO' | 'PROPUESTO'
  assignedAt: string
}
type OverviewProfile = {
  documentId: string
  name: string
  versionId: string | null
  version: number | null
  filename: string | null
  size: number | null
  uploadedAt: string | null
}
type OverviewHistory = {
  changedAt: string
  status: string | null
  phase: string | null
  reason: string | null
}
type StudentOverview = {
  project: Project | null
  tutor: OverviewTutor | null
  objectives: { number: number; description: string }[]
  profile: OverviewProfile | null
  history: OverviewHistory[]
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  const body = await response.json().catch(() => ({})) as { message?: string }
  if (!response.ok) throw new Error(body.message ?? 'No fue posible completar la operación.')
  return body as T
}

function Icon({ name }: { name: IconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  }

  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-2.4 7-2.4 9h16.8c0-2-2.4-2-2.4-9" /><path d="M10 21h4" /></>,
    check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.1 2.35 2.35 5.1-5.1" /></>,
    chevron: <path d="m8.5 10 3.5 3.5 3.5-3.5" />,
    clipboard: <><rect x="5" y="5" width="14" height="15" rx="2" /><path d="M9 5V3.8h6V5M9 10h6M9 14h4.25" /></>,
    dashboard: <><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></>,
    download: <><path d="M12 4v10M8 10l4 4 4-4" /><path d="M5 18v2h14v-2" /></>,
    exit: <><path d="M10 5H6.75A1.75 1.75 0 0 0 5 6.75v10.5C5 18.22 5.78 19 6.75 19H10" /><path d="M13 8l4 4-4 4M8 12h9" /></>,
    eye: <><path d="M2.8 12s3.25-5 9.2-5 9.2 5 9.2 5-3.25 5-9.2 5-9.2-5-9.2-5Z" /><circle cx="12" cy="12" r="2.2" /></>,
    eyeOff: <><path d="M2.8 12s3.25-5 9.2-5 9.2 5 9.2 5-3.25 5-9.2 5-9.2-5-9.2-5Z" /><circle cx="12" cy="12" r="2.2" /><path d="m4 4 16 16" /></>,
    file: <><path d="M6.5 3.5h7l4 4v12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5.5 19.5V5a1.5 1.5 0 0 1 1-1.5Z" /><path d="M13.5 3.5v4h4M8.5 12h7M8.5 15.5h5" /></>,
    help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.45 2.45 0 1 1 3.68 2.12c-.85.5-1.28.94-1.28 1.88" /><path d="M12 16.4h.01" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <><path d="M4.5 7h15M9.5 7V5.2h5V7M7.5 7l.7 12h7.6l.7-12M10 10.5v5M14 10.5v5" /></>,
    upload: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 14.5V19h14v-4.5" /></>,
    user: <><circle cx="12" cy="8" r="3.25" /><path d="M5 20c.55-3.56 3.1-5.35 7-5.35s6.45 1.79 7 5.35" /></>,
  }

  return <svg aria-hidden="true" {...common}>{paths[name]}</svg>
}

function BrandLogo({ className = 'brand-logo' }: { className?: string }) {
  return <img alt="Universidad Privada del Valle" className={className} height="447" src="/univalle-logo.png" width="447" />
}

function roleLabel(role: RoleCode) {
  if (role === 'ADMINISTRADOR') return 'Administración'
  if (role === 'ESTUDIANTE') return 'Estudiante'
  return role[0] + role.slice(1).toLowerCase()
}

function roleDescription(role: RoleCode) {
  if (role === 'TUTOR') return 'Acompañamiento académico'
  if (role === 'REVISOR') return 'Evaluación de perfiles'
  if (role === 'ADMINISTRADOR') return 'Gestión operativa'
  return 'Seguimiento de mi proyecto'
}

function RoleSwitcher({ user, isSwitching, onRoleChange }: { user: User; isSwitching: boolean; onRoleChange: (role: RoleCode) => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false)
  const roles = [...new Set(user.roles.length > 0 ? user.roles : [user.role])]

  if (roles.length === 1) return <span className={`role-single-badge role-${user.role.toLowerCase()}`}>{roleLabel(user.role)}</span>

  return <div className={isOpen ? 'role-switcher is-open' : 'role-switcher'}>
    <button aria-expanded={isOpen} aria-haspopup="menu" aria-label={`Cambiar vista, rol activo: ${roleLabel(user.role)}`} className="role-switcher-trigger" disabled={isSwitching} onClick={() => setIsOpen((open) => !open)} type="button">
      <span className={`active-role-label role-${user.role.toLowerCase()}`}>{roleLabel(user.role)}</span><Icon name="chevron" />
    </button>
    <div aria-label="Vistas disponibles" className="role-switcher-menu">
      <p>CAMBIAR VISTA</p>
      {roles.map((role) => <button aria-current={role === user.role ? 'page' : undefined} className={`role-option role-${role.toLowerCase()}${role === user.role ? ' is-active' : ''}`} disabled={isSwitching || role === user.role} key={role} onClick={() => { setIsOpen(false); void onRoleChange(role) }} type="button"><span className="role-option-color" /><span><strong>{roleLabel(role)}</strong><small>{roleDescription(role)}</small></span>{role === user.role && <em>Actual</em>}</button>)}
    </div>
  </div>
}

function SessionActions({ user, notifications, isSwitching, onRoleChange, onNotificationClick }: { user: User; notifications: AppNotification[]; isSwitching: boolean; onRoleChange: (role: RoleCode) => Promise<void>; onNotificationClick: (notification: AppNotification) => Promise<void> }) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const initials = user.fullName.split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase() || 'U'
  const unreadCount = notifications.filter((notification) => !notification.readAt).length

  return <div className="session-info">
    <div className={isNotificationOpen ? 'notification-menu is-open' : 'notification-menu'}>
      <button aria-expanded={isNotificationOpen} aria-haspopup="menu" aria-label="Ver notificaciones" className="notification-bell" onClick={() => setIsNotificationOpen((open) => !open)} type="button"><Icon name="bell" />{unreadCount > 0 && <b>{unreadCount > 9 ? '9+' : unreadCount}</b>}</button>
      <div aria-label="Notificaciones" className="notification-popover">
        <div><strong>Notificaciones</strong><span>{unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}</span></div>
        {notifications.length === 0 ? <p className="notification-empty">No tienes notificaciones.</p> : notifications.slice(0, 6).map((notification) => <button className={notification.readAt ? 'notification-popover-item' : 'notification-popover-item is-unread'} key={notification.id} onClick={() => { setIsNotificationOpen(false); void onNotificationClick(notification) }} type="button"><span className={`notification-role-badge role-${notification.role.toLowerCase()}`}>{roleLabel(notification.role)}</span><strong>{notification.title}</strong><small>{notification.message}</small></button>)}
      </div>
    </div>
    <RoleSwitcher isSwitching={isSwitching} onRoleChange={onRoleChange} user={user} />
    <span className="student-avatar">{initials}</span><span><strong>{user.fullName}</strong><small>{user.career}</small></span>
  </div>
}

function LoginView({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!identifier.trim() || !password) {
      setMessage('Ingresa tu correo institucional y tu contraseña para continuar.')
      return
    }

    setMessage('')
    setIsSubmitting(true)
    try {
      await api('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, remember }),
      })
      await onAuthenticated()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar sesión.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="welcome-panel" aria-label="Información del sistema">
        <div className="welcome-content">
          <a className="wordmark" href="#inicio" aria-label="Univalle, inicio">
            <BrandLogo />
            <span><strong>UNIVALLE</strong><small>Gestión académica</small></span>
          </a>

          <div className="welcome-copy">
            <p className="eyebrow">Sistema académico</p>
            <h1>Seguimiento de procesos de titulación</h1>
            <p className="welcome-description">Un espacio claro para acompañar cada proyecto desde su perfil hasta la titulación.</p>
          </div>

          <div className="phase-card">
            <p>Tu proceso, siempre visible</p>
            <ol>
              <li><span>01</span><div><strong>Perfil</strong><small>Registro y revisión</small></div></li>
              <li><span>02</span><div><strong>Documento privado</strong><small>Revisión y aprobación</small></div></li>
              <li><span>03</span><div><strong>Documento público</strong><small>Defensa y titulación</small></div></li>
            </ol>
          </div>
        </div>
        <p className="panel-footer">Gestión académica · Seguimiento de Titulación</p>
      </section>

      <section className="form-panel" id="inicio" aria-label="Inicio de sesión">
        <div className="form-wrapper">
          <div className="mobile-brand"><BrandLogo /><strong>UNIVALLE</strong></div>
          <header className="form-heading">
            <p className="eyebrow">Acceso al sistema</p>
            <h2>Bienvenido</h2>
            <p>Ingresa con tus credenciales institucionales.</p>
          </header>

          <form onSubmit={handleSubmit} noValidate>
            <label className="field-label" htmlFor="identifier">Correo institucional</label>
            <div className="input-shell"><Icon name="user" /><input autoComplete="username" disabled={isSubmitting} id="identifier" name="identifier" onChange={(event) => setIdentifier(event.target.value)} placeholder="nombre@univalle.edu" type="email" value={identifier} /></div>
            <div className="password-heading"><label className="field-label" htmlFor="password">Contraseña</label><button className="text-button" onClick={() => setMessage('Comunícate con Administración para recuperar tu acceso.')} type="button">¿Olvidaste tu contraseña?</button></div>
            <div className="input-shell"><Icon name="lock" /><input autoComplete="current-password" disabled={isSubmitting} id="password" name="password" onChange={(event) => setPassword(event.target.value)} placeholder="Ingresa tu contraseña" type={showPassword ? 'text' : 'password'} value={password} /><button aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="icon-button" onClick={() => setShowPassword((visible) => !visible)} type="button"><Icon name={showPassword ? 'eyeOff' : 'eye'} /></button></div>
            <label className="remember-option"><input checked={remember} disabled={isSubmitting} onChange={(event) => setRemember(event.target.checked)} type="checkbox" /><span>Recordar mi sesión en este equipo</span></label>
            <button className="submit-button" disabled={isSubmitting} type="submit"><span>{isSubmitting ? 'Verificando acceso…' : 'Iniciar sesión'}</span><Icon name="arrow" /></button>
            <p aria-live="polite" className={message ? 'form-message is-visible' : 'form-message'}>{message}</p>
          </form>
          <p className="help-text">Acceso protegido con sesiones registradas en el sistema académico.</p>
        </div>
      </section>
    </main>
  )
}

function ExistingProject({ project, message }: { project: Project; message: string }) {
  return (
    <>
      <section className="student-callout project-registered"><Icon name="check" /><div><strong>Tu proyecto ya está registrado</strong><p>{message || 'Puedes consultar el avance actual de tu proceso desde este portal.'}</p></div></section>
      <section className="form-section project-summary">
        <div className="section-heading"><span>F1</span><div><h2>{project.title}</h2><p>Código de seguimiento: <strong>{project.code}</strong></p></div></div>
        <div className="project-summary-grid">
          <div><small>Gestión</small><strong>{project.management}</strong></div>
          <div><small>Modalidad</small><strong>{project.modality}</strong></div>
          <div><small>Fase actual</small><strong>{project.phase}</strong></div>
          <div><small>Estado</small><strong>{project.status}</strong></div>
        </div>
        <div className="project-summary-copy"><small>Descripción</small><p>{project.description}</p><small>Objetivo general</small><p>{project.generalObjective}</p></div>
      </section>
    </>
  )
}

function StudentForm({ data, onLogout, onRegistered, onDocuments, onHome, sessionActions }: { data: Bootstrap; onLogout: () => Promise<void>; onRegistered: () => Promise<void>; onDocuments: () => void; onHome: () => void; sessionActions: ReactNode }) {
  const [title, setTitle] = useState('')
  const [managementId, setManagementId] = useState('')
  const [modalityId, setModalityId] = useState('')
  const [tutorId, setTutorId] = useState('')
  const [description, setDescription] = useState('')
  const [generalObjective, setGeneralObjective] = useState('')
  const [specificObjectives, setSpecificObjectives] = useState([''])
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setManagementId((current) => current || data.managements[0]?.id || '')
  }, [data.managements])

  function updateObjective(index: number, value: string) {
    setSpecificObjectives((objectives) => objectives.map((objective, objectiveIndex) => objectiveIndex === index ? value : objective))
  }

  function selectProfile(event: ChangeEvent<HTMLInputElement>) {
    setProfileFile(event.target.files?.[0] ?? null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const hasObjectives = specificObjectives.length > 0 && specificObjectives.every((objective) => objective.trim().length >= 10)
    if (title.trim().length < 10 || description.trim().length < 20 || generalObjective.trim().length < 10 || !managementId || !modalityId || !tutorId || !hasObjectives || !profileFile) {
      setMessage('Completa los campos obligatorios. Título y objetivos: mínimo 10 caracteres; descripción: mínimo 20 caracteres.')
      return
    }

    const extension = profileFile.name.split('.').pop()?.toLowerCase()
    if (extension !== 'doc' && extension !== 'docx') {
      setMessage('El perfil debe ser un documento Word (.doc o .docx).')
      return
    }

    const formData = new FormData()
    formData.set('managementId', managementId)
    formData.set('modalityId', modalityId)
    formData.set('tutorId', tutorId)
    formData.set('title', title.trim())
    formData.set('description', description.trim())
    formData.set('generalObjective', generalObjective.trim())
    formData.set('objectives', JSON.stringify(specificObjectives.map((objective) => objective.trim())))
    formData.set('profile', profileFile)

    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>('/api/projects', { method: 'POST', body: formData })
      setMessage(result.message)
      await onRegistered()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible registrar el proyecto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="student-page">
      <aside className="student-sidebar">
        <div>
          <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
          <p className="student-role">PORTAL DEL ESTUDIANTE</p>
          <nav aria-label="Navegación del estudiante" className="student-nav">
            <button onClick={onHome} type="button"><Icon name="dashboard" /><span>Inicio</span></button>
            <button className="is-active" type="button"><Icon name="clipboard" /><span>Mi proyecto</span></button>
            <button onClick={onDocuments} type="button"><Icon name="file" /><span>Documentos</span></button>
            <button type="button"><Icon name="help" /><span>Ayuda</span></button>
          </nav>
        </div>
        <div className="sidebar-bottom"><div className="student-help"><Icon name="help" /><span><strong>¿Tienes dudas?</strong><small>Contacta a Administración.</small></span></div><button className="logout-button" onClick={() => void onLogout()} type="button"><Icon name="exit" />Cerrar sesión</button></div>
      </aside>

      <section className="student-content">
        <header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div>{sessionActions}</header>
        <div className="student-main">
          <div className="breadcrumb">Inicio <span>/</span> Mi proyecto <span>/</span> Formulario 1</div>
          <div className="student-title-row"><div><p className="eyebrow">Fase 1 · Perfil</p><h1>{data.project ? 'Mi proyecto' : 'Registra tu proyecto'}</h1><p>{data.project ? 'Consulta la información registrada y el estado actual de tu proceso.' : 'Completa el Formulario 1 con la información inicial de tu propuesta de titulación.'}</p></div>{!data.project && <div className="form-progress"><span>Progreso del formulario</span><strong>0%</strong><div><i /></div></div>}</div>

          {data.project ? <ExistingProject message={message} project={data.project} /> : (
            <>
              <section className="student-callout"><Icon name="check" /><div><strong>Antes de comenzar</strong><p>Ten a mano el título tentativo, los objetivos del proyecto y el perfil en formato Word.</p></div></section>
              <form className="project-form" onSubmit={handleSubmit} noValidate>
                <section className="form-section">
                  <div className="section-heading"><span>01</span><div><h2>Información del proyecto</h2><p>Datos generales para identificar tu proceso de titulación.</p></div></div>
                  <div className="field-grid field-grid-three">
                    <label className="form-field"><span>Gestión <b>*</b></span><select disabled={isSubmitting || data.managements.length === 0} onChange={(event) => setManagementId(event.target.value)} value={managementId}><option value="">Selecciona una gestión</option>{data.managements.map((management) => <option key={management.id} value={management.id}>{management.codigo} · {management.nombre}</option>)}</select></label>
                    <label className="form-field"><span>Modalidad de titulación <b>*</b></span><select disabled={isSubmitting || data.modalities.length === 0} onChange={(event) => setModalityId(event.target.value)} value={modalityId}><option value="">Selecciona una modalidad</option>{data.modalities.map((modality) => <option key={modality.id} value={modality.id}>{modality.nombre}</option>)}</select></label>
                    <div className="form-field"><span>Código de seguimiento</span><div className="readonly-field">Se asignará al registrar</div></div>
                  </div>
                  <label className="form-field"><span>Título tentativo del proyecto <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setTitle(event.target.value)} placeholder="Ej.: Sistema web para el seguimiento de procesos de titulación" type="text" value={title} /></label>
                </section>

                <section className="form-section">
                  <div className="section-heading"><span>02</span><div><h2>Propuesta académica</h2><p>Explica con claridad el propósito y alcance de tu proyecto.</p></div></div>
                  <label className="form-field"><span>Descripción breve <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setDescription(event.target.value)} placeholder="Resume el problema, la propuesta de solución y el alcance de tu proyecto." rows={4} value={description} /><small>Mínimo: 20 caracteres.</small></label>
                  <label className="form-field"><span>Objetivo general <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setGeneralObjective(event.target.value)} placeholder="Describe el resultado principal que deseas alcanzar con el proyecto." rows={3} value={generalObjective} /><small>Mínimo: 10 caracteres.</small></label>
                  <div className="objectives-area"><div className="objective-label"><span>Objetivos específicos <b>*</b></span><small>Incluye las acciones concretas que permitirán alcanzar el objetivo general.</small></div>{specificObjectives.map((objective, index) => <div className="objective-input" key={`objective-${index}`}><span>{index + 1}</span><input aria-label={`Objetivo específico ${index + 1}`} disabled={isSubmitting} onChange={(event) => updateObjective(index, event.target.value)} placeholder={`Objetivo específico ${index + 1} (mínimo 10 caracteres)`} type="text" value={objective} />{specificObjectives.length > 1 && <button aria-label={`Eliminar objetivo específico ${index + 1}`} disabled={isSubmitting} onClick={() => setSpecificObjectives((objectives) => objectives.filter((_, objectiveIndex) => objectiveIndex !== index))} type="button"><Icon name="trash" /></button>}</div>)}<button className="add-objective" disabled={isSubmitting} onClick={() => setSpecificObjectives((objectives) => [...objectives, ''])} type="button"><Icon name="plus" />Añadir objetivo específico</button></div>
                </section>

                <section className="form-section">
                  <div className="section-heading"><span>03</span><div><h2>Tutor y perfil del proyecto</h2><p>Propón un tutor disponible y adjunta el documento del perfil.</p></div></div>
                  <label className="form-field"><span>Docente tutor propuesto <b>*</b></span><select disabled={isSubmitting || data.tutors.length === 0} onChange={(event) => setTutorId(event.target.value)} value={tutorId}><option value="">Selecciona un tutor</option>{data.tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.name}</option>)}</select><small>El docente recibirá una invitación y deberá aceptarla para confirmar la tutoría.</small></label>
                  <div className="form-field"><span>Perfil del proyecto en Word <b>*</b></span><label className={profileFile ? 'upload-box has-file' : 'upload-box'} htmlFor="profile"><input accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={isSubmitting} id="profile" onChange={selectProfile} type="file" /><Icon name={profileFile ? 'check' : 'upload'} /><div><strong>{profileFile?.name || 'Adjunta tu perfil de proyecto'}</strong><small>{profileFile ? 'Archivo listo para registrarse en el sistema.' : 'Formato permitido: .doc o .docx · máximo 10 MB'}</small></div><span>{profileFile ? 'Cambiar archivo' : 'Seleccionar archivo'}</span></label></div>
                </section>

                <footer className="form-footer"><p><b>*</b> Campos obligatorios</p><div><button className="secondary-button" disabled={isSubmitting} onClick={() => setMessage('El formulario no se envió. Puedes continuar completándolo cuando lo necesites.')} type="button">Cancelar</button><button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Registrando…' : 'Registrar proyecto'} <Icon name="arrow" /></button></div></footer>
                <p aria-live="polite" className={message ? 'student-message is-visible' : 'student-message'}>{message}</p>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function documentLabel(type: string) {
  return type === 'PERFIL_PROYECTO' ? 'Perfil de proyecto' : type.replaceAll('_', ' ')
}

function HomeView({ data, onLogout, onProject, onDocuments, sessionActions }: { data: Bootstrap; onLogout: () => Promise<void>; onProject: () => void; onDocuments: () => void; sessionActions: ReactNode }) {
  const [overview, setOverview] = useState<StudentOverview | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(data.project))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!data.project) {
      setIsLoading(false)
      return
    }

    let isCurrent = true
    setIsLoading(true)
    setError('')
    void api<StudentOverview>('/api/student/overview')
      .then((result) => { if (isCurrent) setOverview(result) })
      .catch((loadError) => { if (isCurrent) setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el resumen del proceso.') })
      .finally(() => { if (isCurrent) setIsLoading(false) })

    return () => { isCurrent = false }
  }, [data.project?.id])

  const project = overview?.project ?? data.project

  return (
    <main className="student-page">
      <aside className="student-sidebar">
        <div>
          <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
          <p className="student-role">PORTAL DEL ESTUDIANTE</p>
          <nav aria-label="Navegación del estudiante" className="student-nav">
            <button className="is-active" type="button"><Icon name="dashboard" /><span>Inicio</span></button>
            <button onClick={onProject} type="button"><Icon name="clipboard" /><span>Mi proyecto</span></button>
            <button onClick={onDocuments} type="button"><Icon name="file" /><span>Documentos</span></button>
            <button type="button"><Icon name="help" /><span>Ayuda</span></button>
          </nav>
        </div>
        <div className="sidebar-bottom"><div className="student-help"><Icon name="help" /><span><strong>¿Tienes dudas?</strong><small>Contacta a Administración.</small></span></div><button className="logout-button" onClick={() => void onLogout()} type="button"><Icon name="exit" />Cerrar sesión</button></div>
      </aside>

      <section className="student-content">
        <header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div>{sessionActions}</header>
        <div className="student-main">
          <div className="breadcrumb">Inicio</div>
          <div className="student-title-row home-title"><div><p className="eyebrow">Mi proceso de titulación</p><h1>Bienvenido, {data.user.fullName.split(' ')[0]}</h1><p>Consulta la información registrada y el avance de tu propuesta en un solo lugar.</p></div>{project && <div className="document-project-tag"><small>Código de seguimiento</small><strong>{project.code}</strong></div>}</div>

          {!project ? <section className="student-callout home-empty"><Icon name="clipboard" /><div><strong>Aún no registraste una propuesta</strong><p>Completa el Formulario 1 para iniciar tu proceso y generar tu código de seguimiento.</p><button className="primary-button" onClick={onProject} type="button">Registrar mi proyecto <Icon name="arrow" /></button></div></section> : (
            <>
              {isLoading && <div className="documents-loading">Cargando la información de tu proceso…</div>}
              {error && <p className="student-message is-visible documents-message">{error}</p>}
              {!isLoading && !error && overview && <div className="home-overview">
                <section className="overview-hero">
                  <div className="overview-hero-top"><span className="overview-phase">{project.phase}</span><span className="overview-status">{project.status}</span></div>
                  <h2>{project.title}</h2>
                  <p>{project.description}</p>
                  <div className="overview-facts">
                    <div><small>Propuesta presentada</small><strong>{formatDate(project.registeredAt)}</strong></div>
                    <div><small>Gestión</small><strong>{project.management}</strong></div>
                    <div><small>Modalidad</small><strong>{project.modality}</strong></div>
                    <div><small>Fase actual</small><strong>{project.phase}</strong></div>
                  </div>
                </section>

                <div className="overview-two-columns">
                  <section className="overview-card tutor-card"><div className="overview-card-heading"><Icon name="user" /><div><p>Tutor</p><h2>{overview.tutor?.name ?? 'Pendiente de asignación'}</h2></div></div>{overview.tutor ? <><span className={overview.tutor.status === 'CONFIRMADO' ? 'assignment-status confirmed' : 'assignment-status proposed'}>{overview.tutor.status === 'CONFIRMADO' ? 'Tutor confirmado' : 'Tutor propuesto · pendiente de respuesta'}</span><p className="overview-card-note">Solicitud registrada el {formatDate(overview.tutor.assignedAt)}.</p></> : <p className="overview-card-note">Cuando propongas un tutor, recibirá una invitación para responderla.</p>}</section>
                  <section className="overview-card profile-card"><div className="overview-card-heading"><Icon name="file" /><div><p>Perfil del proyecto</p><h2>{overview.profile?.filename ?? 'Sin archivo registrado'}</h2></div></div>{overview.profile?.version ? <><p className="overview-card-note">Versión {overview.profile.version} · {overview.profile.uploadedAt ? formatDate(overview.profile.uploadedAt) : 'Sin fecha disponible'}</p><a className="document-download" href={`/api/documents/${overview.profile.documentId}/download`}><Icon name="download" />Descargar perfil</a></> : <p className="overview-card-note">El perfil aparecerá aquí cuando se registre en el Formulario 1.</p>}</section>
                </div>

                <section className="overview-card objectives-card"><div className="overview-card-heading"><Icon name="clipboard" /><div><p>Objetivos del proyecto</p><h2>Objetivo general y objetivos específicos</h2></div></div><div className="general-objective"><small>Objetivo general</small><p>{project.generalObjective}</p></div>{overview.objectives.length > 0 && <ol className="overview-objectives">{overview.objectives.map((objective) => <li key={objective.number}><span>{objective.number}</span><p>{objective.description}</p></li>)}</ol>}</section>

                <section className="overview-card history-card"><div className="overview-card-heading"><Icon name="check" /><div><p>Seguimiento</p><h2>Actividad reciente</h2></div></div>{overview.history.length === 0 ? <p className="overview-card-note">Aún no hay movimientos registrados en el proceso.</p> : <ol className="overview-history">{overview.history.map((entry, index) => <li key={`${entry.changedAt}-${index}`}><span className="history-dot" /><div><strong>{[entry.phase, entry.status].filter(Boolean).join(' · ') || 'Actualización del proceso'}</strong><p>{entry.reason || 'Se actualizó la información del proyecto.'}</p><small>{formatDate(entry.changedAt)}</small></div></li>)}</ol>}</section>
              </div>}
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function DocumentsView({ data, onLogout, onProject, onHome, sessionActions }: { data: Bootstrap; onLogout: () => Promise<void>; onProject: () => void; onHome: () => void; sessionActions: ReactNode }) {
  const [documents, setDocuments] = useState<StudentDocument[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(data.project))
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [versionFile, setVersionFile] = useState<File | null>(null)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function loadDocuments() {
    if (!data.project) return
    setIsLoading(true)
    setError('')
    try {
      const result = await api<{ documents: StudentDocument[] }>('/api/documents')
      setDocuments(result.documents)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar tus documentos.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDocuments()
  }, [data.project?.id])

  async function submitVersion(event: FormEvent<HTMLFormElement>, documentId: string) {
    event.preventDefault()
    if (!versionFile) {
      setMessage('Selecciona el archivo Word de la nueva versión.')
      return
    }
    const extension = versionFile.name.split('.').pop()?.toLowerCase()
    if (extension !== 'doc' && extension !== 'docx') {
      setMessage('Solo se permiten archivos Word (.doc o .docx).')
      return
    }

    const form = new FormData()
    form.set('document', versionFile)
    form.set('comment', comment.trim())
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/documents/${documentId}/versions`, { method: 'POST', body: form })
      setMessage(result.message)
      setSelectedDocumentId('')
      setVersionFile(null)
      setComment('')
      await loadDocuments()
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : 'No fue posible guardar la nueva versión.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="student-page">
      <aside className="student-sidebar">
        <div>
          <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
          <p className="student-role">PORTAL DEL ESTUDIANTE</p>
          <nav aria-label="Navegación del estudiante" className="student-nav">
            <button onClick={onHome} type="button"><Icon name="dashboard" /><span>Inicio</span></button>
            <button onClick={onProject} type="button"><Icon name="clipboard" /><span>Mi proyecto</span></button>
            <button className="is-active" type="button"><Icon name="file" /><span>Documentos</span></button>
            <button type="button"><Icon name="help" /><span>Ayuda</span></button>
          </nav>
        </div>
        <div className="sidebar-bottom"><div className="student-help"><Icon name="help" /><span><strong>¿Tienes dudas?</strong><small>Contacta a Administración.</small></span></div><button className="logout-button" onClick={() => void onLogout()} type="button"><Icon name="exit" />Cerrar sesión</button></div>
      </aside>

      <section className="student-content">
        <header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div>{sessionActions}</header>
        <div className="student-main">
          <div className="breadcrumb">Inicio <span>/</span> Documentos</div>
          <div className="student-title-row documents-title"><div><p className="eyebrow">Mi proceso</p><h1>Documentos</h1><p>Consulta, descarga y mantiene las versiones autorizadas de los documentos de tu proyecto.</p></div>{data.project && <div className="document-project-tag"><small>Código de seguimiento</small><strong>{data.project.code}</strong></div>}</div>

          {!data.project ? <section className="student-callout"><Icon name="file" /><div><strong>Aún no tienes documentos disponibles</strong><p>Registra primero tu proyecto y adjunta el perfil en el Formulario 1.</p></div></section> : (
            <>
              <section className="student-callout document-rules"><Icon name="check" /><div><strong>Control de versiones</strong><p>Los documentos no se eliminan. Podrás adjuntar una nueva versión únicamente cuando el estado de tu proyecto permita edición.</p></div></section>
              {isLoading && <div className="documents-loading">Cargando documentos del proyecto…</div>}
              {error && <p className="student-message is-visible documents-message">{error}</p>}
              {!isLoading && !error && documents.length === 0 && <section className="empty-documents"><Icon name="file" /><strong>No hay documentos registrados para este proyecto.</strong><span>Cuando adjuntes un archivo en el Formulario 1 aparecerá aquí.</span></section>}
              <div className="documents-list">
                {documents.map((document) => {
                  const isUpdating = selectedDocumentId === document.id
                  return <section className="document-card" key={document.id}>
                    <div className="document-card-header"><div className="document-symbol"><Icon name="file" /></div><div><p>{documentLabel(document.type)}</p><h2>{document.name}</h2><span>{document.phase} · Estado: {document.status}</span></div><div className="document-version-badge">{document.totalVersions} {document.totalVersions === 1 ? 'versión' : 'versiones'}</div></div>
                    {document.latest ? <div className="document-latest"><div><small>Última versión</small><strong>V{document.latest.number} · {document.latest.filename}</strong><span>{formatFileSize(document.latest.size)} · {formatDate(document.latest.uploadedAt)}</span></div><a className="document-download" href={`/api/documents/${document.id}/download`}><Icon name="download" />Descargar</a></div> : <p className="document-lock-note">Este registro aún no tiene un archivo disponible.</p>}
                    {document.versions.length > 0 && <details className="version-history"><summary>Ver historial de versiones ({document.versions.length})</summary><ul>{document.versions.map((version) => <li key={version.id}><div><strong>Versión {version.number}</strong><span>{version.filename} · {formatDate(version.uploadedAt)}{version.comment ? ` · ${version.comment}` : ''}</span></div><a aria-label={`Descargar versión ${version.number}`} href={`/api/documents/${document.id}/download?version=${version.id}`}><Icon name="download" /></a></li>)}</ul></details>}
                    {document.canUploadVersion ? <div className="document-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => { setSelectedDocumentId(isUpdating ? '' : document.id); setMessage('') }} type="button">{isUpdating ? 'Cancelar actualización' : 'Subir nueva versión'}</button><small>El estado actual permite que envíes una corrección del perfil.</small></div> : <p className="document-lock-note">El estado actual no permite nuevas versiones. Administración habilitará la edición cuando corresponda.</p>}
                    {isUpdating && <form className="version-form" onSubmit={(event) => void submitVersion(event, document.id)}><label className="form-field"><span>Nueva versión en Word <b>*</b></span><input accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={isSubmitting} onChange={(event) => setVersionFile(event.target.files?.[0] ?? null)} type="file" /><small>{versionFile ? versionFile.name : 'Formato permitido: .doc o .docx · máximo 10 MB'}</small></label><label className="form-field"><span>Comentario de entrega</span><textarea disabled={isSubmitting} onChange={(event) => setComment(event.target.value)} placeholder="Indica brevemente qué corregiste en esta versión." rows={2} value={comment} /></label><button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Guardando…' : 'Guardar nueva versión'} <Icon name="arrow" /></button></form>}
                  </section>
                })}
              </div>
              <p aria-live="polite" className={message ? 'student-message is-visible documents-message' : 'student-message documents-message'}>{message}</p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function TutorPortal({ data, onLogout, onRefresh, sessionActions }: { data: TutorDashboard; onLogout: () => Promise<void>; onRefresh: () => Promise<void>; sessionActions: ReactNode }) {
  const [view, setView] = useState<'home' | 'invitations' | 'projects' | 'notifications'>('home')
  const [decliningId, setDecliningId] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  async function respond(assignmentId: string, decision: 'ACEPTAR' | 'DECLINAR') {
    if (decision === 'DECLINAR' && declineReason.trim().length < 5) {
      setMessage('Escribe un motivo breve para declinar la tutoría.')
      return
    }
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/tutor/invitations/${assignmentId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: decision === 'DECLINAR' ? declineReason.trim() : '' }),
      })
      setMessage(result.message)
      setDecliningId('')
      setDeclineReason('')
      await onRefresh()
      setView(decision === 'ACEPTAR' ? 'projects' : 'invitations')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible responder la invitación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function markRead(notificationId: string) {
    try {
      await api(`/api/notifications/${notificationId}/read`, { method: 'POST' })
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar la notificación.')
    }
  }

  function invitationCard(invitation: TutorAssignment) {
    const isDeclining = decliningId === invitation.id
    return <article className="tutor-card tutor-invitation" key={invitation.id}>
      <div className="tutor-card-top"><span className="tutor-code">{invitation.code}</span><span className="tutor-request-status">Solicitud pendiente</span></div>
      <h2>{invitation.title}</h2>
      <p className="tutor-card-description">{invitation.description}</p>
      <div className="tutor-project-meta"><span><Icon name="user" />{invitation.students}</span><span><Icon name="clipboard" />{invitation.modality}</span><span><Icon name="check" />{invitation.phase}</span></div>
      <p className="tutor-card-date">Solicitud recibida: {formatDate(invitation.requestedAt)}</p>
      {invitation.profile && <a className="document-download tutor-document-link" href={`/api/tutor/documents/${invitation.profile.documentId}/download`}><Icon name="download" />Ver perfil adjunto</a>}
      {!isDeclining ? <div className="tutor-actions"><button className="primary-button" disabled={isSubmitting} onClick={() => void respond(invitation.id, 'ACEPTAR')} type="button"><Icon name="check" />Aceptar tutoría</button><button className="secondary-button" disabled={isSubmitting} onClick={() => { setDecliningId(invitation.id); setMessage('') }} type="button">Declinar</button></div> : <div className="decline-box"><label className="form-field"><span>Motivo para declinar <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Ej.: No cuento con disponibilidad para acompañar este tema." rows={3} value={declineReason} /></label><div className="tutor-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => { setDecliningId(''); setDeclineReason('') }} type="button">Cancelar</button><button className="primary-button" disabled={isSubmitting} onClick={() => void respond(invitation.id, 'DECLINAR')} type="button">Confirmar declinación</button></div></div>}
    </article>
  }

  function projectCard(project: TutorAssignment) {
    return <article className="tutor-card tutor-project-card" key={project.id}>
      <div className="tutor-card-top"><span className="tutor-code">{project.code}</span><span className="assignment-status confirmed">Tutoría confirmada</span></div>
      <h2>{project.title}</h2>
      <p className="tutor-card-description">{project.description}</p>
      <div className="tutor-project-meta"><span><Icon name="user" />{project.students}</span><span><Icon name="clipboard" />{project.modality}</span><span><Icon name="check" />{project.phase} · {project.status}</span></div>
      <div className="tutor-project-footer"><div><small>Objetivo general</small><p>{project.generalObjective}</p></div>{project.profile && <a className="document-download tutor-document-link" href={`/api/tutor/documents/${project.profile.documentId}/download`}><Icon name="download" />Perfil V{project.profile.version}</a>}</div>
    </article>
  }

  const heading = view === 'home' ? 'Inicio' : view === 'invitations' ? 'Invitaciones de tutoría' : view === 'projects' ? 'Mis proyectos' : 'Notificaciones'
  const copy = view === 'home' ? 'Revisa las solicitudes y el estado de los proyectos que acompañas.' : view === 'invitations' ? 'Responde cada solicitud para confirmar o declinar la tutoría.' : view === 'projects' ? 'Consulta los proyectos cuya tutoría aceptaste.' : 'Mantente al tanto de las solicitudes y actualizaciones de tus proyectos.'

  return <main className="student-page tutor-page">
    <aside className="student-sidebar tutor-sidebar">
      <div>
        <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
        <p className="student-role">PORTAL DEL TUTOR</p>
        <nav aria-label="Navegación del tutor" className="student-nav">
          <button className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')} type="button"><Icon name="dashboard" /><span>Inicio</span></button>
          <button className={view === 'invitations' ? 'is-active' : ''} onClick={() => setView('invitations')} type="button"><Icon name="user" /><span>Invitaciones</span>{data.invitations.length > 0 && <b className="nav-count">{data.invitations.length}</b>}</button>
          <button className={view === 'projects' ? 'is-active' : ''} onClick={() => setView('projects')} type="button"><Icon name="clipboard" /><span>Mis proyectos</span></button>
          <button type="button"><Icon name="help" /><span>Ayuda</span></button>
        </nav>
      </div>
      <div className="sidebar-bottom"><div className="student-help"><Icon name="help" /><span><strong>¿Necesitas apoyo?</strong><small>Contacta a Administración.</small></span></div><button className="logout-button" onClick={() => void onLogout()} type="button"><Icon name="exit" />Cerrar sesión</button></div>
    </aside>

    <section className="student-content">
      <header className="student-header tutor-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div>{sessionActions}</header>
      <div className="student-main tutor-main">
        <div className="breadcrumb">Portal del tutor <span>/</span> {heading}</div>
        <div className="student-title-row tutor-title"><div><p className="eyebrow">Acompañamiento académico</p><h1>{heading}</h1><p>{copy}</p></div>{view !== 'notifications' && <button className="notification-summary" onClick={() => setView('notifications')} type="button"><Icon name="bell" /><span><small>Notificaciones sin leer</small><strong>{data.unreadCount}</strong></span></button>}</div>
        {message && <p className="student-message is-visible tutor-message">{message}</p>}

        {view === 'home' && <>
          <section className="tutor-stats"><div><small>Invitaciones pendientes</small><strong>{data.invitations.length}</strong><span>Requieren tu respuesta.</span></div><div><small>Proyectos asignados</small><strong>{data.projects.length}</strong><span>Tutorías confirmadas.</span></div><div><small>Notificaciones</small><strong>{data.unreadCount}</strong><span>Actualizaciones sin leer.</span></div></section>
          {data.invitations.length > 0 ? <section className="tutor-section"><div className="tutor-section-heading"><div><h2>Invitaciones pendientes</h2><p>Confirma si puedes acompañar cada propuesta.</p></div><button className="text-button" onClick={() => setView('invitations')} type="button">Ver todas</button></div><div className="tutor-cards">{data.invitations.slice(0, 2).map(invitationCard)}</div></section> : <section className="tutor-empty"><Icon name="check" /><strong>No tienes invitaciones pendientes.</strong><span>Las nuevas solicitudes aparecerán aquí y en la campanita.</span></section>}
          {data.projects.length > 0 && <section className="tutor-section"><div className="tutor-section-heading"><div><h2>Proyectos que acompañas</h2><p>Consulta rápidamente el avance de tus tutorías confirmadas.</p></div><button className="text-button" onClick={() => setView('projects')} type="button">Ver todos</button></div><div className="tutor-cards">{data.projects.slice(0, 2).map(projectCard)}</div></section>}
        </>}

        {view === 'invitations' && (data.invitations.length > 0 ? <div className="tutor-cards">{data.invitations.map(invitationCard)}</div> : <section className="tutor-empty"><Icon name="check" /><strong>Ya respondiste todas las invitaciones.</strong><span>Las nuevas solicitudes se mostrarán automáticamente en esta sección.</span></section>)}
        {view === 'projects' && (data.projects.length > 0 ? <div className="tutor-cards">{data.projects.map(projectCard)}</div> : <section className="tutor-empty"><Icon name="clipboard" /><strong>Aún no tienes proyectos confirmados.</strong><span>Cuando aceptes una tutoría, el proyecto aparecerá aquí.</span></section>)}
        {view === 'notifications' && <section className="notification-list">{data.notifications.length === 0 ? <div className="tutor-empty"><Icon name="bell" /><strong>No tienes notificaciones.</strong><span>Las solicitudes y avisos del proceso aparecerán aquí.</span></div> : data.notifications.map((notification) => <article className={notification.readAt ? 'notification-item' : 'notification-item is-unread'} key={notification.id}><div className="notification-icon"><Icon name="bell" /></div><div><strong>{notification.title}</strong><p>{notification.message}</p><small>{formatDate(notification.createdAt)}</small></div>{!notification.readAt && <button className="text-button" onClick={() => void markRead(notification.id)} type="button">Marcar como leída</button>}</article>)}</section>}
      </div>
    </section>
  </main>
}

function ReviewerPortal({ data, onLogout, onRefresh, sessionActions }: { data: ReviewerDashboard; onLogout: () => Promise<void>; onRefresh: () => Promise<void>; sessionActions: ReactNode }) {
  const [view, setView] = useState<'home' | 'pending' | 'completed' | 'notifications'>('home')
  const [selectedReview, setSelectedReview] = useState<ReviewerReview | null>(null)
  const [generalComment, setGeneralComment] = useState('')
  const [observationDrafts, setObservationDrafts] = useState<string[]>([''])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  function openReview(review: ReviewerReview) {
    setSelectedReview(review)
    setGeneralComment('')
    setObservationDrafts([''])
    setMessage('')
  }

  function closeReview() {
    setSelectedReview(null)
    setGeneralComment('')
    setObservationDrafts([''])
  }

  function updateObservation(index: number, value: string) {
    setObservationDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))
  }

  function removeObservation(index: number) {
    setObservationDrafts((current) => current.length === 1 ? [''] : current.filter((_item, itemIndex) => itemIndex !== index))
  }

  async function submitDecision(decision: 'APROBADO' | 'OBSERVADO') {
    if (!selectedReview) return
    const observations = observationDrafts.map((item) => item.trim()).filter(Boolean)
    if (decision === 'OBSERVADO' && observations.length === 0) {
      setMessage('Registra al menos una observación antes de devolver el perfil.')
      return
    }
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/reviewer/reviews/${selectedReview.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, generalComment: generalComment.trim(), observations }),
      })
      closeReview()
      await onRefresh()
      setView('completed')
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible registrar el dictamen.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function markRead(notificationId: string) {
    try {
      await api(`/api/notifications/${notificationId}/read`, { method: 'POST' })
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar la notificación.')
    }
  }

  function decisionLabel(decision: ReviewerReview['decision']) {
    if (decision === 'APROBADO') return 'Aprobado'
    if (decision === 'OBSERVADO') return 'Con observaciones'
    if (decision === 'RECHAZADO') return 'Rechazado'
    return 'Pendiente'
  }

  function reviewCard(review: ReviewerReview, showAction = true) {
    const isOverdue = review.canSubmit && new Date(review.deadline) < new Date()
    const isObserved = review.decision === 'OBSERVADO'
    return <article className={isOverdue ? 'reviewer-card is-overdue' : 'reviewer-card'} key={review.id}>
      <div className="reviewer-card-top"><div><span className="tutor-code">{review.code}</span><span className="reviewer-round">Ronda {review.roundNumber} · {review.assignmentType === 'REVISOR_1' ? 'Revisor 1' : 'Revisor 2'}</span></div><span className={`reviewer-decision decision-${review.decision.toLowerCase()}`}>{decisionLabel(review.decision)}</span></div>
      <h2>{review.title}</h2>
      <p className="tutor-card-description">{review.description}</p>
      <div className="tutor-project-meta"><span><Icon name="user" />{review.students}</span><span><Icon name="clipboard" />{review.modality}</span><span><Icon name="check" />{review.phase} · {review.status}</span></div>
      <div className="reviewer-card-info"><div><small>Entrega de revisión</small><strong className={isOverdue ? 'is-overdue' : ''}>{formatDate(review.deadline)}{isOverdue ? ' · Vencida' : ''}</strong></div><div><small>Perfil asignado</small><a className="document-download reviewer-document-link" href={`/api/reviewer/documents/${review.profile.documentId}/download?version=${review.profile.versionId}`}><Icon name="download" />V{review.profile.version} · Descargar</a></div></div>
      {review.decision !== 'PENDIENTE' && <div className={isObserved ? 'reviewer-result is-observed' : 'reviewer-result'}><strong>{isObserved ? `${review.observations.length} observación${review.observations.length === 1 ? '' : 'es'} registrada${review.observations.length === 1 ? '' : 's'}` : 'Dictamen emitido sin observaciones'}</strong>{review.generalComment && <p>{review.generalComment}</p>}</div>}
      {showAction && review.canSubmit && <div className="tutor-actions"><button className="primary-button" onClick={() => openReview(review)} type="button"><Icon name="clipboard" />Revisar perfil</button></div>}
    </article>
  }

  const heading = selectedReview ? 'Emitir dictamen' : view === 'home' ? 'Inicio' : view === 'pending' ? 'Revisiones pendientes' : view === 'completed' ? 'Dictámenes emitidos' : 'Notificaciones'
  const copy = selectedReview
    ? 'Revisa el perfil asignado y registra un dictamen definitivo para esta ronda.'
    : view === 'home'
      ? 'Organiza tus revisiones de perfil y mantente al tanto de los plazos.'
      : view === 'pending'
        ? 'Cada perfil debe recibir un dictamen antes de la fecha límite indicada.'
        : view === 'completed'
          ? 'Consulta los dictámenes que ya registraste.'
          : 'Mantente al tanto de las asignaciones y cambios de tus revisiones.'

  return <main className="student-page reviewer-page">
    <aside className="student-sidebar reviewer-sidebar">
      <div>
        <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
        <p className="student-role">PORTAL DEL REVISOR</p>
        <nav aria-label="Navegación del revisor" className="student-nav">
          <button className={!selectedReview && view === 'home' ? 'is-active' : ''} onClick={() => { closeReview(); setView('home') }} type="button"><Icon name="dashboard" /><span>Inicio</span></button>
          <button className={!selectedReview && view === 'pending' ? 'is-active' : ''} onClick={() => { closeReview(); setView('pending') }} type="button"><Icon name="clipboard" /><span>Por revisar</span>{data.summary.pending > 0 && <b className="nav-count">{data.summary.pending}</b>}</button>
          <button className={!selectedReview && view === 'completed' ? 'is-active' : ''} onClick={() => { closeReview(); setView('completed') }} type="button"><Icon name="check" /><span>Dictámenes</span></button>
          <button type="button"><Icon name="help" /><span>Ayuda</span></button>
        </nav>
      </div>
      <div className="sidebar-bottom"><div className="student-help"><Icon name="help" /><span><strong>¿Necesitas apoyo?</strong><small>Contacta a Administración.</small></span></div><button className="logout-button" onClick={() => void onLogout()} type="button"><Icon name="exit" />Cerrar sesión</button></div>
    </aside>

    <section className="student-content">
      <header className="student-header tutor-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div>{sessionActions}</header>
      <div className="student-main reviewer-main">
        <div className="breadcrumb">Portal del revisor <span>/</span> {heading}</div>
        <div className="student-title-row tutor-title"><div><p className="eyebrow">Evaluación académica</p><h1>{heading}</h1><p>{copy}</p></div>{!selectedReview && view !== 'notifications' && <button className="notification-summary" onClick={() => setView('notifications')} type="button"><Icon name="bell" /><span><small>Notificaciones sin leer</small><strong>{data.unreadCount}</strong></span></button>}</div>
        {message && <p className="student-message is-visible tutor-message">{message}</p>}

        {selectedReview && <section className="reviewer-workspace">
          <button className="text-button reviewer-back" onClick={closeReview} type="button">← Volver a revisiones pendientes</button>
          <div className="reviewer-workspace-heading"><div><span className="tutor-code">{selectedReview.code}</span><h2>{selectedReview.title}</h2><p>{selectedReview.description}</p></div><span className="reviewer-decision decision-pendiente">Ronda {selectedReview.roundNumber}</span></div>
          <section className="reviewer-project-context"><div><small>Estudiante(s)</small><strong>{selectedReview.students}</strong><span>{selectedReview.registrations}</span></div><div><small>Objetivo general</small><p>{selectedReview.generalObjective}</p></div><div><small>Fecha límite</small><strong>{formatDate(selectedReview.deadline)}</strong></div></section>
          <section className="reviewer-document-panel"><div><Icon name="file" /><div><small>Documento para revisar</small><strong>{selectedReview.profile.filename}</strong><span>Versión {selectedReview.profile.version} subida el {formatDate(selectedReview.profile.uploadedAt)}</span></div></div><a className="primary-button" href={`/api/reviewer/documents/${selectedReview.profile.documentId}/download?version=${selectedReview.profile.versionId}`}><Icon name="download" />Descargar perfil</a></section>
          <section className="reviewer-form-card"><div className="admin-operation-heading"><Icon name="clipboard" /><div><p>DICTAMEN DE REVISIÓN</p><h2>Registra tu evaluación</h2></div></div><p>Tu dictamen no podrá modificarse después de guardarlo. La ronda se cerrará cuando ambos revisores hayan respondido.</p><label className="form-field"><span>Comentario general</span><textarea disabled={isSubmitting} onChange={(event) => setGeneralComment(event.target.value)} placeholder="Resume los aspectos principales de tu revisión." rows={3} value={generalComment} /></label><div className="reviewer-observations"><div><strong>Observaciones puntuales</strong><small>Son obligatorias solo si devuelves el perfil.</small></div>{observationDrafts.map((observation, index) => <div className="reviewer-observation-row" key={index}><span>{index + 1}</span><textarea aria-label={`Observación ${index + 1}`} disabled={isSubmitting} onChange={(event) => updateObservation(index, event.target.value)} placeholder="Indica con claridad qué debe corregirse." rows={2} value={observation} />{observationDrafts.length > 1 && <button aria-label={`Eliminar observación ${index + 1}`} className="icon-button" disabled={isSubmitting} onClick={() => removeObservation(index)} type="button"><Icon name="trash" /></button>}</div>)}<button className="text-button" disabled={isSubmitting || observationDrafts.length >= 20} onClick={() => setObservationDrafts((current) => [...current, ''])} type="button"><Icon name="plus" />Añadir observación</button></div><div className="reviewer-decision-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => void submitDecision('APROBADO')} type="button"><Icon name="check" />Aprobar perfil</button><button className="primary-button reviewer-observe-button" disabled={isSubmitting} onClick={() => void submitDecision('OBSERVADO')} type="button">{isSubmitting ? 'Guardando…' : 'Devolver con observaciones'} <Icon name="arrow" /></button></div></section>
        </section>}

        {!selectedReview && view === 'home' && <>
          <section className="tutor-stats reviewer-stats"><div><small>Revisiones pendientes</small><strong>{data.summary.pending}</strong><span>Requieren tu dictamen.</span></div><div className={data.summary.overdue > 0 ? 'requires-attention' : ''}><small>Plazos vencidos</small><strong>{data.summary.overdue}</strong><span>Requieren atención prioritaria.</span></div><div><small>Dictámenes emitidos</small><strong>{data.summary.completed}</strong><span>Historial de tus revisiones.</span></div></section>
          {data.pendingReviews.length > 0 ? <section className="tutor-section"><div className="tutor-section-heading"><div><h2>Próximas revisiones</h2><p>Descarga el perfil y registra tu dictamen antes del plazo.</p></div><button className="text-button" onClick={() => setView('pending')} type="button">Ver todas</button></div><div className="tutor-cards">{data.pendingReviews.slice(0, 2).map((review) => reviewCard(review))}</div></section> : <section className="tutor-empty"><Icon name="check" /><strong>No tienes revisiones pendientes.</strong><span>Las nuevas asignaciones aparecerán aquí y en la campanita.</span></section>}
        </>}
        {!selectedReview && view === 'pending' && (data.pendingReviews.length > 0 ? <div className="tutor-cards">{data.pendingReviews.map((review) => reviewCard(review))}</div> : <section className="tutor-empty"><Icon name="check" /><strong>No tienes revisiones pendientes.</strong><span>Las nuevas asignaciones aparecerán automáticamente en esta sección.</span></section>)}
        {!selectedReview && view === 'completed' && (data.completedReviews.length > 0 ? <div className="tutor-cards">{data.completedReviews.map((review) => reviewCard(review, false))}</div> : <section className="tutor-empty"><Icon name="clipboard" /><strong>Aún no emitiste dictámenes.</strong><span>Cuando finalices una revisión aparecerá en este historial.</span></section>)}
        {!selectedReview && view === 'notifications' && <section className="notification-list">{data.notifications.length === 0 ? <div className="tutor-empty"><Icon name="bell" /><strong>No tienes notificaciones.</strong><span>Las asignaciones y cambios del proceso aparecerán aquí.</span></div> : data.notifications.map((notification) => <article className={notification.readAt ? 'notification-item' : 'notification-item is-unread'} key={notification.id}><div className="notification-icon"><Icon name="bell" /></div><div><strong>{notification.title}</strong><p>{notification.message}</p><small>{formatDate(notification.createdAt)}</small></div>{!notification.readAt && <button className="text-button" onClick={() => void markRead(notification.id)} type="button">Marcar como leída</button>}</article>)}</section>}
      </div>
    </section>
  </main>
}

function AdminProjectWorkspace({ projectId, user, onBack, onLogout, onRefresh, sessionActions }: { projectId: string; user: AdministratorUser; onBack: () => void; onLogout: () => Promise<void>; onRefresh: () => Promise<void>; sessionActions: ReactNode }) {
  const [detail, setDetail] = useState<AdminProjectDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectObjective, setProjectObjective] = useState('')
  const [tutorId, setTutorId] = useState('')
  const [reviewer1Id, setReviewer1Id] = useState('')
  const [reviewer2Id, setReviewer2Id] = useState('')
  const [profileVersionId, setProfileVersionId] = useState('')
  const [reviewDeadline, setReviewDeadline] = useState('')
  const [statusCode, setStatusCode] = useState('')
  const [phaseCode, setPhaseCode] = useState('')
  const [statusReason, setStatusReason] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [cancelDetail, setCancelDetail] = useState('')

  function defaultDeadline() {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  }

  async function loadDetail() {
    setIsLoading(true)
    try {
      const payload = await api<AdminProjectDetail>(`/api/admin/projects/${projectId}`)
      setDetail(payload)
      setProjectTitle(payload.project.title)
      setProjectDescription(payload.project.description)
      setProjectObjective(payload.project.generalObjective)
      setTutorId(payload.assignments.find((item) => item.type === 'TUTOR')?.teacherId ?? '')
      setReviewer1Id(payload.assignments.find((item) => item.type === 'REVISOR_1')?.teacherId ?? '')
      setReviewer2Id(payload.assignments.find((item) => item.type === 'REVISOR_2')?.teacherId ?? '')
      setProfileVersionId(payload.profiles[0]?.versionId ?? '')
      setReviewDeadline(defaultDeadline())
      setStatusCode(payload.project.statusCode)
      setPhaseCode(payload.project.phaseCode)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar el proyecto.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadDetail() }, [projectId])

  async function submitAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}/assignments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tutorId, reviewer1Id, reviewer2Id }) })
      setMessage(result.message)
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar los responsables.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function saveProjectData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: projectTitle, description: projectDescription, generalObjective: projectObjective }) })
      setMessage(result.message)
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar los datos del proyecto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function startReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}/review-rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: profileVersionId, deadline: reviewDeadline }) })
      setMessage(result.message)
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar la revisión.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusCode, phaseCode, reason: statusReason }) })
      setMessage(result.message)
      setStatusReason('')
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar la fase y el estado.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function cancelProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: cancelReason, detail: cancelDetail }) })
      setMessage(result.message)
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible anular el proyecto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const tutors = detail?.staff.filter((item) => item.roles.includes('TUTOR')) ?? []
  const reviewers = detail?.staff.filter((item) => item.roles.includes('REVISOR')) ?? []
  const isCancelled = detail?.project.statusCode === 'ANULADO'

  return <main className="student-page admin-page">
    <aside className="student-sidebar admin-sidebar"><div><div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div><p className="student-role">ADMINISTRACIÓN</p><nav aria-label="Navegación de Administración" className="student-nav"><button className="is-active" onClick={onBack} type="button"><Icon name="clipboard" /><span>Proyectos</span></button><button type="button"><Icon name="help" /><span>Ayuda</span></button></nav></div><div className="sidebar-bottom"><div className="student-help"><Icon name="help" /><span><strong>Gestión académica</strong><small>Control de proyectos y revisiones.</small></span></div><button className="logout-button" onClick={() => void onLogout()} type="button"><Icon name="exit" />Cerrar sesión</button></div></aside>
    <section className="student-content"><header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div>{sessionActions}</header><div className="student-main admin-main admin-workspace">
      <button className="text-button admin-back" onClick={onBack} type="button">← Volver a proyectos</button>
      {isLoading && <section className="documents-loading">Cargando información operativa del proyecto…</section>}
      {!isLoading && !detail && <section className="tutor-empty"><Icon name="clipboard" /><strong>No fue posible cargar el proyecto.</strong><span>{message || 'Intenta nuevamente desde el listado.'}</span></section>}
      {!isLoading && detail && <>
        <div className="breadcrumb">Administración <span>/</span> Proyectos <span>/</span> {detail.project.code}</div>
        <div className="student-title-row admin-title"><div><p className="eyebrow">Gestión del proyecto</p><h1>{detail.project.title}</h1><p>{detail.project.code} · {detail.project.management} · {detail.project.modality}</p></div><span className={`admin-status status-${detail.project.statusCode.toLocaleLowerCase()}`}>{detail.project.phase} · {detail.project.status}</span></div>
        {message && <p className="student-message is-visible tutor-message">{message}</p>}
        <section className="admin-project-context"><div><small>Estudiante{detail.students.length === 1 ? '' : 's'}</small><strong>{detail.students.map((item) => item.name).join(', ') || 'Sin estudiante asignado'}</strong><span>{detail.students.map((item) => item.registration).join(', ')}</span></div><div><small>Objetivo general</small><p>{detail.project.generalObjective}</p></div></section>

        {!isCancelled && <form className="admin-operation-card admin-project-edit" onSubmit={(event) => void saveProjectData(event)}><div className="admin-operation-heading"><Icon name="file" /><div><p>DATOS DEL PROYECTO</p><h2>Validar y actualizar propuesta</h2></div></div><p>Administración puede corregir los datos académicos registrados en el Formulario 1. Cada ajuste queda auditado.</p><label className="form-field"><span>Título del proyecto <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setProjectTitle(event.target.value)} value={projectTitle} /></label><label className="form-field"><span>Descripción <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setProjectDescription(event.target.value)} rows={3} value={projectDescription} /></label><label className="form-field"><span>Objetivo general <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setProjectObjective(event.target.value)} rows={2} value={projectObjective} /></label><button className="secondary-button" disabled={isSubmitting} type="submit">Guardar datos</button></form>}

        {!isCancelled && <div className="admin-operation-grid">
          <form className="admin-operation-card" onSubmit={(event) => void submitAssignments(event)}><div className="admin-operation-heading"><Icon name="user" /><div><p>RESPONSABLES</p><h2>Tutor y revisores</h2></div></div><p>Define los docentes responsables. Un nuevo tutor recibe una invitación y los revisores quedan listos para la siguiente ronda.</p><label className="form-field"><span>Tutor <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setTutorId(event.target.value)} value={tutorId}><option value="">Selecciona un tutor</option>{tutors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>Revisor 1 <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setReviewer1Id(event.target.value)} value={reviewer1Id}><option value="">Selecciona al Revisor 1</option>{reviewers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>Revisor 2 <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setReviewer2Id(event.target.value)} value={reviewer2Id}><option value="">Selecciona al Revisor 2</option>{reviewers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="primary-button" disabled={isSubmitting} type="submit">Guardar responsables</button></form>
          <form className="admin-operation-card" onSubmit={(event) => void startReview(event)}><div className="admin-operation-heading"><Icon name="file" /><div><p>REVISIÓN DEL PERFIL</p><h2>Programar ronda</h2></div></div><p>Envía una versión del perfil a Revisor 1 y Revisor 2 con un único plazo de respuesta.</p><label className="form-field"><span>Versión del perfil <b>*</b></span><select disabled={isSubmitting || detail.profiles.length === 0} onChange={(event) => setProfileVersionId(event.target.value)} value={profileVersionId}><option value="">Selecciona una versión</option>{detail.profiles.map((item) => <option key={item.versionId} value={item.versionId}>V{item.version} · {item.filename}</option>)}</select></label>{detail.profiles[0] && <a className="document-download admin-document-link" href={`/api/admin/documents/${detail.profiles[0].documentId}/download?versionId=${detail.profiles[0].versionId}`}><Icon name="download" />Descargar última versión</a>}<label className="form-field"><span>Fecha límite <b>*</b></span><input disabled={isSubmitting} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setReviewDeadline(event.target.value)} type="date" value={reviewDeadline} /></label><button className="primary-button" disabled={isSubmitting || detail.profiles.length === 0} type="submit">Iniciar revisión</button></form>
        </div>}

        <section className="admin-operation-card admin-round-history"><div className="admin-operation-heading"><Icon name="clipboard" /><div><p>SEGUIMIENTO</p><h2>Rondas de revisión</h2></div></div>{detail.rounds.length === 0 ? <p className="admin-empty-copy">Aún no se programó una ronda de revisión para el perfil.</p> : <div className="admin-round-list">{detail.rounds.map((round) => <article className={round.closedAt ? 'admin-round is-closed' : 'admin-round'} key={round.id}><div><strong>Ronda {round.number} · Perfil V{round.version}</strong><span>Solicitada: {formatDate(round.requestedAt)} · Límite: {formatDate(round.deadline)}</span></div><div className="admin-reviewers">{round.reviews.map((review) => <span key={review.id}><b>{review.assignmentType === 'REVISOR_1' ? 'R1' : 'R2'}</b>{review.reviewer}: {review.decision}{review.openObservations > 0 ? ` · ${review.openObservations} observación(es)` : ''}</span>)}</div></article>)}</div>}</section>

        {!isCancelled ? <div className="admin-operation-grid admin-secondary-grid"><form className="admin-operation-card" onSubmit={(event) => void changeStatus(event)}><div className="admin-operation-heading"><Icon name="check" /><div><p>TRAZABILIDAD</p><h2>Actualizar fase y estado</h2></div></div><p>Todo cambio se guarda en el historial académico del proyecto.</p><label className="form-field"><span>Fase <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setPhaseCode(event.target.value)} value={phaseCode}>{detail.phases.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label className="form-field"><span>Estado <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setStatusCode(event.target.value)} value={statusCode}>{detail.statuses.filter((item) => !['ANULADO', 'FINALIZADO'].includes(item.code)).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label className="form-field"><span>Motivo <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setStatusReason(event.target.value)} placeholder="Registra por qué se realiza este cambio." rows={3} value={statusReason} /></label><button className="secondary-button" disabled={isSubmitting} type="submit">Guardar cambio</button></form><form className="admin-operation-card admin-cancel-card" onSubmit={(event) => void cancelProject(event)}><div className="admin-operation-heading"><Icon name="trash" /><div><p>ACCIÓN CONTROLADA</p><h2>Anular proyecto</h2></div></div><p>Esta acción cierra asignaciones y rondas abiertas, y conserva el registro de anulación.</p><label className="form-field"><span>Motivo <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ej.: Abandono del proyecto" value={cancelReason} /></label><label className="form-field"><span>Detalle <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setCancelDetail(event.target.value)} placeholder="Explica la situación para el historial académico." rows={3} value={cancelDetail} /></label><button className="danger-button" disabled={isSubmitting} type="submit">Anular proyecto</button></form></div> : <section className="admin-cancellation"><Icon name="trash" /><div><h2>Proyecto anulado</h2><p><strong>{detail.cancellation?.reason}</strong> · {detail.cancellation?.detail}</p><small>{detail.cancellation?.cancelledAt && formatDate(detail.cancellation.cancelledAt)}</small></div></section>}
      </>}
    </div></section>
  </main>
}

function AdminPortal({ data, onLogout, onRefresh, sessionActions }: { data: AdminDashboard; onLogout: () => Promise<void>; onRefresh: () => Promise<void>; sessionActions: ReactNode }) {
  const [view, setView] = useState<'home' | 'projects'>('home')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleProjects = data.projects.filter((project) => {
    const matchesSearch = !normalizedSearch || [project.code, project.title, project.students, project.tutor].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
    return matchesSearch && (!status || project.statusCode === status)
  })
  const heading = view === 'home' ? 'Inicio' : 'Proyectos'

  if (selectedProjectId) return <AdminProjectWorkspace onBack={() => setSelectedProjectId('')} onLogout={onLogout} onRefresh={onRefresh} projectId={selectedProjectId} sessionActions={sessionActions} user={data.user} />

  function projectCard(project: AdminProject) {
    const reviewLabel = project.isOverdue
      ? 'Revisión fuera de plazo'
      : project.reviewDeadline
        ? `Límite de revisión: ${formatDate(project.reviewDeadline)}`
        : 'Sin revisión programada'
    const tutorLabel = project.tutorStatus === 'CONFIRMADA'
      ? 'Tutoría confirmada'
      : project.tutorStatus === 'PENDIENTE'
        ? 'Tutoría pendiente'
        : 'Sin tutor asignado'

    return <article className={project.isOverdue ? 'admin-project-card is-overdue' : 'admin-project-card'} key={project.id}>
      <div className="admin-project-top"><span className="tutor-code">{project.code}</span><span className={`admin-status status-${project.statusCode.toLocaleLowerCase()}`}>{project.status}</span></div>
      <h2>{project.title}</h2>
      <div className="admin-project-meta"><span><Icon name="user" />{project.students}</span><span><Icon name="clipboard" />{project.modality}</span><span><Icon name="check" />{project.phase}</span></div>
      <div className="admin-project-details"><div><small>Tutor asignado</small><strong>{project.tutor}</strong><span>{tutorLabel}</span></div><div><small>Revisión</small><strong>{project.pendingReviews > 0 ? `${project.pendingReviews} pendiente${project.pendingReviews === 1 ? '' : 's'}` : 'Sin pendientes'}</strong><span>{reviewLabel}</span></div></div>
      <footer><span>{project.management}</span><span>Registrado: {formatDate(project.registeredAt)}</span><button className="text-button" onClick={() => setSelectedProjectId(project.id)} type="button">Gestionar</button></footer>
    </article>
  }

  return <main className="student-page admin-page">
    <aside className="student-sidebar admin-sidebar">
      <div>
        <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
        <p className="student-role">ADMINISTRACIÓN</p>
        <nav aria-label="Navegación de Administración" className="student-nav">
          <button className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')} type="button"><Icon name="dashboard" /><span>Inicio</span></button>
          <button className={view === 'projects' ? 'is-active' : ''} onClick={() => setView('projects')} type="button"><Icon name="clipboard" /><span>Proyectos</span></button>
          <button type="button"><Icon name="help" /><span>Ayuda</span></button>
        </nav>
      </div>
      <div className="sidebar-bottom"><div className="student-help"><Icon name="help" /><span><strong>Gestión académica</strong><small>Control de proyectos y revisiones.</small></span></div><button className="logout-button" onClick={() => void onLogout()} type="button"><Icon name="exit" />Cerrar sesión</button></div>
    </aside>

    <section className="student-content">
      <header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div>{sessionActions}</header>
      <div className="student-main admin-main">
        <div className="breadcrumb">Administración <span>/</span> {heading}</div>
        <div className="student-title-row admin-title"><div><p className="eyebrow">Control operativo</p><h1>{heading}</h1><p>{view === 'home' ? 'Consulta el estado académico de los proyectos registrados en el sistema.' : 'Busca y filtra los proyectos para conocer su fase, responsables y revisiones.'}</p></div></div>

        <section className="admin-stats"><div><small>Proyectos registrados</small><strong>{data.summary.total}</strong><span>En el listado actual.</span></div><div><small>En registro</small><strong>{data.summary.registered}</strong><span>Requieren gestión inicial.</span></div><div><small>En revisión</small><strong>{data.summary.inReview}</strong><span>Con proceso de revisión activo.</span></div><div><small>Observados</small><strong>{data.summary.observed}</strong><span>Esperan correcciones.</span></div><div className={data.summary.overdue > 0 ? 'requires-attention' : ''}><small>Plazos vencidos</small><strong>{data.summary.overdue}</strong><span>Requieren seguimiento.</span></div></section>

        {view === 'home' && <>
          <section className="admin-intro"><Icon name="clipboard" /><div><h2>Seguimiento centralizado</h2><p>Esta vista se alimenta directamente de los proyectos, asignaciones, rondas y revisiones registradas en PostgreSQL.</p></div></section>
          <section className="tutor-section admin-section"><div className="tutor-section-heading"><div><h2>Proyectos recientes</h2><p>Prioriza los casos con una revisión vencida o con tutoría pendiente.</p></div><button className="text-button" onClick={() => setView('projects')} type="button">Ver todos</button></div>{data.projects.length > 0 ? <div className="admin-project-list">{data.projects.slice(0, 4).map(projectCard)}</div> : <section className="tutor-empty"><Icon name="clipboard" /><strong>No hay proyectos registrados.</strong><span>Los registros del Formulario 1 aparecerán aquí.</span></section>}</section>
        </>}

        {view === 'projects' && <>
          <section className="admin-filters" aria-label="Filtros de proyectos"><label><span>Buscar proyecto</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Código, título, estudiante o tutor" type="search" value={search} /></label><label><span>Estado</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="">Todos los estados</option>{data.statuses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label></section>
          <div className="admin-list-heading"><span>{visibleProjects.length} proyecto{visibleProjects.length === 1 ? '' : 's'} encontrado{visibleProjects.length === 1 ? '' : 's'}</span>{(search || status) && <button className="text-button" onClick={() => { setSearch(''); setStatus('') }} type="button">Limpiar filtros</button>}</div>
          {visibleProjects.length > 0 ? <div className="admin-project-list">{visibleProjects.map(projectCard)}</div> : <section className="tutor-empty"><Icon name="clipboard" /><strong>No encontramos proyectos con esos filtros.</strong><span>Prueba con otro estado o término de búsqueda.</span></section>}
        </>}
      </div>
    </section>
  </main>
}

function App() {
  const [data, setData] = useState<Bootstrap | TutorDashboard | ReviewerDashboard | AdminDashboard | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSwitchingRole, setIsSwitchingRole] = useState(false)
  const [view, setView] = useState<'home' | 'project' | 'documents'>('home')

  async function loadPortal() {
    const session = await api<SessionResponse>('/api/auth/session')
    const notificationsRequest = api<NotificationsResponse>('/api/notifications')
    if (session.user.role === 'ADMINISTRADOR') {
      const [dashboard, notificationData] = await Promise.all([api<AdminDashboard>('/api/admin/dashboard'), notificationsRequest])
      setData(dashboard)
      setNotifications(notificationData.notifications)
      return
    }
    if (session.user.role === 'TUTOR') {
      const [dashboard, notificationData] = await Promise.all([api<TutorDashboard>('/api/tutor/dashboard'), notificationsRequest])
      setData(dashboard)
      setNotifications(notificationData.notifications)
      return
    }
    if (session.user.role === 'REVISOR') {
      const [dashboard, notificationData] = await Promise.all([api<ReviewerDashboard>('/api/reviewer/dashboard'), notificationsRequest])
      setData(dashboard)
      setNotifications(notificationData.notifications)
      return
    }
    const [bootstrap, notificationData] = await Promise.all([api<Bootstrap>('/api/student/bootstrap'), notificationsRequest])
    setData(bootstrap)
    setNotifications(notificationData.notifications)
  }

  useEffect(() => {
    void loadPortal().catch(() => setData(null)).finally(() => setIsLoading(false))
  }, [])

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      setData(null)
      setNotifications([])
      setView('home')
    }
  }

  async function handleRoleChange(role: RoleCode) {
    setIsSwitchingRole(true)
    try {
      await api<SessionResponse>('/api/auth/active-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      await loadPortal()
      setView('home')
    } finally {
      setIsSwitchingRole(false)
    }
  }

  async function handleNotificationClick(notification: AppNotification) {
    if (!notification.readAt) {
      await api(`/api/notifications/${notification.id}/read`, { method: 'POST' })
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item))
    }
    if (data && notification.role !== data.user.role) {
      await handleRoleChange(notification.role)
      return
    }
    await loadPortal()
  }

  function sessionActions(user: User) {
    return <SessionActions isSwitching={isSwitchingRole} notifications={notifications} onNotificationClick={handleNotificationClick} onRoleChange={handleRoleChange} user={user} />
  }

  if (isLoading) return <main className="app-loading">Conectando con el sistema académico…</main>
  if (!data) return <LoginView onAuthenticated={loadPortal} />
  if ('pendingReviews' in data) return <ReviewerPortal data={data} onLogout={handleLogout} onRefresh={loadPortal} sessionActions={sessionActions(data.user)} />
  if ('summary' in data) return <AdminPortal data={data} onLogout={handleLogout} onRefresh={loadPortal} sessionActions={sessionActions(data.user)} />
  if ('invitations' in data) return <TutorPortal data={data} onLogout={handleLogout} onRefresh={loadPortal} sessionActions={sessionActions(data.user)} />
  return view === 'home'
    ? <HomeView data={data} onDocuments={() => setView('documents')} onLogout={handleLogout} onProject={() => setView('project')} sessionActions={sessionActions(data.user)} />
    : view === 'documents'
      ? <DocumentsView data={data} onHome={() => setView('home')} onLogout={handleLogout} onProject={() => setView('project')} sessionActions={sessionActions(data.user)} />
      : <StudentForm data={data} onDocuments={() => setView('documents')} onHome={() => setView('home')} onLogout={handleLogout} onRegistered={loadPortal} sessionActions={sessionActions(data.user)} />
}

export default App

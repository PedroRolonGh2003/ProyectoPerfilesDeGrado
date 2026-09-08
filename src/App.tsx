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

type UserBase = {
  id: string
  fullName: string
  email: string
  career: string
}
type StudentUser = UserBase & {
  role: 'ESTUDIANTE'
  studentId: string
  teacherId: null
  registration: string
}
type TutorUser = UserBase & {
  role: 'TUTOR'
  studentId: null
  teacherId: string
  registration: null
}
type User = StudentUser | TutorUser
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
type SessionResponse = { user: User }

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

function StudentForm({ data, onLogout, onRegistered, onDocuments, onHome }: { data: Bootstrap; onLogout: () => Promise<void>; onRegistered: () => Promise<void>; onDocuments: () => void; onHome: () => void }) {
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

  const initials = data.user.fullName.split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase() || 'E'

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
        <header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div><div className="session-info"><span className="demo-status">Sesión activa</span><span className="student-avatar">{initials}</span><span><strong>{data.user.fullName}</strong><small>{data.user.registration} · {data.user.career}</small></span><Icon name="chevron" /></div></header>
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

function HomeView({ data, onLogout, onProject, onDocuments }: { data: Bootstrap; onLogout: () => Promise<void>; onProject: () => void; onDocuments: () => void }) {
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

  const initials = data.user.fullName.split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase() || 'E'
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
        <header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div><div className="session-info"><span className="demo-status">Sesión activa</span><span className="student-avatar">{initials}</span><span><strong>{data.user.fullName}</strong><small>{data.user.registration} · {data.user.career}</small></span><Icon name="chevron" /></div></header>
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

function DocumentsView({ data, onLogout, onProject, onHome }: { data: Bootstrap; onLogout: () => Promise<void>; onProject: () => void; onHome: () => void }) {
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

  const initials = data.user.fullName.split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase() || 'E'

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
        <header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div><div className="session-info"><span className="demo-status">Sesión activa</span><span className="student-avatar">{initials}</span><span><strong>{data.user.fullName}</strong><small>{data.user.registration} · {data.user.career}</small></span><Icon name="chevron" /></div></header>
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

function TutorPortal({ data, onLogout, onRefresh }: { data: TutorDashboard; onLogout: () => Promise<void>; onRefresh: () => Promise<void> }) {
  const [view, setView] = useState<'home' | 'invitations' | 'projects' | 'notifications'>('home')
  const [decliningId, setDecliningId] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const initials = data.user.fullName.split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase() || 'T'

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
      <header className="student-header tutor-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div><div className="session-info"><button aria-label="Ver notificaciones" className="notification-bell" onClick={() => setView('notifications')} type="button"><Icon name="bell" />{data.unreadCount > 0 && <b>{data.unreadCount > 9 ? '9+' : data.unreadCount}</b>}</button><span className="demo-status">Tutor</span><span className="student-avatar">{initials}</span><span><strong>{data.user.fullName}</strong><small>{data.user.career}</small></span><Icon name="chevron" /></div></header>
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

function App() {
  const [data, setData] = useState<Bootstrap | TutorDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [view, setView] = useState<'home' | 'project' | 'documents'>('home')

  async function loadPortal() {
    const session = await api<SessionResponse>('/api/auth/session')
    if (session.user.role === 'TUTOR') {
      const dashboard = await api<TutorDashboard>('/api/tutor/dashboard')
      setData(dashboard)
      return
    }
    const bootstrap = await api<Bootstrap>('/api/student/bootstrap')
    setData(bootstrap)
  }

  useEffect(() => {
    void loadPortal().catch(() => setData(null)).finally(() => setIsLoading(false))
  }, [])

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      setData(null)
      setView('home')
    }
  }

  if (isLoading) return <main className="app-loading">Conectando con el sistema académico…</main>
  if (!data) return <LoginView onAuthenticated={loadPortal} />
  if ('invitations' in data) return <TutorPortal data={data} onLogout={handleLogout} onRefresh={loadPortal} />
  return view === 'home'
    ? <HomeView data={data} onDocuments={() => setView('documents')} onLogout={handleLogout} onProject={() => setView('project')} />
    : view === 'documents'
      ? <DocumentsView data={data} onHome={() => setView('home')} onLogout={handleLogout} onProject={() => setView('project')} />
      : <StudentForm data={data} onDocuments={() => setView('documents')} onHome={() => setView('home')} onLogout={handleLogout} onRegistered={loadPortal} />
}

export default App

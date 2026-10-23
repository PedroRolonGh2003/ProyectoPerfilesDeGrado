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

const formatCriteria = [
  ['TITULO', 'El título es adecuado'], ['INDICE', 'Presenta índice de contenido'], ['ORDEN_GUIA', 'Orden del contenido según guía'], ['FORMATO', 'Se encuentra en el formato solicitado'], ['NUMERO_HOJAS', 'Número de hojas adecuado'], ['ETAPAS_INVESTIGACION', 'Cuenta con las etapas principales del proceso de investigación'], ['CRONOGRAMA', 'Cronograma acorde a sus actividades y objetivos'], ['CITAS', 'Presenta citas bibliográficas'], ['REFERENCIAS', 'Presenta referencias bibliográficas'], ['REDACCION', 'Redacción y ortografía adecuadas'],
] as const
const backgroundCriteria = [
  ['PROBLEMA', 'El problema está definido con claridad, precisión y pertinencia'], ['JUSTIFICACION', 'La justificación académica, científica, tecnológica, social, económica y legal es clara'], ['FUENTES', 'Las fuentes son confiables y actualizadas'], ['ANALISIS_LITERATURA', 'La literatura está críticamente analizada'], ['PERSPECTIVA_TEORICA', 'La perspectiva teórica del problema es clara'], ['VINCULO_TEORIA', 'La teoría se vincula con el problema y los objetivos'], ['VIABILIDAD_OBJETIVOS', 'Los objetivos son viables, claros y alcanzables'], ['COHERENCIA_OBJETIVOS', 'Existe coherencia entre el objetivo general y los específicos'], ['METODOLOGIA_PERTINENTE', 'La metodología y técnicas son claras y pertinentes'], ['METODOLOGIA_RESPONDE', 'La metodología responde a los objetivos o hipótesis'],
] as const
const privateDefenseCriteria = [
  ['FUENTES_ACTUALIZADAS', 'Las fuentes bibliográficas son confiables y actualizadas'],
  ['ANALISIS_LITERATURA', 'La literatura está analizada críticamente y se relaciona con el problema, objetivos o hipótesis'],
  ['METODOLOGIA', 'La metodología es adecuada, precisa y está correctamente descrita'],
  ['RESULTADOS_OBJETIVOS', 'Los resultados se relacionan con los objetivos planteados'],
  ['CONCLUSIONES_OBJETIVOS', 'Las conclusiones se relacionan con los objetivos planteados'],
] as const

type RoleCode = 'ESTUDIANTE' | 'TUTOR' | 'REVISOR' | 'ADMINISTRADOR'
type RegistrationCareer = { id: string; code: string; name: string }

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
type ReviewParticipant = { assignmentType: string; reviewer: string; decision: string; decidedAt: string | null }
type DefenseSchedule = { available: boolean; scheduledAt: string | null; location: string | null }
type DefenseSchedules = { private: DefenseSchedule; public: DefenseSchedule }
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
  phaseCode: string
  status: string
  statusCode?: string
  defenses: DefenseSchedules
  students: string
  registrations: string
  requestedAt: string
  respondedAt: string | null
  profile: { documentId: string; type: string; versionId: string | null; filename: string | null; version: number | null; uploadedAt: string | null } | null
  reviewId: string | null
  reviewDecision: 'PENDIENTE' | 'APROBADO' | 'OBSERVADO' | 'RECHAZADO' | null
  reviewDocumentType?: string | null
  canReviewProfile: boolean
  teamReviews: ReviewParticipant[]
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
type NotificationDestination = '/student' | '/student/proponer-tutor' | '/documentos' | '/tutor' | '/tutor/invitaciones' | '/tutor/proyectos' | '/tutor/defensas-privada' | '/tutor/defensas-publica' | '/revisor' | '/revisor/pendientes' | '/revisor/completados' | '/revisor/defensas-privada' | '/revisor/defensas-publica' | '/admin' | '/admin/nuevos-proyectos' | '/admin/revisiones-por-iniciar' | '/admin/nuevos-docentes'
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
  phaseCode: string
  status: string
  defenses: DefenseSchedules
  students: string
  registrations: string
  roundNumber: number
  requestedAt: string
  closedAt: string | null
  decision: 'PENDIENTE' | 'APROBADO' | 'OBSERVADO' | 'RECHAZADO'
  generalComment: string | null
  decidedAt: string | null
  canSubmit: boolean
  profile: { documentId: string; type: string; versionId: string; filename: string; version: number; uploadedAt: string }
  observations: ReviewerObservation[]
  teamReviews: ReviewParticipant[]
}
type ReviewerDashboard = {
  user: ReviewerUser
  summary: { pending: number; completed: number }
  pendingReviews: ReviewerReview[]
  completedReviews: ReviewerReview[]
  defenseProjects: { projectId: string; code: string; title: string; phase: string; phaseCode: string; status: string; students: string; defenses: DefenseSchedules }[]
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
  defenses?: DefenseSchedules
  isFinal: boolean
  registeredAt: string
  pendingReviews: number
  reviewerCount: number
  reviewRoundCount: number
  canStartInitialReview: boolean
}
type AdminDashboard = {
  user: AdministratorUser
  summary: { total: number; registered: number; inReview: number; observed: number; pendingReviewStarts: number; newTeachers: number }
  statuses: { code: string; name: string }[]
  projects: AdminProject[]
  pendingReviewStarts: AdminProject[]
  newTeachers: PendingTeacher[]
}
type AdminDefenseProject = {
  projectId: string
  code: string
  title: string
  students: string
  phase: string
  status: string
  registeredAt: string
  scheduledAt: string | null
  location: string | null
  isClosed: boolean
}
type AdminDefensesResponse = { type: 'PRIVADA' | 'PUBLICA'; projects: AdminDefenseProject[] }
type PendingTeacher = { id: string; firstName: string; lastName: string; fullName: string; email: string; createdAt: string; confirmedAt: string }
type AdminUser = {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone: string
  active: boolean
  createdAt: string
  lastAccessAt: string | null
  roles: RoleCode[]
  careerId: string | null
  career: string
  studentId: string | null
  registration: string | null
  teacherId: string | null
  teacherCode: string | null
  specialty: string | null
  relatedProjects: number
}
type AdminUsersResponse = {
  users: AdminUser[]
  summary: { total: number; active: number; students: number; staff: number }
  roles: { code: RoleCode; name: string }[]
  careers: { id: string; code: string; name: string }[]
}
type ProjectCatalog = {
  managements: { id: string; code: string; name: string; careerId: string }[]
  modalities: { id: string; code: string; name: string; careerId: string }[]
  students: { id: string; name: string; registration: string; careerId: string; career: string }[]
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
  finishedAt: string | null
  respondedAt: string | null
  reason: string | null
}
type AdminProjectDetail = {
  project: Omit<AdminProject, 'students' | 'tutor' | 'tutorStatus' | 'isFinal' | 'pendingReviews' | 'reviewRoundCount' | 'canStartInitialReview'> & { description: string; generalObjective: string; defenses: DefenseSchedules }
  students: { name: string; registration: string }[]
  staff: AdminStaff[]
  assignments: AdminAssignment[]
  profiles: { documentId: string; versionId: string; version: number; filename: string; uploadedAt: string; size: number }[]
  rounds: { id: string; number: number; version: number; requestedAt: string; closedAt: string | null; reviews: { id: string; decision: string; decidedAt: string | null; comment: string | null; assignmentType: string; reviewer: string; openObservations: number }[] }[]
  statuses: { code: string; name: string }[]
  phases: { code: string; name: string }[]
  closure: { eligible: boolean; roundNumber: number | null; reason: string | null }
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
  phaseCode: string | null
  status: string
  statusCode: string
  registeredAt: string
  needsTutorProposal: boolean
  defenses: DefenseSchedules
}
type ProjectRejectionReason = {
  reviewer: string
  roundNumber: number
  sourceVersion: number
  comment: string | null
  observations: { number: number; detail: string }[]
}
type Bootstrap = {
  user: StudentUser
  managements: Option[]
  modalities: Option[]
  tutors: Tutor[]
  project: Project | null
  rejectionReasons: ProjectRejectionReason[]
  reviewProgress: { type: 'TUTOR' | 'REVISOR_1' | 'REVISOR_2'; decision: string }[]
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
  reviewInProgress: boolean
  canUploadVersion: boolean
  createdAt: string
  totalVersions: number
  latest: DocumentVersion | null
  versions: DocumentVersion[]
  observations: StudentObservation[]
}
type StudentObservation = {
  id: string
  number: number
  detail: string
  status: 'ABIERTA' | 'RESPONDIDA' | 'CERRADA'
  response: string | null
  respondedAt: string | null
  roundNumber: number
  sourceVersion: number
  responseVersion: number | null
  reviewer: string
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

function notificationDestination(link: string | null): NotificationDestination | null {
  const destinations: NotificationDestination[] = ['/student', '/student/proponer-tutor', '/documentos', '/tutor', '/tutor/invitaciones', '/tutor/proyectos', '/tutor/defensas-privada', '/tutor/defensas-publica', '/revisor', '/revisor/pendientes', '/revisor/completados', '/revisor/defensas-privada', '/revisor/defensas-publica', '/admin', '/admin/nuevos-proyectos', '/admin/revisiones-por-iniciar', '/admin/nuevos-docentes']
  return destinations.includes(link as NotificationDestination) ? link as NotificationDestination : null
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

function LoginView({ onAuthenticated, onPasswordReset }: { onAuthenticated: () => Promise<void>; onPasswordReset: () => void }) {
  const [view, setView] = useState<'login' | 'signup' | 'confirmation-pending' | 'role-assignment-pending' | 'password-recovery' | 'password-reset'>('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('')
  const [passwordResetToken, setPasswordResetToken] = useState('')
  const [careerId, setCareerId] = useState('')
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('')
  const [careers, setCareers] = useState<RegistrationCareer[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isStudentRegistration = /^[^\s@]+@est\.univalle\.edu$/i.test(registerEmail.trim())

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get('resetToken')
    if (!resetToken) return

    setPasswordResetToken(resetToken)
    setMessage('')
    setView('password-reset')
    const url = new URL(window.location.href)
    url.searchParams.delete('resetToken')
    window.history.replaceState({}, '', url)
  }, [])

  useEffect(() => {
    const confirmToken = new URLSearchParams(window.location.search).get('confirmToken')
    if (!confirmToken) return

    void api<{ message: string; autoLogin?: boolean }>('/api/auth/confirm-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: confirmToken }),
    }).then(async (result) => {
      if (result.autoLogin) {
        await onAuthenticated()
        return
      }

      setView('login')
      setMessage(result.message)
    }).catch((error) => {
      setView('login')
      setMessage(error instanceof Error ? error.message : 'El enlace de confirmación no es válido.')
    }).finally(() => {
      const url = new URL(window.location.href)
      url.searchParams.delete('confirmToken')
      window.history.replaceState({}, '', url)
    })
  }, [onAuthenticated])

  useEffect(() => {
    if (view !== 'signup' || careers.length > 0) return
    void api<{ careers: RegistrationCareer[] }>('/api/auth/register-options')
      .then((result) => setCareers(result.careers))
      .catch(() => setMessage('No fue posible cargar las carreras disponibles. Intenta nuevamente.'))
  }, [view, careers.length])

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
      const errorMessage = error instanceof Error ? error.message : 'No fue posible iniciar sesión.'
      if (/Administración debe asignarte un rol/i.test(errorMessage)) {
        setPendingConfirmationEmail(identifier.trim().toLowerCase())
        setView('role-assignment-pending')
      }
      setMessage(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetRegistration() {
    setFirstName('')
    setLastName('')
    setRegisterEmail('')
    setRegisterPassword('')
    setRegisterConfirmPassword('')
    setCareerId('')
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = registerEmail.trim().toLowerCase()
    const isStudent = /^[^\s@]+@est\.univalle\.edu$/i.test(email)
    const isTeacher = /^[^\s@]+@univalle\.edu$/i.test(email)
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setMessage('Ingresa nombres y apellidos de al menos 2 caracteres.')
      return
    }
    if (!isStudent && !isTeacher) {
      setMessage('Usa @est.univalle.edu para estudiantes o @univalle.edu para docentes.')
      return
    }
    if (isStudent && !careerId) {
      setMessage('Selecciona tu carrera para crear tu perfil de estudiante.')
      return
    }
    if (registerPassword.length < 8) {
      setMessage('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (registerPassword !== registerConfirmPassword) {
      setMessage('Las contraseñas no coinciden.')
      return
    }

    setMessage('')
    setIsSubmitting(true)
    try {
      const result = await api<{ message: string }>('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email,
          password: registerPassword,
          confirmPassword: registerConfirmPassword,
          careerId: isStudent ? careerId : undefined,
        }),
      })
      resetRegistration()
      setPendingConfirmationEmail(email)
      setView('confirmation-pending')
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible crear la cuenta.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendConfirmation() {
    if (!pendingConfirmationEmail) return
    setIsSubmitting(true)
    try {
      const result = await api<{ message: string }>('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingConfirmationEmail }),
      })
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible reenviar el correo de confirmación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = recoveryEmail.trim().toLowerCase()
    if (!email) {
      setMessage('Ingresa tu correo institucional para continuar.')
      return
    }

    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible solicitar el cambio de contraseña.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!passwordResetToken) {
      setMessage('El enlace para cambiar la contraseña no es válido.')
      return
    }
    if (newPassword.length < 8) {
      setMessage('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== newPasswordConfirmation) {
      setMessage('Las contraseñas no coinciden.')
      return
    }

    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: passwordResetToken, password: newPassword, confirmPassword: newPasswordConfirmation }),
      })
      setPasswordResetToken('')
      setNewPassword('')
      setNewPasswordConfirmation('')
      onPasswordReset()
      setView('login')
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cambiar la contraseña.')
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
            <h2>{view === 'signup' ? 'Crea tu cuenta' : view === 'confirmation-pending' ? 'Confirma tu correo' : view === 'role-assignment-pending' ? 'Roles pendientes' : view === 'password-recovery' ? 'Recupera tu acceso' : view === 'password-reset' ? 'Nueva contraseña' : 'Bienvenido'}</h2>
            <p>{view === 'signup' ? 'Te enviaremos un enlace para confirmar tu correo institucional.' : view === 'confirmation-pending' ? 'Tu cuenta se activará cuando confirmes el enlace enviado.' : view === 'role-assignment-pending' ? 'Tu correo fue confirmado y tu solicitud ya fue enviada a Administración.' : view === 'password-recovery' ? 'Te enviaremos un enlace a tu correo institucional.' : view === 'password-reset' ? 'Define una contraseña nueva y segura para continuar.' : 'Ingresa con tus credenciales institucionales.'}</p>
          </header>

          {view === 'confirmation-pending' ? (
            <section className="confirmation-pending" aria-live="polite">
              <span className="confirmation-icon"><Icon name="check" /></span>
              <h3>Esperando confirmación por email</h3>
              <p>Enviamos un enlace a <strong>{pendingConfirmationEmail}</strong>. Revisa tu bandeja de entrada y la carpeta de correo no deseado.</p>
              <p className="confirmation-tip">El enlace vence en 24 horas. Hasta confirmarlo, no podrás iniciar sesión.</p>
              <button className="submit-button" disabled={isSubmitting} onClick={() => void resendConfirmation()} type="button"><span>{isSubmitting ? 'Reenviando…' : 'Reenviar correo'}</span><Icon name="arrow" /></button>
              <button className="text-button" disabled={isSubmitting} onClick={() => { setMessage(''); setView('login') }} type="button">Volver a iniciar sesión</button>
              <p className={message ? 'form-message is-visible' : 'form-message'}>{message}</p>
            </section>
          ) : view === 'role-assignment-pending' ? (
            <section className="confirmation-pending role-assignment-pending" aria-live="polite">
              <span className="confirmation-icon"><Icon name="user" /></span>
              <h3>Aún no tienes roles asignados</h3>
              <p>El correo <strong>{pendingConfirmationEmail}</strong> ya fue confirmado. Administración recibió una notificación para asignarte el rol de Tutor, Revisor o ambos.</p>
              <p className="confirmation-tip">Cuando Administración complete la asignación, podrás ingresar con estas mismas credenciales.</p>
              <button className="text-button" disabled={isSubmitting} onClick={() => { setMessage(''); setView('login') }} type="button">Volver a iniciar sesión</button>
            </section>
          ) : view === 'password-recovery' ? (
            <form onSubmit={requestPasswordReset} noValidate>
              <label className="field-label" htmlFor="recovery-email">Correo institucional</label>
              <div className="input-shell"><Icon name="user" /><input autoComplete="email" disabled={isSubmitting} id="recovery-email" onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="nombre@univalle.edu" type="email" value={recoveryEmail} /></div>
              <p className="registration-note">Por seguridad, enviaremos el enlace solo si existe una cuenta activa con ese correo.</p>
              <button className="submit-button" disabled={isSubmitting} type="submit"><span>{isSubmitting ? 'Enviando enlace…' : 'Enviar enlace'}</span><Icon name="arrow" /></button>
              <button className="text-button" disabled={isSubmitting} onClick={() => { setMessage(''); setView('login') }} type="button">Volver a iniciar sesión</button>
              <p aria-live="polite" className={message ? 'form-message is-visible' : 'form-message'}>{message}</p>
            </form>
          ) : view === 'password-reset' ? (
            <form onSubmit={resetPassword} noValidate>
              <label className="field-label" htmlFor="new-password">Nueva contraseña</label>
              <div className="input-shell"><Icon name="lock" /><input autoComplete="new-password" disabled={isSubmitting} id="new-password" onChange={(event) => setNewPassword(event.target.value)} placeholder="Mínimo 8 caracteres" type={showResetPassword ? 'text' : 'password'} value={newPassword} /><button aria-label={showResetPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="icon-button" onClick={() => setShowResetPassword((visible) => !visible)} type="button"><Icon name={showResetPassword ? 'eyeOff' : 'eye'} /></button></div>
              <label className="field-label" htmlFor="new-password-confirmation">Confirmar nueva contraseña</label>
              <div className="input-shell"><Icon name="lock" /><input autoComplete="new-password" disabled={isSubmitting} id="new-password-confirmation" onChange={(event) => setNewPasswordConfirmation(event.target.value)} placeholder="Repite tu contraseña nueva" type={showResetPassword ? 'text' : 'password'} value={newPasswordConfirmation} /></div>
              <button className="submit-button" disabled={isSubmitting} type="submit"><span>{isSubmitting ? 'Actualizando…' : 'Actualizar contraseña'}</span><Icon name="arrow" /></button>
              <button className="text-button" disabled={isSubmitting} onClick={() => { setPasswordResetToken(''); onPasswordReset(); setView('login') }} type="button">Volver a iniciar sesión</button>
              <p aria-live="polite" className={message ? 'form-message is-visible' : 'form-message'}>{message}</p>
            </form>
          ) : view === 'signup' ? (
            <form onSubmit={handleRegister} noValidate>
              <label className="field-label" htmlFor="first-name">Nombres</label>
              <div className="input-shell"><Icon name="user" /><input autoComplete="given-name" disabled={isSubmitting} id="first-name" onChange={(event) => setFirstName(event.target.value)} placeholder="Tus nombres" type="text" value={firstName} /></div>
              <label className="field-label" htmlFor="last-name">Apellidos</label>
              <div className="input-shell"><Icon name="user" /><input autoComplete="family-name" disabled={isSubmitting} id="last-name" onChange={(event) => setLastName(event.target.value)} placeholder="Tus apellidos" type="text" value={lastName} /></div>
              <label className="field-label" htmlFor="register-email">Correo institucional</label>
              <div className="input-shell"><Icon name="user" /><input autoComplete="username" disabled={isSubmitting} id="register-email" onChange={(event) => setRegisterEmail(event.target.value)} placeholder="nombre@est.univalle.edu o nombre@univalle.edu" type="email" value={registerEmail} /></div>
              <p className="registration-note">Estudiantes: <b>@est.univalle.edu</b>. Docentes: <b>@univalle.edu</b>. Los docentes requieren asignación de rol por Administración.</p>
              {isStudentRegistration && <><label className="field-label" htmlFor="register-career">Carrera</label><div className={careerId ? 'career-select is-selected' : 'career-select'}><span aria-hidden="true" className="career-select-badge">{careerId ? careers.find((career) => career.id === careerId)?.code ?? 'OK' : 'UV'}</span><select disabled={isSubmitting} id="register-career" onChange={(event) => setCareerId(event.target.value)} value={careerId}><option value="">Selecciona tu carrera</option>{careers.map((career) => <option key={career.id} value={career.id}>{career.code} · {career.name}</option>)}</select><Icon name="chevron" /></div></>}
              <label className="field-label" htmlFor="register-password">Contraseña</label>
              <div className="input-shell"><Icon name="lock" /><input autoComplete="new-password" disabled={isSubmitting} id="register-password" onChange={(event) => setRegisterPassword(event.target.value)} placeholder="Mínimo 8 caracteres" type={showRegisterPassword ? 'text' : 'password'} value={registerPassword} /><button aria-label={showRegisterPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="icon-button" onClick={() => setShowRegisterPassword((visible) => !visible)} type="button"><Icon name={showRegisterPassword ? 'eyeOff' : 'eye'} /></button></div>
              <label className="field-label" htmlFor="register-confirm-password">Confirmar contraseña</label>
              <div className="input-shell"><Icon name="lock" /><input autoComplete="new-password" disabled={isSubmitting} id="register-confirm-password" onChange={(event) => setRegisterConfirmPassword(event.target.value)} placeholder="Repite tu contraseña" type={showRegisterPassword ? 'text' : 'password'} value={registerConfirmPassword} /></div>
              <button className="submit-button" disabled={isSubmitting} type="submit"><span>{isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}</span><Icon name="arrow" /></button>
              <button className="text-button" disabled={isSubmitting} onClick={() => { resetRegistration(); setMessage(''); setView('login') }} type="button">Ya tengo una cuenta</button>
              <p aria-live="polite" className={message ? 'form-message is-visible' : 'form-message'}>{message}</p>
            </form>
          ) : <form onSubmit={handleSubmit} noValidate>
              <label className="field-label" htmlFor="identifier">Correo institucional</label>
              <div className="input-shell"><Icon name="user" /><input autoComplete="username" disabled={isSubmitting} id="identifier" name="identifier" onChange={(event) => setIdentifier(event.target.value)} placeholder="nombre@univalle.edu" type="email" value={identifier} /></div>
              <div className="password-heading"><label className="field-label" htmlFor="password">Contraseña</label><button className="text-button" onClick={() => { setRecoveryEmail(identifier.trim()); setMessage(''); setView('password-recovery') }} type="button">¿Olvidaste tu contraseña?</button></div>
              <div className="input-shell"><Icon name="lock" /><input autoComplete="current-password" disabled={isSubmitting} id="password" name="password" onChange={(event) => setPassword(event.target.value)} placeholder="Ingresa tu contraseña" type={showPassword ? 'text' : 'password'} value={password} /><button aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="icon-button" onClick={() => setShowPassword((visible) => !visible)} type="button"><Icon name={showPassword ? 'eyeOff' : 'eye'} /></button></div>
              <label className="remember-option"><input checked={remember} disabled={isSubmitting} onChange={(event) => setRemember(event.target.checked)} type="checkbox" /><span>Recordar mi sesión en este equipo</span></label>
              <button className="submit-button" disabled={isSubmitting} type="submit"><span>{isSubmitting ? 'Verificando acceso…' : 'Iniciar sesión'}</span><Icon name="arrow" /></button>
              <button className="text-button" disabled={isSubmitting} onClick={() => { setMessage(''); setView('signup') }} type="button">Crear cuenta</button>
              <p aria-live="polite" className={message ? 'form-message is-visible' : 'form-message'}>{message}</p>
            </form>}
          <p className="help-text">Acceso protegido con sesiones registradas en el sistema académico.</p>
        </div>
      </section>
    </main>
  )
}

function projectStatusPresentation(statusCode: string) {
  if (statusCode === 'EN_DOCUMENTO_PRIVADO') {
    return { tone: 'approved', label: 'Documento para defensa privada habilitado', message: 'Tu perfil fue aprobado. Ya puedes subir el documento para defensa privada desde Documentos.' }
  }
  if (['OBSERVADO', 'RECHAZADO'].includes(statusCode)) {
    return { tone: 'rejected', label: 'Rechazado con observaciones', message: 'Tu perfil requiere correcciones. Revisa los motivos indicados por los revisores.' }
  }
  if (statusCode === 'FINALIZADO') {
    return { tone: 'approved', label: 'Proyecto finalizado', message: 'Tu proyecto completó todas las etapas académicas y fue cerrado por Administración.' }
  }
  if (['APROBADO_TECNICO', 'APROBADO_INSTITUCIONAL'].includes(statusCode)) {
    return { tone: 'approved', label: 'Aprobado', message: 'Tu perfil fue aprobado. Puedes consultar el avance de tu proceso desde este portal.' }
  }
  return { tone: 'pending', label: 'Pendiente de revisión', message: 'Tu perfil está en espera de la revisión académica correspondiente.' }
}

function defensePendingMessage(defenses: DefenseSchedules) {
  const pending = [
    defenses.private.available && !defenses.private.scheduledAt ? 'la defensa privada' : '',
    defenses.public.available && !defenses.public.scheduledAt ? 'la defensa pública' : '',
  ].filter(Boolean)
  if (pending.length === 0) return ''
  return `Falta que Administración asigne fecha, hora y lugar para ${pending.join(' y ')}.`
}

function DefenseScheduleStatus({ defenses }: { defenses: DefenseSchedules }) {
  const items = [
    { key: 'private', label: 'Defensa privada', schedule: defenses.private },
    { key: 'public', label: 'Defensa pública', schedule: defenses.public },
  ].filter((item) => item.schedule.available)
  if (items.length === 0) return null
  return <section className="defense-schedule-status" aria-label="Programación de defensas">{items.map((item) => <article className={item.schedule.scheduledAt ? 'is-scheduled' : 'is-pending'} key={item.key}><small>{item.label}</small><strong>{item.schedule.scheduledAt ? formatDate(item.schedule.scheduledAt) : 'Fecha, hora y lugar pendientes'}</strong><span>{item.schedule.scheduledAt ? item.schedule.location : 'Administración debe registrar la convocatoria para esta defensa.'}</span></article>)}</section>
}

function ExistingProject({ project, message, rejectionReasons, reviewProgress }: { project: Project; message: string; rejectionReasons: ProjectRejectionReason[]; reviewProgress: Bootstrap['reviewProgress'] }) {
  const status = projectStatusPresentation(project.statusCode)
  const pending = reviewProgress.filter((item) => item.decision === 'PENDIENTE').map((item) => item.type === 'TUTOR' ? 'Revision del tutor' : item.type === 'REVISOR_1' ? 'Revision del Revisor 1' : 'Revision del Revisor 2')
  const defensePending = defensePendingMessage(project.defenses)
  const phases = [
    { code: 'REGISTRO', label: 'Perfil', detail: 'Registro' },
    { code: 'REVISION_PERFIL', label: 'Perfil', detail: 'Revisión' },
    { code: 'DOCUMENTO_PRIVADO', label: 'Defensa privada', detail: 'Documento y dictamen' },
    { code: 'DOCUMENTO_PUBLICO', label: 'Defensa pública', detail: 'Documento final' },
    { code: 'CIERRE', label: 'Cierre', detail: 'Titulación' },
  ]
  const activePhase = phases.findIndex((phase) => phase.code === project.phaseCode)
  return (
    <>
      <section className={`student-callout project-status-callout is-${status.tone}`}><Icon name="check" /><div><span className="project-status-badge">{status.label}</span><strong>{status.label}</strong><p>{message || status.message}{pending.length > 0 ? ` Falta: ${pending.join(', ')}.` : ''}{defensePending ? ` ${defensePending}` : ''}</p></div></section>
      <section className="project-phase-timeline" aria-label="Fases del proyecto"><div><p>AVANCE DEL PROYECTO</p><h2>Fases de titulación</h2></div><ol>{phases.map((phase, index) => <li className={index < activePhase ? 'is-complete' : index === activePhase ? 'is-current' : ''} key={phase.code}><span>{index < activePhase ? '✓' : index + 1}</span><div><strong>{phase.label}</strong><small>{phase.detail}</small></div></li>)}</ol></section>
      <section className="form-section project-summary">
        <div className="section-heading"><span>F1</span><div><h2>{project.title}</h2><p>Código de seguimiento: <strong>{project.code}</strong></p></div></div>
        <div className="project-summary-grid">
          <div><small>Gestión</small><strong>{project.management}</strong></div>
          <div><small>Modalidad</small><strong>{project.modality}</strong></div>
          <div><small>Fase actual</small><strong>{project.phase}</strong></div>
          <div><small>Estado</small><strong className={`project-status-text is-${status.tone}`}>{status.label}</strong></div>
        </div>
        <div className="project-summary-copy"><small>Descripción</small><p>{project.description}</p><small>Objetivo general</small><p>{project.generalObjective}</p></div>
        <DefenseScheduleStatus defenses={project.defenses} />
        {status.tone === 'rejected' && <section className="project-rejection-reasons"><div><p>REVISIÓN DEL PERFIL</p><h3>Motivos de rechazo</h3><span>Corrige cada punto desde Documentos antes de adjuntar una nueva versión.</span></div>{rejectionReasons.length === 0 ? <p className="project-rejection-empty">El perfil fue devuelto para correcciones. Revisa la sección Documentos para conocer el detalle.</p> : <div className="rejection-reason-list">{rejectionReasons.map((reason) => <article key={`${reason.reviewer}-${reason.roundNumber}`}><header><strong>{reason.reviewer}</strong><span>Ronda {reason.roundNumber} · V{reason.sourceVersion}</span></header>{reason.comment && <p className="rejection-general-comment">{reason.comment}</p>}{reason.observations.length > 0 && <ol>{reason.observations.map((observation) => <li key={observation.number}><b>{observation.number}</b><span>{observation.detail}</span></li>)}</ol>}</article>)}</div>}</section>}
      </section>
    </>
  )
}

function StudentForm({ data, onLogout, onRegistered, onDocuments, onHome, sessionActions }: { data: Bootstrap; onLogout: () => Promise<void>; onRegistered: () => Promise<void>; onDocuments: () => void; onHome: () => void; sessionActions: ReactNode }) {
  const [title, setTitle] = useState('')
  const [managementId, setManagementId] = useState('')
  const [modalityId, setModalityId] = useState('')
  const [tutorId, setTutorId] = useState('')
  const [program, setProgram] = useState('')
  const [participants, setParticipants] = useState(data.user.fullName)
  const [address, setAddress] = useState('')
  const [landline, setLandline] = useState('')
  const [contactEmail, setContactEmail] = useState(data.user.email)
  const [mobile, setMobile] = useState('')
  const [scope, setScope] = useState('')
  const [hasTutor, setHasTutor] = useState(true)
  const [tutorName, setTutorName] = useState('')
  const [tutorWorkplace, setTutorWorkplace] = useState('')
  const [tutorEmail, setTutorEmail] = useState('')
  const [tutorMobile, setTutorMobile] = useState('')
  const [generalObjective, setGeneralObjective] = useState('')
  const [specificObjectives, setSpecificObjectives] = useState([''])
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [supportingFiles, setSupportingFiles] = useState<File[]>([])
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

  function selectSupportingDocuments(event: ChangeEvent<HTMLInputElement>) {
    setSupportingFiles(Array.from(event.target.files ?? []).slice(0, 5))
  }

  function selectTutor(value: string) {
    setTutorId(value)
    const tutor = data.tutors.find((item) => item.id === value)
    if (tutor) setTutorName(tutor.name)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const filledObjectives = specificObjectives.filter((objective) => objective.trim())
    const hasObjectives = filledObjectives.every((objective) => objective.trim().length >= 10)
    if (!participants.trim() || !program || address.trim().length < 5 || !contactEmail.includes('@') || title.trim().length < 10 || scope.trim().length < 20 || generalObjective.trim().length < 10 || !managementId || !modalityId || !hasObjectives || !profileFile || (hasTutor && (!tutorId || tutorName.trim().length < 3 || tutorWorkplace.trim().length < 3))) {
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
    formData.set('program', program)
    formData.set('participants', participants.trim())
    formData.set('address', address.trim())
    formData.set('landline', landline.trim())
    formData.set('contactEmail', contactEmail.trim())
    formData.set('mobile', mobile.trim())
    formData.set('scope', scope.trim())
    formData.set('hasTutor', String(hasTutor))
    formData.set('tutorId', tutorId)
    formData.set('tutorName', tutorName.trim())
    formData.set('tutorWorkplace', tutorWorkplace.trim())
    formData.set('tutorEmail', tutorEmail.trim())
    formData.set('tutorMobile', tutorMobile.trim())
    formData.set('title', title.trim())
    formData.set('description', scope.trim())
    formData.set('generalObjective', generalObjective.trim())
    formData.set('objectives', JSON.stringify(filledObjectives.map((objective) => objective.trim())))
    formData.set('profile', profileFile)
    supportingFiles.forEach((file) => formData.append('supportingDocuments', file))

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

          {data.project ? <ExistingProject message={message} project={data.project} rejectionReasons={data.rejectionReasons} reviewProgress={data.reviewProgress} /> : (
            <>
              <section className="student-callout"><Icon name="check" /><div><strong>Antes de comenzar</strong><p>Ten a mano el título tentativo, los objetivos del proyecto y el perfil en formato Word.</p></div></section>
              <form className="project-form" onSubmit={handleSubmit} noValidate>
                <section className="form-section">
                  <div className="section-heading"><span>01</span><div><h2>Datos del estudiante</h2><p>Información de contacto solicitada en el Formulario 1.</p></div></div>
                  <label className="form-field"><span>Apellido(s) y nombre(s) del estudiante <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setParticipants(event.target.value)} placeholder="Registra una persona por línea si el proyecto es grupal." rows={3} value={participants} /><small>Si son dos o más estudiantes, registra una persona en cada línea.</small></label>
                  <div className="field-grid field-grid-two">
                    <label className="form-field"><span>Carrera <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setProgram(event.target.value)} value={program}><option value="">Selecciona una carrera</option><option value="Ingenieria de Sistemas Informaticos">Ingeniería de Sistemas Informáticos</option><option value="Tecnico Superior en Desarrollo de Video Juegos">Técnico Superior en Desarrollo de Video Juegos</option></select></label>
                    <label className="form-field"><span>Gestión <b>*</b></span><select disabled={isSubmitting || data.managements.length === 0} onChange={(event) => setManagementId(event.target.value)} value={managementId}><option value="">Selecciona una gestión</option>{data.managements.map((management) => <option key={management.id} value={management.id}>{management.codigo} · {management.nombre}</option>)}</select></label>
                  </div>
                  <label className="form-field"><span>Dirección de domicilio <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setAddress(event.target.value)} placeholder="Zona, calle, número y ciudad" value={address} /></label>
                  <div className="field-grid field-grid-two">
                    <label className="form-field"><span>Teléfono fijo</span><input disabled={isSubmitting} onChange={(event) => setLandline(event.target.value)} placeholder="Ej.: 4 000000" value={landline} /></label>
                    <label className="form-field"><span>Número de celular</span><input disabled={isSubmitting} onChange={(event) => setMobile(event.target.value)} placeholder="Ej.: 7 0000000" value={mobile} /></label>
                  </div>
                  <label className="form-field"><span>Correo electrónico <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setContactEmail(event.target.value)} type="email" value={contactEmail} /></label>
                </section>

                <section className="form-section">
                  <div className="section-heading"><span>02</span><div><h2>Datos del trabajo de grado</h2><p>Describe tu propuesta académica, tal como solicita el Formulario 1.</p></div></div>
                  <div className="field-grid field-grid-two">
                    <label className="form-field"><span>Modalidad de titulación <b>*</b></span><select disabled={isSubmitting || data.modalities.length === 0} onChange={(event) => setModalityId(event.target.value)} value={modalityId}><option value="">Selecciona una modalidad</option>{data.modalities.map((modality) => <option key={modality.id} value={modality.id}>{modality.nombre}</option>)}</select></label>
                    <div className="form-field"><span>Código de seguimiento</span><div className="readonly-field">Se asignará al registrar</div></div>
                  </div>
                  <label className="form-field"><span>Posible título del trabajo <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setTitle(event.target.value)} placeholder="Ej.: Sistema web para el seguimiento de procesos de titulación" value={title} /></label>
                  <label className="form-field"><span>Objetivo general <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setGeneralObjective(event.target.value)} placeholder="Describe el resultado principal que deseas alcanzar con el proyecto." rows={3} value={generalObjective} /><small>Mínimo: 10 caracteres.</small></label>
                  <div className="objectives-area"><div className="objective-label"><span>Objetivos específicos</span><small>Incluye las acciones concretas que permitirán alcanzar el objetivo general.</small></div>{specificObjectives.map((objective, index) => <div className="objective-input" key={`objective-${index}`}><span>{index + 1}</span><input aria-label={`Objetivo específico ${index + 1}`} disabled={isSubmitting} onChange={(event) => updateObjective(index, event.target.value)} placeholder={`Objetivo específico ${index + 1} (mínimo 10 caracteres)`} value={objective} />{specificObjectives.length > 1 && <button aria-label={`Eliminar objetivo específico ${index + 1}`} disabled={isSubmitting} onClick={() => setSpecificObjectives((objectives) => objectives.filter((_, objectiveIndex) => objectiveIndex !== index))} type="button"><Icon name="trash" /></button>}</div>)}<button className="add-objective" disabled={isSubmitting} onClick={() => setSpecificObjectives((objectives) => [...objectives, ''])} type="button"><Icon name="plus" />Añadir objetivo específico</button></div>
                  <label className="form-field"><span>Alcance del trabajo de grado <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setScope(event.target.value)} placeholder="Delimita qué resolverá el proyecto, sus usuarios, entregables y límites." rows={4} value={scope} /><small>Mínimo: 20 caracteres.</small></label>
                </section>

                <section className="form-section">
                  <div className="section-heading"><span>03</span><div><h2>Datos de asesoramiento</h2><p>Registra a tu tutor si ya cuentas con uno.</p></div></div>
                  <fieldset className="tutor-choice" disabled={isSubmitting}><legend>¿Cuenta usted con un tutor?</legend><label><input checked={hasTutor} name="has-tutor" onChange={() => setHasTutor(true)} type="radio" /> Sí</label><label><input checked={!hasTutor} name="has-tutor" onChange={() => setHasTutor(false)} type="radio" /> No</label></fieldset>
                  {hasTutor && <><label className="form-field"><span>Tutor registrado en el sistema <b>*</b></span><select disabled={isSubmitting || data.tutors.length === 0} onChange={(event) => selectTutor(event.target.value)} value={tutorId}><option value="">Selecciona un tutor</option>{data.tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.name}</option>)}</select><small>El docente recibirá una invitación y deberá aceptarla para confirmar la tutoría.</small></label><div className="field-grid field-grid-two"><label className="form-field"><span>Nombre del tutor <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setTutorName(event.target.value)} value={tutorName} /></label><label className="form-field"><span>Lugar de trabajo <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setTutorWorkplace(event.target.value)} placeholder="Ej.: Universidad Privada del Valle" value={tutorWorkplace} /></label></div><div className="field-grid field-grid-two"><label className="form-field"><span>Correo electrónico</span><input disabled={isSubmitting} onChange={(event) => setTutorEmail(event.target.value)} type="email" value={tutorEmail} /></label><label className="form-field"><span>Número de celular</span><input disabled={isSubmitting} onChange={(event) => setTutorMobile(event.target.value)} value={tutorMobile} /></label></div></>}
                  <div className="form-field"><span>Perfil del proyecto en Word <b>*</b></span><label className={profileFile ? 'upload-box has-file' : 'upload-box'} htmlFor="profile"><input accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={isSubmitting} id="profile" onChange={selectProfile} type="file" /><Icon name={profileFile ? 'check' : 'upload'} /><div><strong>{profileFile?.name || 'Adjunta tu perfil de proyecto'}</strong><small>{profileFile ? 'Archivo listo para registrarse en el sistema.' : 'Formato permitido: .doc o .docx · máximo 10 MB'}</small></div><span>{profileFile ? 'Cambiar archivo' : 'Seleccionar archivo'}</span></label></div>
                  <div className="form-field"><span>Documento complementario (si es necesario o solicitado)</span><label className={supportingFiles.length ? 'upload-box has-file' : 'upload-box'} htmlFor="supporting-documents"><input accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.avi,.mp3,.wav,.m4a" disabled={isSubmitting} id="supporting-documents" multiple onChange={selectSupportingDocuments} type="file" /><Icon name={supportingFiles.length ? 'check' : 'upload'} /><div><strong>{supportingFiles.length ? `${supportingFiles.length} documento(s) listo(s)` : 'Carga hasta 5 documentos complementarios'}</strong><small>Word, Excel, PowerPoint, PDF, imágenes, video o audio · máximo 10 MB por archivo.</small></div><span>{supportingFiles.length ? 'Cambiar archivos' : 'Seleccionar archivos'}</span></label></div>
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

function defenseInputParts(value: string | null) {
  if (!value) return { date: '', time: '' }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function documentLabel(type: string) {
  if (type === 'PERFIL_PROYECTO') return 'Perfil de proyecto'
  if (type === 'DOCUMENTO_PRIVADO') return 'Documento para defensa privada'
  return type.replaceAll('_', ' ')
}

function reviewerRoleLabel(type: string) {
  if (type === 'TUTOR') return 'Tutor'
  if (type === 'REVISOR_1') return 'Revisor 1'
  if (type === 'REVISOR_2') return 'Revisor 2'
  return type
}

function reviewDecisionLabel(decision: string) {
  if (decision === 'APROBADO') return 'Aprobado'
  if (decision === 'OBSERVADO' || decision === 'RECHAZADO') return 'Observado'
  return 'Pendiente'
}

function ReviewProgress({ reviews }: { reviews: ReviewParticipant[] }) {
  const missing = reviews.filter((review) => review.decision === 'PENDIENTE')
  const observed = reviews.some((review) => review.decision === 'OBSERVADO' || review.decision === 'RECHAZADO')
  return <div className={`review-progress ${observed ? 'is-observed' : reviews.length > 0 && missing.length === 0 ? 'is-approved' : 'is-pending'}`}>
    <strong>{observed ? 'Proyecto observado' : reviews.length > 0 && missing.length === 0 ? 'Proyecto aprobado por la ronda' : 'Revisión en curso'}</strong>
    <div className="review-progress-members">{reviews.map((review) => <span className={`review-progress-member decision-${review.decision.toLowerCase()}`} key={`${review.assignmentType}-${review.reviewer}`}><b>{reviewerRoleLabel(review.assignmentType)}</b> · {reviewerRoleLabel(review.assignmentType) === 'Tutor' ? review.reviewer : review.reviewer} — {reviewDecisionLabel(review.decision)}</span>)}</div>
    {missing.length > 0 && <small>Falta: {missing.map((review) => `${reviewerRoleLabel(review.assignmentType)} (${review.reviewer})`).join(', ')}.</small>}
  </div>
}

function HomeView({ data, onLogout, onProject, onDocuments, onRefresh, sessionActions, navigationTarget, onNavigationHandled }: { data: Bootstrap; onLogout: () => Promise<void>; onProject: () => void; onDocuments: () => void; onRefresh: () => Promise<void>; sessionActions: ReactNode; navigationTarget: NotificationDestination | null; onNavigationHandled: () => void }) {
  const [overview, setOverview] = useState<StudentOverview | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(data.project))
  const [error, setError] = useState('')
  const [isTutorProposalOpen, setIsTutorProposalOpen] = useState(false)
  const [selectedTutorId, setSelectedTutorId] = useState('')
  const [proposalMessage, setProposalMessage] = useState('')
  const [isSubmittingTutorProposal, setIsSubmittingTutorProposal] = useState(false)

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
  }, [data.project?.id, data.project?.needsTutorProposal])

  useEffect(() => {
    if (navigationTarget === '/student/proponer-tutor') {
      setIsTutorProposalOpen(true)
      onNavigationHandled()
    }
  }, [navigationTarget, onNavigationHandled])

  async function submitTutorProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data.project || !selectedTutorId) {
      setProposalMessage('Selecciona un docente para enviar la invitación.')
      return
    }
    setIsSubmittingTutorProposal(true)
    setProposalMessage('')
    try {
      const result = await api<{ message: string }>(`/api/student/projects/${data.project.id}/tutor-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId: selectedTutorId }),
      })
      setProposalMessage(result.message)
      setSelectedTutorId('')
      setIsTutorProposalOpen(false)
      await onRefresh()
    } catch (proposalError) {
      setProposalMessage(proposalError instanceof Error ? proposalError.message : 'No fue posible enviar la invitación al tutor.')
    } finally {
      setIsSubmittingTutorProposal(false)
    }
  }

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
              {data.project?.needsTutorProposal && <section className="student-callout tutor-proposal-callout"><Icon name="user" /><div><span className="tutor-proposal-label">ACCIÓN REQUERIDA</span><strong>El docente declinó tu tutoría</strong><p>Debes proponer un nuevo docente para que pueda aceptar y continuar con el acompañamiento de tu proyecto.</p>{!isTutorProposalOpen && <button className="primary-button" onClick={() => { setIsTutorProposalOpen(true); setProposalMessage('') }} type="button">Proponer nuevo docente <Icon name="arrow" /></button>}</div>{isTutorProposalOpen && <form className="tutor-proposal-form" onSubmit={submitTutorProposal}><label className="form-field"><span>Nuevo tutor <b>*</b></span><select disabled={isSubmittingTutorProposal || data.tutors.length === 0} onChange={(event) => setSelectedTutorId(event.target.value)} value={selectedTutorId}><option value="">Selecciona un tutor</option>{data.tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.name}</option>)}</select><small>El docente recibirá una invitación y deberá aceptarla para confirmar la tutoría.</small></label><div className="tutor-proposal-actions"><button className="secondary-button" disabled={isSubmittingTutorProposal} onClick={() => { setIsTutorProposalOpen(false); setProposalMessage('') }} type="button">Cancelar</button><button className="primary-button" disabled={isSubmittingTutorProposal || !selectedTutorId} type="submit">{isSubmittingTutorProposal ? 'Enviando…' : 'Enviar invitación'} <Icon name="arrow" /></button></div></form>}</section>}
              {proposalMessage && <p aria-live="polite" className="student-message is-visible documents-message">{proposalMessage}</p>}
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

                <DefenseScheduleStatus defenses={project.defenses} />

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
  const [observationReplies, setObservationReplies] = useState<Record<string, string>>({})
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

  async function submitVersion(event: FormEvent<HTMLFormElement>, document: StudentDocument) {
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
    const openObservations = document.observations.filter((observation) => observation.status === 'ABIERTA')
    const responses = openObservations.map((observation) => ({ id: observation.id, response: observationReplies[observation.id]?.trim() ?? '' }))
    if (responses.some((item) => item.response.length < 5)) {
      setMessage('Explica cómo corregiste cada observación antes de subir la nueva versión.')
      return
    }

    const form = new FormData()
    form.set('document', versionFile)
    form.set('comment', comment.trim())
    form.set('observationResponses', JSON.stringify(responses))
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/documents/${document.id}/versions`, { method: 'POST', body: form })
      setMessage(result.message)
      setSelectedDocumentId('')
      setVersionFile(null)
      setComment('')
      setObservationReplies({})
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
                    {document.observations.length > 0 && <section className="document-observations"><div className="document-observations-heading"><div><small>DEVOLUCIONES DE REVISORES</small><h3>Observaciones del perfil</h3><p>Consulta las observaciones de la versión devuelta. Las respuestas se completan junto con el archivo al subir la versión corregida.</p></div><span>{document.observations.filter((observation) => observation.status === 'ABIERTA').length} pendientes</span></div><ol>{document.observations.map((observation) => <li className={`document-observation is-${observation.status.toLowerCase()}`} key={observation.id}><div className="observation-number">{observation.number}</div><div className="observation-content"><div className="observation-meta"><strong>{observation.reviewer}</strong><span>Ronda {observation.roundNumber} · Perfil V{observation.sourceVersion}</span></div><p>{observation.detail}</p>{observation.status === 'ABIERTA' ? <p className="observation-pending-note">Pendiente de corrección. Responde este punto al seleccionar “Subir nueva versión”.</p> : <div className="observation-response"><strong>{observation.status === 'CERRADA' ? 'Corrección validada' : `Asociada a la versión V${observation.responseVersion}`}</strong><p>{observation.response}</p>{observation.respondedAt && <small>Respondida el {formatDate(observation.respondedAt)}</small>}</div>}</div></li>)}</ol></section>}
                    {document.versions.length > 0 && <details className="version-history"><summary>Ver historial de versiones ({document.versions.length})</summary><ul>{document.versions.map((version) => <li key={version.id}><div><strong>Versión {version.number}</strong><span>{version.filename} · {formatDate(version.uploadedAt)}{version.comment ? ` · ${version.comment}` : ''}</span></div><a aria-label={`Descargar versión ${version.number}`} href={`/api/documents/${document.id}/download?version=${version.id}`}><Icon name="download" /></a></li>)}</ul></details>}
                    {document.canUploadVersion ? <div className="document-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => { setSelectedDocumentId(isUpdating ? '' : document.id); setMessage('') }} type="button">{isUpdating ? 'Cancelar actualización' : 'Subir nueva versión'}</button><small>Puedes enviar una nueva versión de este documento.</small></div> : <p className="document-lock-note">{document.reviewInProgress ? 'Este documento tiene una revisión en curso. Espera a que termine antes de enviar una nueva versión.' : 'El estado actual no permite nuevas versiones. La edición se habilitará según el avance del proyecto.'}</p>}
                    {isUpdating && <form className="version-form" onSubmit={(event) => void submitVersion(event, document)}><div className="version-form-heading"><small>VERSIÓN CORREGIDA</small><h3>Adjunta V{document.totalVersions + 1} y responde las observaciones</h3><p>Las respuestas y el archivo se guardarán juntos. No se registrará ninguna respuesta por separado.</p></div>{document.observations.filter((observation) => observation.status === 'ABIERTA').length > 0 && <section className="version-observation-responses"><strong>Respuestas a observaciones <b>*</b></strong>{document.observations.filter((observation) => observation.status === 'ABIERTA').map((observation) => <label key={observation.id}><span>{observation.reviewer} · Observación {observation.number}</span><small>{observation.detail}</small><textarea disabled={isSubmitting} onChange={(event) => setObservationReplies((current) => ({ ...current, [observation.id]: event.target.value }))} placeholder="Explica qué corregiste y en qué sección de la nueva versión." rows={3} value={observationReplies[observation.id] ?? ''} /></label>)}</section>}<label className="form-field"><span>Nueva versión en Word <b>*</b></span><input accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={isSubmitting} onChange={(event) => setVersionFile(event.target.files?.[0] ?? null)} type="file" /><small>{versionFile ? versionFile.name : 'Formato permitido: .doc o .docx · máximo 10 MB'}</small></label><label className="form-field"><span>Comentario de entrega</span><textarea disabled={isSubmitting} onChange={(event) => setComment(event.target.value)} placeholder="Indica brevemente qué corregiste en esta versión." rows={2} value={comment} /></label><button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Guardando…' : 'Guardar nueva versión'} <Icon name="arrow" /></button></form>}
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

function TutorPortal({ data, notifications, onLogout, onRefresh, sessionActions, navigationTarget, onNavigationHandled }: { data: TutorDashboard; notifications: AppNotification[]; onLogout: () => Promise<void>; onRefresh: () => Promise<void>; sessionActions: ReactNode; navigationTarget: NotificationDestination | null; onNavigationHandled: () => void }) {
  const [view, setView] = useState<'home' | 'invitations' | 'projects' | 'reviewed' | 'defenses' | 'notifications'>('home')
  const [defenseType, setDefenseType] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE')
  const [decliningId, setDecliningId] = useState('')
  const [selectedEvaluation, setSelectedEvaluation] = useState<TutorAssignment | null>(null)
  const [formatRatings, setFormatRatings] = useState<Record<string, string>>({})
  const [backgroundRatings, setBackgroundRatings] = useState<Record<string, string>>({})
  const [publicRatification, setPublicRatification] = useState('')
  const [evaluationObservations, setEvaluationObservations] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (navigationTarget === '/tutor/invitaciones') {
      setSelectedEvaluation(null)
      setView('invitations')
      onNavigationHandled()
    }
    if (navigationTarget === '/tutor/proyectos') {
      setSelectedEvaluation(null)
      setView('projects')
      onNavigationHandled()
    }
    if (navigationTarget === '/tutor/defensas-privada' || navigationTarget === '/tutor/defensas-publica') {
      setSelectedEvaluation(null)
      setDefenseType(navigationTarget === '/tutor/defensas-privada' ? 'PRIVATE' : 'PUBLIC')
      setView('defenses')
      onNavigationHandled()
    }
    if (navigationTarget === '/tutor') {
      setSelectedEvaluation(null)
      setView('home')
      onNavigationHandled()
    }
  }, [navigationTarget, onNavigationHandled])

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

  async function submitEvaluation(decision: 'APROBADO' | 'OBSERVADO') {
    if (!selectedEvaluation) return
    const isPrivateDefense = selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PRIVADO'
    const isPublicDefense = selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PUBLICO'
    const formatCriteriaPayload = isPrivateDefense || isPublicDefense ? [] : formatCriteria.map(([code]) => ({ code, value: formatRatings[code] ?? '' }))
    const backgroundCriteriaPayload = isPublicDefense ? [] : (isPrivateDefense ? privateDefenseCriteria : backgroundCriteria).map(([code]) => ({ code, value: backgroundRatings[code] ?? '' }))
    const observations = evaluationObservations.split('\n').map((item) => item.trim()).filter(Boolean)
    if (formatCriteriaPayload.some((item) => !item.value) || backgroundCriteriaPayload.some((item) => !item.value) || (isPublicDefense && !publicRatification) || (decision === 'OBSERVADO' && observations.length === 0)) { setMessage(isPublicDefense ? 'Selecciona la ratificación y registra observaciones para No o Parcialmente.' : 'Completa las matrices y registra observaciones si devuelves el perfil.'); return }
    setIsSubmitting(true); setMessage('')
    try { const result = await api<{ message: string }>(`/api/tutor/projects/${selectedEvaluation.projectId}/formulario2`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, observations, formatCriteria: formatCriteriaPayload, backgroundCriteria: backgroundCriteriaPayload, publicRatification }) }); setSelectedEvaluation(null); await onRefresh(); setMessage(result.message) } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible guardar la evaluación.') } finally { setIsSubmitting(false) }
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
    if (project.canReviewProfile) project.statusCode = 'PENDIENTE_APROBACION'
    return <article className="tutor-card tutor-project-card" key={project.id}>
      <div className="tutor-card-top"><span className="tutor-code">{project.code}</span><span className="assignment-status confirmed">Tutoría confirmada</span></div>
      <h2>{project.title}</h2>
      <p className="tutor-card-description">{project.description}</p>
      {project.teamReviews.length > 0 && <ReviewProgress reviews={project.teamReviews} />}
      <div className="tutor-project-meta"><span><Icon name="user" />{project.students}</span><span><Icon name="clipboard" />{project.modality}</span><span><Icon name="check" />{project.phase} · {project.status}</span></div>
      <DefenseScheduleStatus defenses={project.defenses} />
      <div className="tutor-project-footer"><div><small>Objetivo general</small><p>{project.generalObjective}</p></div>{project.profile && <a className="document-download tutor-document-link" href={`/api/tutor/documents/${project.profile.documentId}/download`}><Icon name="download" />{project.reviewDocumentType === 'DOCUMENTO_PUBLICO' ? 'Documento final' : project.reviewDocumentType === 'DOCUMENTO_PRIVADO' ? 'Documento privado' : 'Perfil'} V{project.profile.version}</a>}</div>{project.canReviewProfile && <div className="tutor-actions"><button className="primary-button" onClick={() => { setSelectedEvaluation(project); setFormatRatings({}); setBackgroundRatings({}); setPublicRatification(''); setEvaluationObservations('') }} type="button"><Icon name="clipboard" />{project.reviewDocumentType === 'DOCUMENTO_PUBLICO' ? 'Evaluar defensa pública' : project.reviewDocumentType === 'DOCUMENTO_PRIVADO' ? 'Evaluar defensa privada' : 'Evaluar Formulario 2'}</button></div>}
    </article>
  }

  const reviewedProjects = data.projects.filter((project) => project.teamReviews.some((review) => review.decision !== 'PENDIENTE'))
  const defenseProjects = data.projects.filter((project) => defenseType === 'PRIVATE' ? project.defenses.private.available : project.defenses.public.available)
  const heading = view === 'home' ? 'Inicio' : view === 'invitations' ? 'Invitaciones de tutoría' : view === 'projects' ? 'Mis proyectos' : view === 'reviewed' ? 'Proyectos revisados' : view === 'defenses' ? 'Defensas' : 'Notificaciones'
  const copy = view === 'home' ? 'Revisa las solicitudes y el estado de los proyectos que acompañas.' : view === 'invitations' ? 'Responde cada solicitud para confirmar o declinar la tutoría.' : view === 'projects' ? 'Consulta los proyectos cuya tutoría aceptaste.' : view === 'reviewed' ? 'Consulta los dictámenes emitidos, el estado de cada proyecto y las revisiones pendientes.' : view === 'defenses' ? 'Revisa y emite el dictamen para documentos de defensa privada o pública.' : 'Mantente al tanto de las solicitudes y actualizaciones de tus proyectos.'

  return <main className="student-page tutor-page">
    <aside className="student-sidebar tutor-sidebar">
      <div>
        <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
        <p className="student-role">PORTAL DEL TUTOR</p>
        <nav aria-label="Navegación del tutor" className="student-nav">
          <button className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')} type="button"><Icon name="dashboard" /><span>Inicio</span></button>
          <button className={view === 'invitations' ? 'is-active' : ''} onClick={() => setView('invitations')} type="button"><Icon name="user" /><span>Invitaciones</span>{data.invitations.length > 0 && <b className="nav-count">{data.invitations.length}</b>}</button>
          <button className={view === 'projects' ? 'is-active' : ''} onClick={() => setView('projects')} type="button"><Icon name="clipboard" /><span>Mis proyectos</span></button>
          <button className={view === 'reviewed' ? 'is-active' : ''} onClick={() => setView('reviewed')} type="button"><Icon name="check" /><span>Proyectos revisados</span></button>
          <button className={view === 'defenses' ? 'is-active' : ''} onClick={() => setView('defenses')} type="button"><Icon name="file" /><span>Defensas</span></button>
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
        {selectedEvaluation?.canReviewProfile && <p className="eyebrow">REVISION DEL PERFIL COMO TUTOR</p>}

        {selectedEvaluation && <section className="reviewer-workspace">
          <button className="text-button reviewer-back" onClick={() => setSelectedEvaluation(null)} type="button">← Volver a mis proyectos</button>
          <div className="reviewer-workspace-heading"><div><span className="tutor-code">{selectedEvaluation.code}</span><h2>Evaluación final del tutor</h2><p>{selectedEvaluation.title}</p></div></div>
          <section className="reviewer-form-card review-matrix-card">
            <div className="admin-operation-heading"><Icon name="clipboard" /><div><p>{selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PUBLICO' ? 'FORMULARIO 4' : selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PRIVADO' ? 'FORMULARIO 3' : 'FORMULARIO 2'}</p><h2>{selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PUBLICO' ? 'Ratificación antes de defensa pública' : selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PRIVADO' ? 'Revisión antes de defensa privada' : 'Formato, forma y fondo'}</h2></div></div>
            {selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PUBLICO' ? <section className="review-matrix"><h3>Ratificación para defensa pública <b>*</b></h3><p>Habiéndose verificado las correcciones sugeridas en la defensa privada, ¿el postulante está facultado para ingresar a defensa pública?</p><div className="matrix-row"><span>Dictamen</span><div>{(['SI', 'NO', 'PARCIALMENTE'] as const).map((value) => <label key={value}><input checked={publicRatification === value} disabled={isSubmitting} name="tutor-public-ratification" onChange={() => setPublicRatification(value)} type="radio" />{value === 'SI' ? 'Sí' : value === 'NO' ? 'No' : 'Parcialmente'}</label>)}</div></div></section> : <>{selectedEvaluation.reviewDocumentType !== 'DOCUMENTO_PRIVADO' && <section className="review-matrix"><h3>Formato y forma <b>*</b></h3>{formatCriteria.map(([code, label]) => <div className="matrix-row" key={code}><span>{label}</span><div>{(['SI', 'NO'] as const).map((value) => <label key={value}><input checked={formatRatings[code] === value} disabled={isSubmitting} name={`tutor-format-${code}`} onChange={() => setFormatRatings((current) => ({ ...current, [code]: value }))} type="radio" />{value === 'SI' ? 'Sí' : 'No'}</label>)}</div></div>)}</section>}<section className="review-matrix"><h3>Observaciones de fondo <b>*</b></h3>{(selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PRIVADO' ? privateDefenseCriteria : backgroundCriteria).map(([code, label]) => <div className="matrix-row" key={code}><span>{label}</span><div>{(['MALO', 'REGULAR', 'BUENO'] as const).map((value) => <label key={value}><input checked={backgroundRatings[code] === value} disabled={isSubmitting} name={`tutor-background-${code}`} onChange={() => setBackgroundRatings((current) => ({ ...current, [code]: value }))} type="radio" />{value[0]}{value.slice(1).toLowerCase()}</label>)}</div></div>)}</section></>}
            <label className="form-field"><span>Observaciones</span><textarea disabled={isSubmitting} onChange={(event) => setEvaluationObservations(event.target.value)} placeholder="Una observación por línea si devuelves el documento." rows={4} value={evaluationObservations} /></label>
            <div className="reviewer-decision-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => void submitEvaluation(selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PUBLICO' ? (publicRatification === 'SI' ? 'APROBADO' : 'OBSERVADO') : 'APROBADO')} type="button"><Icon name="check" />{selectedEvaluation.reviewDocumentType === 'DOCUMENTO_PUBLICO' ? 'Guardar ratificación' : 'Aprobar sin observaciones'}</button>{selectedEvaluation.reviewDocumentType !== 'DOCUMENTO_PUBLICO' && <button className="primary-button reviewer-observe-button" disabled={isSubmitting} onClick={() => void submitEvaluation('OBSERVADO')} type="button">Devolver con observaciones <Icon name="arrow" /></button>}</div>
          </section>
        </section>}

        {!selectedEvaluation && view === 'home' && <>
          <section className="tutor-stats"><div><small>Invitaciones pendientes</small><strong>{data.invitations.length}</strong><span>Requieren tu respuesta.</span></div><div><small>Proyectos asignados</small><strong>{data.projects.length}</strong><span>Tutorías confirmadas.</span></div><div><small>Notificaciones</small><strong>{data.unreadCount}</strong><span>Actualizaciones sin leer.</span></div></section>
          {data.invitations.length > 0 ? <section className="tutor-section"><div className="tutor-section-heading"><div><h2>Invitaciones pendientes</h2><p>Confirma si puedes acompañar cada propuesta.</p></div><button className="text-button" onClick={() => setView('invitations')} type="button">Ver todas</button></div><div className="tutor-cards">{data.invitations.slice(0, 2).map(invitationCard)}</div></section> : <section className="tutor-empty"><Icon name="check" /><strong>No tienes invitaciones pendientes.</strong><span>Las nuevas solicitudes aparecerán aquí y en la campanita.</span></section>}
          {data.projects.length > 0 && <section className="tutor-section"><div className="tutor-section-heading"><div><h2>Proyectos que acompañas</h2><p>Consulta rápidamente el avance de tus tutorías confirmadas.</p></div><button className="text-button" onClick={() => setView('projects')} type="button">Ver todos</button></div><div className="tutor-cards">{data.projects.slice(0, 2).map(projectCard)}</div></section>}
        </>}

        {view === 'invitations' && (data.invitations.length > 0 ? <div className="tutor-cards">{data.invitations.map(invitationCard)}</div> : <section className="tutor-empty"><Icon name="check" /><strong>Ya respondiste todas las invitaciones.</strong><span>Las nuevas solicitudes se mostrarán automáticamente en esta sección.</span></section>)}
        {view === 'projects' && (data.projects.length > 0 ? <div className="tutor-cards">{data.projects.map(projectCard)}</div> : <section className="tutor-empty"><Icon name="clipboard" /><strong>Aún no tienes proyectos confirmados.</strong><span>Cuando aceptes una tutoría, el proyecto aparecerá aquí.</span></section>)}
        {view === 'reviewed' && (reviewedProjects.length > 0 ? <div className="tutor-cards">{reviewedProjects.map(projectCard)}</div> : <section className="tutor-empty"><Icon name="check" /><strong>Aún no hay proyectos revisados.</strong><span>Los proyectos aparecerán aquí cuando tutor o revisores emitan un dictamen.</span></section>)}
        {view === 'defenses' && <><div className="defense-tabs"><button className={defenseType === 'PRIVATE' ? 'is-active' : ''} onClick={() => setDefenseType('PRIVATE')} type="button">Defensa privada</button><button className={defenseType === 'PUBLIC' ? 'is-active' : ''} onClick={() => setDefenseType('PUBLIC')} type="button">Defensa pública</button></div>{defenseProjects.length > 0 ? <div className="tutor-cards">{defenseProjects.map(projectCard)}</div> : <section className="tutor-empty"><Icon name="file" /><strong>No tienes documentos para esta defensa.</strong><span>Las entregas del estudiante aparecerán aquí para su revisión.</span></section>}</>}
        {view === 'notifications' && <section className="notification-list">{notifications.length === 0 ? <div className="tutor-empty"><Icon name="bell" /><strong>No tienes notificaciones.</strong><span>Las solicitudes y avisos del proceso aparecerán aquí.</span></div> : notifications.map((notification) => <article className={`${notification.readAt ? 'notification-item' : 'notification-item is-unread'} role-${notification.role.toLowerCase()}`} key={notification.id}><div className="notification-icon"><Icon name="bell" /></div><div><span className={`notification-role-badge role-${notification.role.toLowerCase()}`}>{roleLabel(notification.role)}</span><strong>{notification.title}</strong><p>{notification.message}</p><small>{formatDate(notification.createdAt)}</small></div>{!notification.readAt && <button className="text-button" onClick={() => void markRead(notification.id)} type="button">Marcar como leída</button>}</article>)}</section>}
      </div>
    </section>
  </main>
}

function ReviewerPortal({ data, notifications, onLogout, onRefresh, sessionActions, navigationTarget, onNavigationHandled }: { data: ReviewerDashboard; notifications: AppNotification[]; onLogout: () => Promise<void>; onRefresh: () => Promise<void>; sessionActions: ReactNode; navigationTarget: NotificationDestination | null; onNavigationHandled: () => void }) {
  const [view, setView] = useState<'home' | 'pending' | 'completed' | 'defenses' | 'notifications'>('home')
  const [defenseType, setDefenseType] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE')
  const [selectedReview, setSelectedReview] = useState<ReviewerReview | null>(null)
  const [generalComment, setGeneralComment] = useState('')
  const [observationDrafts, setObservationDrafts] = useState<string[]>([''])
  const [formatRatings, setFormatRatings] = useState<Record<string, string>>({})
  const [backgroundRatings, setBackgroundRatings] = useState<Record<string, string>>({})
  const [publicRatification, setPublicRatification] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (navigationTarget === '/revisor/pendientes') {
      closeReview()
      setView('pending')
      onNavigationHandled()
    }
    if (navigationTarget === '/revisor/completados') {
      closeReview()
      setView('completed')
      onNavigationHandled()
    }
    if (navigationTarget === '/revisor/defensas-privada' || navigationTarget === '/revisor/defensas-publica') {
      closeReview()
      setDefenseType(navigationTarget === '/revisor/defensas-privada' ? 'PRIVATE' : 'PUBLIC')
      setView('defenses')
      onNavigationHandled()
    }
    if (navigationTarget === '/revisor') {
      closeReview()
      setView('home')
      onNavigationHandled()
    }
  }, [navigationTarget, onNavigationHandled])

  function openReview(review: ReviewerReview) {
    setSelectedReview(review)
    setGeneralComment('')
    setObservationDrafts([''])
    setFormatRatings({})
    setBackgroundRatings({})
    setPublicRatification('')
    setMessage('')
  }

  function closeReview() {
    setSelectedReview(null)
    setGeneralComment('')
    setObservationDrafts([''])
    setFormatRatings({})
    setBackgroundRatings({})
    setPublicRatification('')
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
    const isPrivateDefense = selectedReview.profile.type === 'DOCUMENTO_PRIVADO'
    const isPublicDefense = selectedReview.profile.type === 'DOCUMENTO_PUBLICO'
    const selectedFormat = isPrivateDefense || isPublicDefense ? [] : formatCriteria.map(([code]) => ({ code, value: formatRatings[code] ?? '' }))
    const selectedBackground = isPublicDefense ? [] : (isPrivateDefense ? privateDefenseCriteria : backgroundCriteria).map(([code]) => ({ code, value: backgroundRatings[code] ?? '' }))
    if (selectedFormat.some((item) => !item.value) || selectedBackground.some((item) => !item.value) || (isPublicDefense && !publicRatification)) {
      setMessage(isPublicDefense ? 'Selecciona la ratificación para defensa pública.' : 'Completa todos los criterios de formato y de fondo antes de emitir el dictamen.')
      return
    }
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
        body: JSON.stringify({ decision, generalComment: generalComment.trim(), observations, formatCriteria: selectedFormat, backgroundCriteria: selectedBackground, publicRatification }),
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
    const isObserved = review.decision === 'OBSERVADO'
    return <article className="reviewer-card" key={review.id}>
      <div className="reviewer-card-top"><div><span className="tutor-code">{review.code}</span><span className="reviewer-round">Ronda {review.roundNumber} · {review.assignmentType === 'REVISOR_1' ? 'Revisor 1' : 'Revisor 2'}</span></div><span className={`reviewer-decision decision-${review.decision.toLowerCase()}`}>{decisionLabel(review.decision)}</span></div>
      <h2>{review.title}</h2>
      <p className="tutor-card-description">{review.description}</p>
      <ReviewProgress reviews={review.teamReviews} />
      <div className="tutor-project-meta"><span><Icon name="user" />{review.students}</span><span><Icon name="clipboard" />{review.modality}</span><span><Icon name="check" />{review.phase} · {review.status}</span></div>
      <DefenseScheduleStatus defenses={review.defenses} />
      <div className="reviewer-card-info"><div><small>Revisión habilitada</small><strong>{formatDate(review.requestedAt)}</strong></div><div><small>Perfil asignado</small><a className="document-download reviewer-document-link" href={`/api/reviewer/documents/${review.profile.documentId}/download?version=${review.profile.versionId}`}><Icon name="download" />V{review.profile.version} · Descargar</a></div></div>
      {review.decision !== 'PENDIENTE' && <div className={isObserved ? 'reviewer-result is-observed' : 'reviewer-result'}><strong>{isObserved ? `${review.observations.length} observación${review.observations.length === 1 ? '' : 'es'} registrada${review.observations.length === 1 ? '' : 's'}` : 'Dictamen emitido sin observaciones'}</strong>{review.generalComment && <p>{review.generalComment}</p>}</div>}
      {showAction && review.canSubmit && <div className="tutor-actions"><button className="primary-button" onClick={() => openReview(review)} type="button"><Icon name="clipboard" />{review.profile.type === 'DOCUMENTO_PUBLICO' ? 'Evaluar defensa pública' : review.profile.type === 'DOCUMENTO_PRIVADO' ? 'Evaluar defensa privada' : 'Revisar perfil'}</button></div>}
    </article>
  }

  function defenseProjectCard(project: ReviewerDashboard['defenseProjects'][number]) {
    return <article className="reviewer-card reviewer-defense-card" key={project.projectId}>
      <div className="reviewer-card-top"><span className="tutor-code">{project.code}</span><span className="reviewer-decision decision-pendiente">Defensa</span></div>
      <h2>{project.title}</h2>
      <div className="tutor-project-meta"><span><Icon name="user" />{project.students}</span><span><Icon name="check" />{project.phase} · {project.status}</span></div>
      <DefenseScheduleStatus defenses={project.defenses} />
    </article>
  }

  const defenseReviews = [...data.pendingReviews, ...data.completedReviews].filter((review) => defenseType === 'PRIVATE' ? review.profile.type === 'DOCUMENTO_PRIVADO' : review.profile.type === 'DOCUMENTO_PUBLICO')
  const scheduleProjects = data.defenseProjects.filter((project) => defenseType === 'PRIVATE' ? project.defenses.private.available : project.defenses.public.available)
  const reviewedProjectIds = new Set(defenseReviews.map((review) => review.projectId))
  const scheduleOnlyProjects = scheduleProjects.filter((project) => !reviewedProjectIds.has(project.projectId))
  const heading = selectedReview ? 'Emitir dictamen' : view === 'home' ? 'Inicio' : view === 'pending' ? 'Revisiones pendientes' : view === 'completed' ? 'Proyectos revisados' : view === 'defenses' ? 'Defensas' : 'Notificaciones'
  const copy = selectedReview
    ? 'Revisa el perfil asignado y registra un dictamen definitivo para esta ronda.'
    : view === 'home'
      ? 'Organiza tus revisiones de perfil y mantente al tanto de las solicitudes pendientes.'
      : view === 'pending'
        ? 'Cada perfil pendiente requiere tu dictamen.'
      : view === 'completed'
        ? 'Consulta el estado de los proyectos que revisaste y los dictámenes pendientes de tus compañeros.'
          : 'Mantente al tanto de las asignaciones y cambios de tus revisiones.'

  return <main className="student-page reviewer-page">
    <aside className="student-sidebar reviewer-sidebar">
      <div>
        <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
        <p className="student-role">PORTAL DEL REVISOR</p>
        <nav aria-label="Navegación del revisor" className="student-nav">
          <button className={!selectedReview && view === 'home' ? 'is-active' : ''} onClick={() => { closeReview(); setView('home') }} type="button"><Icon name="dashboard" /><span>Inicio</span></button>
          <button className={!selectedReview && view === 'pending' ? 'is-active' : ''} onClick={() => { closeReview(); setView('pending') }} type="button"><Icon name="clipboard" /><span>Por revisar</span>{data.summary.pending > 0 && <b className="nav-count">{data.summary.pending}</b>}</button>
          <button className={!selectedReview && view === 'completed' ? 'is-active' : ''} onClick={() => { closeReview(); setView('completed') }} type="button"><Icon name="check" /><span>Proyectos revisados</span></button>
          <button className={!selectedReview && view === 'defenses' ? 'is-active' : ''} onClick={() => { closeReview(); setView('defenses') }} type="button"><Icon name="file" /><span>Defensas</span></button>
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
          <section className="reviewer-project-context"><div><small>Estudiante(s)</small><strong>{selectedReview.students}</strong><span>{selectedReview.registrations}</span></div><div><small>Objetivo general</small><p>{selectedReview.generalObjective}</p></div><div><small>Revisión habilitada</small><strong>{formatDate(selectedReview.requestedAt)}</strong></div></section>
          <section className="reviewer-document-panel"><div><Icon name="file" /><div><small>Documento para revisar</small><strong>{selectedReview.profile.filename}</strong><span>Versión {selectedReview.profile.version} subida el {formatDate(selectedReview.profile.uploadedAt)}</span></div></div><a className="primary-button" href={`/api/reviewer/documents/${selectedReview.profile.documentId}/download?version=${selectedReview.profile.versionId}`}><Icon name="download" />Descargar perfil</a></section>
          <section className="reviewer-form-card review-matrix-card"><div className="admin-operation-heading"><Icon name="clipboard" /><div><p>{selectedReview.profile.type === 'DOCUMENTO_PRIVADO' ? 'FORMULARIO 3' : 'FORMULARIO 2'}</p><h2>{selectedReview.profile.type === 'DOCUMENTO_PRIVADO' ? 'Revisión antes de defensa privada' : 'Formato, forma y fondo'}</h2></div></div><p>Completa los criterios establecidos antes de emitir tu dictamen.</p>{selectedReview.profile.type !== 'DOCUMENTO_PRIVADO' && <section className="review-matrix"><h3>Formato y forma <b>*</b></h3>{formatCriteria.map(([code, label]) => <div className="matrix-row" key={code}><span>{label}</span><div>{(['SI', 'NO'] as const).map((value) => <label key={value}><input checked={formatRatings[code] === value} disabled={isSubmitting} name={`format-${code}`} onChange={() => setFormatRatings((current) => ({ ...current, [code]: value }))} type="radio" value={value} />{value === 'SI' ? 'Sí' : 'No'}</label>)}</div></div>)}</section>}<section className="review-matrix"><h3>Observaciones de fondo <b>*</b></h3>{(selectedReview.profile.type === 'DOCUMENTO_PRIVADO' ? privateDefenseCriteria : backgroundCriteria).map(([code, label]) => <div className="matrix-row" key={code}><span>{label}</span><div>{(['MALO', 'REGULAR', 'BUENO'] as const).map((value) => <label key={value}><input checked={backgroundRatings[code] === value} disabled={isSubmitting} name={`background-${code}`} onChange={() => setBackgroundRatings((current) => ({ ...current, [code]: value }))} type="radio" value={value} />{value[0]}{value.slice(1).toLowerCase()}</label>)}</div></div>)}</section></section>
          <section className="reviewer-form-card"><div className="admin-operation-heading"><Icon name="clipboard" /><div><p>DICTAMEN DE REVISIÓN</p><h2>Registra tu evaluación</h2></div></div><p>Tu dictamen no podrá modificarse después de guardarlo. La ronda se cerrará cuando ambos revisores hayan respondido.</p><label className="form-field"><span>Comentario general</span><textarea disabled={isSubmitting} onChange={(event) => setGeneralComment(event.target.value)} placeholder="Resume los aspectos principales de tu revisión." rows={3} value={generalComment} /></label><div className="reviewer-observations"><div><strong>Observaciones puntuales</strong><small>Son obligatorias solo si devuelves el perfil.</small></div>{observationDrafts.map((observation, index) => <div className="reviewer-observation-row" key={index}><span>{index + 1}</span><textarea aria-label={`Observación ${index + 1}`} disabled={isSubmitting} onChange={(event) => updateObservation(index, event.target.value)} placeholder="Indica con claridad qué debe corregirse." rows={2} value={observation} />{observationDrafts.length > 1 && <button aria-label={`Eliminar observación ${index + 1}`} className="icon-button" disabled={isSubmitting} onClick={() => removeObservation(index)} type="button"><Icon name="trash" /></button>}</div>)}<button className="text-button" disabled={isSubmitting || observationDrafts.length >= 20} onClick={() => setObservationDrafts((current) => [...current, ''])} type="button"><Icon name="plus" />Añadir observación</button></div><div className="reviewer-decision-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => void submitDecision('APROBADO')} type="button"><Icon name="check" />Aprobar perfil</button><button className="primary-button reviewer-observe-button" disabled={isSubmitting} onClick={() => void submitDecision('OBSERVADO')} type="button">{isSubmitting ? 'Guardando…' : 'Devolver con observaciones'} <Icon name="arrow" /></button></div></section>
        </section>}

        {selectedReview?.profile.type === 'DOCUMENTO_PUBLICO' && <section className="reviewer-form-card public-defense-ratification"><div className="admin-operation-heading"><Icon name="clipboard" /><div><p>FORMULARIO 4</p><h2>Ratificación para defensa pública</h2></div></div><p>Habiéndose verificado las correcciones sugeridas en la defensa privada, indica si el postulante está facultado para ingresar a defensa pública.</p><div className="review-matrix"><h3>Ratificación <b>*</b></h3><div className="matrix-row"><span>Dictamen</span><div>{(['SI', 'NO', 'PARCIALMENTE'] as const).map((value) => <label key={value}><input checked={publicRatification === value} disabled={isSubmitting} name="reviewer-public-ratification" onChange={() => setPublicRatification(value)} type="radio" />{value === 'SI' ? 'Sí' : value === 'NO' ? 'No' : 'Parcialmente'}</label>)}</div></div></div><label className="form-field"><span>Observación de devolución</span><textarea disabled={isSubmitting} onChange={(event) => updateObservation(0, event.target.value)} placeholder="Obligatoria si marcas No o Parcialmente." rows={3} value={observationDrafts[0] ?? ''} /></label><button className="primary-button" disabled={isSubmitting} onClick={() => void submitDecision(publicRatification === 'SI' ? 'APROBADO' : 'OBSERVADO')} type="button">{isSubmitting ? 'Guardando…' : 'Guardar ratificación'} <Icon name="arrow" /></button></section>}
        {!selectedReview && view === 'home' && <>
          <section className="tutor-stats reviewer-stats"><div><small>Revisiones pendientes</small><strong>{data.summary.pending}</strong><span>Requieren tu dictamen.</span></div><div><small>Dictámenes emitidos</small><strong>{data.summary.completed}</strong><span>Historial de tus revisiones.</span></div></section>
          {data.pendingReviews.length > 0 ? <section className="tutor-section"><div className="tutor-section-heading"><div><h2>Revisiones pendientes</h2><p>Descarga el perfil y registra tu dictamen.</p></div><button className="text-button" onClick={() => setView('pending')} type="button">Ver todas</button></div><div className="tutor-cards">{data.pendingReviews.slice(0, 2).map((review) => reviewCard(review))}</div></section> : <section className="tutor-empty"><Icon name="check" /><strong>No tienes revisiones pendientes.</strong><span>Las nuevas asignaciones aparecerán aquí y en la campanita.</span></section>}
        </>}
        {!selectedReview && view === 'pending' && (data.pendingReviews.length > 0 ? <div className="tutor-cards">{data.pendingReviews.map((review) => reviewCard(review))}</div> : <section className="tutor-empty"><Icon name="check" /><strong>No tienes revisiones pendientes.</strong><span>Las nuevas asignaciones aparecerán automáticamente en esta sección.</span></section>)}
        {!selectedReview && view === 'completed' && (data.completedReviews.length > 0 ? <div className="tutor-cards">{data.completedReviews.map((review) => reviewCard(review, false))}</div> : <section className="tutor-empty"><Icon name="clipboard" /><strong>Aún no emitiste dictámenes.</strong><span>Cuando finalices una revisión aparecerá en este historial.</span></section>)}
        {!selectedReview && view === 'defenses' && <><div className="defense-tabs"><button className={defenseType === 'PRIVATE' ? 'is-active' : ''} onClick={() => setDefenseType('PRIVATE')} type="button">Defensa privada</button><button className={defenseType === 'PUBLIC' ? 'is-active' : ''} onClick={() => setDefenseType('PUBLIC')} type="button">Defensa pública</button></div>{scheduleOnlyProjects.length > 0 && <div className="tutor-cards">{scheduleOnlyProjects.map(defenseProjectCard)}</div>}{defenseReviews.length > 0 ? <div className="tutor-cards">{defenseReviews.map((review) => reviewCard(review, review.canSubmit))}</div> : scheduleOnlyProjects.length === 0 && <section className="tutor-empty"><Icon name="file" /><strong>No tienes proyectos en esta defensa.</strong><span>La programación y los documentos aparecerán aquí.</span></section>}</>}
        {!selectedReview && view === 'notifications' && <section className="notification-list">{notifications.length === 0 ? <div className="tutor-empty"><Icon name="bell" /><strong>No tienes notificaciones.</strong><span>Las asignaciones y cambios del proceso aparecerán aquí.</span></div> : notifications.map((notification) => <article className={`${notification.readAt ? 'notification-item' : 'notification-item is-unread'} role-${notification.role.toLowerCase()}`} key={notification.id}><div className="notification-icon"><Icon name="bell" /></div><div><span className={`notification-role-badge role-${notification.role.toLowerCase()}`}>{roleLabel(notification.role)}</span><strong>{notification.title}</strong><p>{notification.message}</p><small>{formatDate(notification.createdAt)}</small></div>{!notification.readAt && <button className="text-button" onClick={() => void markRead(notification.id)} type="button">Marcar como leída</button>}</article>)}</section>}
      </div>
    </section>
  </main>
}

function AdminProjectWorkspace({ projectId, user, onBack, onLogout, onRefresh, sessionActions }: { projectId: string; user: AdministratorUser; onBack: () => void; onLogout: () => Promise<void>; onRefresh: () => Promise<void>; sessionActions: ReactNode }) {
  const [detail, setDetail] = useState<AdminProjectDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [tutorId, setTutorId] = useState('')
  const [reviewer1Id, setReviewer1Id] = useState('')
  const [reviewer2Id, setReviewer2Id] = useState('')
  const [profileVersionId, setProfileVersionId] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [cancelDetail, setCancelDetail] = useState('')

  async function loadDetail() {
    setIsLoading(true)
    try {
      const payload = await api<AdminProjectDetail>(`/api/admin/projects/${projectId}`)
      setDetail(payload)
      setTutorId(payload.assignments.find((item) => item.type === 'TUTOR')?.teacherId ?? '')
      setReviewer1Id(payload.assignments.find((item) => item.type === 'REVISOR_1')?.teacherId ?? '')
      setReviewer2Id(payload.assignments.find((item) => item.type === 'REVISOR_2')?.teacherId ?? '')
      setProfileVersionId(payload.profiles[0]?.versionId ?? '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar el proyecto.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadDetail() }, [projectId])

  async function submitTutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}/assignments`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tutorId }) })
      setMessage(result.message)
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible enviar la invitación al tutor.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}/reviewers`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewer1Id, reviewer2Id }) })
      setMessage(result.message)
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar los responsables.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function startReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}/review-rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: profileVersionId }) })
      setMessage(result.message)
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar la revisión.')
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

  async function closeProject() {
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${projectId}/close`, { method: 'POST' })
      setMessage(result.message)
      await onRefresh()
      await loadDetail()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cerrar el proyecto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const tutors = detail?.staff.filter((item) => item.roles.includes('TUTOR')) ?? []
  const reviewers = detail?.staff.filter((item) => item.roles.includes('REVISOR')) ?? []
  const isCancelled = detail?.project.statusCode === 'ANULADO'
  const isFinalized = detail?.project.statusCode === 'FINALIZADO'
  const tutorAssignment = detail?.assignments.find((item) => item.type === 'TUTOR')
  const pendingTutorReplacement = detail?.assignments.find((item) => item.type === 'TUTOR' && !item.active && !item.finishedAt)
  const tutorConfirmed = Boolean(tutorAssignment?.active && tutorAssignment.respondedAt && !tutorAssignment.finishedAt)
  const assignedReviewers = detail?.assignments.filter((item) => item.type === 'REVISOR_1' || item.type === 'REVISOR_2').filter((item) => item.active && !item.finishedAt) ?? []
  const hasOpenRound = Boolean(detail?.rounds.some((round) => !round.closedAt))
  const firstReviewReady = Boolean(tutorConfirmed && assignedReviewers.length === 2 && !hasOpenRound && detail?.rounds.length === 0)
  const isClosed = isCancelled || isFinalized

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
        <section className="admin-operation-card admin-project-proposal"><div className="admin-operation-heading"><Icon name="file" /><div><p>PROPUESTA DEL ESTUDIANTE</p><h2>Datos registrados en el Formulario 1</h2></div></div><p>Estos datos son informativos y no pueden ser modificados desde Administración.</p><div className="admin-proposal-data"><div><small>Título tentativo</small><strong>{detail.project.title}</strong></div><div><small>Descripción de la propuesta</small><p>{detail.project.description}</p></div><div><small>Objetivo general</small><p>{detail.project.generalObjective}</p></div></div><div className="admin-profile-downloads"><div><small>Perfil del proyecto</small><strong>{detail.profiles.length > 0 ? `${detail.profiles.length} versión${detail.profiles.length === 1 ? '' : 'es'} registrada${detail.profiles.length === 1 ? '' : 's'}` : 'Sin perfil adjunto'}</strong></div>{detail.profiles.map((profile) => <a className="document-download admin-document-link" href={`/api/admin/documents/${profile.documentId}/download?versionId=${profile.versionId}`} key={profile.versionId}><Icon name="download" />Perfil V{profile.version}</a>)}</div></section>

        {!isClosed && <div className="admin-operation-grid">
          <form className="admin-operation-card" onSubmit={(event) => void submitTutor(event)}><div className="admin-operation-heading"><Icon name="user" /><div><p>PASO 1 · TUTORÍA</p><h2>Tutor propuesto</h2></div></div><p>El estudiante propone un tutor al registrar su proyecto. Durante una ronda abierta, el tutor actual conserva su evaluación pendiente hasta que el reemplazo acepte.</p><label className="form-field"><span>Tutor <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setTutorId(event.target.value)} value={tutorId}><option value="">Selecciona un tutor</option>{tutors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className={tutorConfirmed ? 'admin-assignment-state is-confirmed' : 'admin-assignment-state'}>{pendingTutorReplacement ? `${pendingTutorReplacement.teacher} debe aceptar el reemplazo; ${tutorAssignment?.teacher} conserva la ronda actual.` : tutorConfirmed ? `Tutor confirmado: ${tutorAssignment?.teacher}` : tutorAssignment ? `Esperando respuesta de ${tutorAssignment.teacher}.` : 'Aún no se propuso un tutor.'}</p><button className="secondary-button" disabled={isSubmitting || !tutorId} type="submit">{hasOpenRound && tutorAssignment ? 'Proponer reemplazo del tutor' : tutorAssignment ? 'Cambiar tutor propuesto' : 'Enviar invitación al tutor'}</button></form>
          <form className="admin-operation-card" onSubmit={(event) => void submitAssignments(event)}><div className="admin-operation-heading"><Icon name="clipboard" /><div><p>PASO 2 · EQUIPO EVALUADOR</p><h2>Asignar revisores</h2></div></div><p>{hasOpenRound ? 'La ronda está en curso. Si reemplazas a un revisor que aún no emitió dictamen, su evaluación pendiente se transferirá al nuevo revisor.' : tutorConfirmed ? 'El tutor aceptó la invitación. Define Revisor 1 y Revisor 2; el tutor recibirá una notificación cuando el equipo quede asignado.' : 'La asignación se habilitará cuando el tutor propuesto acepte la invitación.'}</p><label className="form-field"><span>Revisor 1 <b>*</b></span><select disabled={isSubmitting || !tutorConfirmed} onChange={(event) => setReviewer1Id(event.target.value)} value={reviewer1Id}><option value="">Selecciona al Revisor 1</option>{reviewers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>Revisor 2 <b>*</b></span><select disabled={isSubmitting || !tutorConfirmed} onChange={(event) => setReviewer2Id(event.target.value)} value={reviewer2Id}><option value="">Selecciona al Revisor 2</option>{reviewers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="primary-button" disabled={isSubmitting || !tutorConfirmed || !reviewer1Id || !reviewer2Id} type="submit">{hasOpenRound ? 'Guardar cambios y reasignar pendientes' : 'Guardar equipo evaluador'}</button></form>
          {detail.rounds.length === 0 && <form className="admin-operation-card" onSubmit={(event) => void startReview(event)}><div className="admin-operation-heading"><Icon name="file" /><div><p>PASO 3 · INICIO DE REVISIÓN</p><h2>Habilitar primera revisión</h2></div></div><p>{firstReviewReady ? 'Selecciona la versión del perfil para habilitarla al tutor y a los dos revisores. Si siguen pendientes, recibirán recordatorios desde el segundo día.' : 'Esta acción se habilita cuando el tutor haya aceptado, estén asignados los dos revisores y no exista una ronda abierta.'}</p><label className="form-field"><span>Versión del perfil <b>*</b></span><select disabled={isSubmitting || detail.profiles.length === 0} onChange={(event) => setProfileVersionId(event.target.value)} value={profileVersionId}><option value="">Selecciona una versión</option>{detail.profiles.map((item) => <option key={item.versionId} value={item.versionId}>V{item.version} · {item.filename}</option>)}</select></label><button className="primary-button" disabled={isSubmitting || !firstReviewReady || detail.profiles.length === 0 || !profileVersionId} type="submit">Habilitar revisión</button></form>}
        </div>}


        <section className="admin-operation-card admin-round-history"><div className="admin-operation-heading"><Icon name="clipboard" /><div><p>SEGUIMIENTO</p><h2>Rondas de revisión</h2></div></div>{detail.rounds.length === 0 ? <p className="admin-empty-copy">Aún no se habilitó una ronda de revisión para el perfil.</p> : <div className="admin-round-list">{detail.rounds.map((round) => <article className={round.closedAt ? 'admin-round is-closed' : 'admin-round'} key={round.id}><div><strong>Ronda {round.number} · Perfil V{round.version}</strong><span>Habilitada: {formatDate(round.requestedAt)}</span></div><div className="admin-reviewers">{round.reviews.map((review) => <span key={review.id}><b>{review.assignmentType === 'TUTOR' ? 'T' : review.assignmentType === 'REVISOR_1' ? 'R1' : 'R2'}</b>{review.reviewer}: {review.decision}{review.openObservations > 0 ? ` · ${review.openObservations} observación(es)` : ''}</span>)}</div></article>)}</div>}</section>

        {!isClosed && <section className="admin-operation-card admin-close-card"><div className="admin-operation-heading"><Icon name="check" /><div><p>CIERRE ACADÉMICO</p><h2>Cerrar proyecto</h2></div></div><p>{detail.closure.eligible ? `La ronda pública ${detail.closure.roundNumber ?? ''} fue aprobada por tutor, Revisor 1 y Revisor 2. El proyecto está listo para finalizar.` : detail.closure.reason}</p><button className="primary-button" disabled={isSubmitting || !detail.closure.eligible} onClick={() => void closeProject()} type="button">Cerrar proyecto</button></section>}

        {isFinalized ? <section className="admin-cancellation admin-finalization"><Icon name="check" /><div><h2>Proyecto finalizado</h2><p>La defensa pública fue aprobada y Administración cerró el proceso académico.</p><small>La línea de progreso quedó completada en la fase de cierre.</small></div></section> : isCancelled ? <section className="admin-cancellation"><Icon name="trash" /><div><h2>Proyecto anulado</h2><p><strong>{detail.cancellation?.reason}</strong> · {detail.cancellation?.detail}</p><small>{detail.cancellation?.cancelledAt && formatDate(detail.cancellation.cancelledAt)}</small></div></section> : <div className="admin-operation-grid admin-secondary-grid admin-cancel-only"><form className="admin-operation-card admin-cancel-card" onSubmit={(event) => void cancelProject(event)}><div className="admin-operation-heading"><Icon name="trash" /><div><p>ACCIÓN CONTROLADA</p><h2>Anular proyecto</h2></div></div><p>Esta acción cierra asignaciones y rondas abiertas, y conserva el registro de anulación.</p><label className="form-field"><span>Motivo <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ej.: Abandono del proyecto" value={cancelReason} /></label><label className="form-field"><span>Detalle <b>*</b></span><textarea disabled={isSubmitting} onChange={(event) => setCancelDetail(event.target.value)} placeholder="Explica la situación para el historial académico." rows={3} value={cancelDetail} /></label><button className="danger-button" disabled={isSubmitting} type="submit">Anular proyecto</button></form></div>}
      </>}
    </div></section>
  </main>
}

function AdminDefensesPanel({ kind, onRefresh }: { kind: 'PRIVATE' | 'PUBLIC'; onRefresh: () => Promise<void> }) {
  const [projects, setProjects] = useState<AdminDefenseProject[]>([])
  const [filter, setFilter] = useState<'ALL' | 'SCHEDULED' | 'PENDING'>('ALL')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [form, setForm] = useState({ date: '', time: '', location: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const defenseLabel = kind === 'PRIVATE' ? 'privada' : 'pública'
  const sectionLabel = kind === 'PRIVATE' ? 'Defensas privadas' : 'Defensas públicas'

  async function loadDefenses() {
    setIsLoading(true)
    try {
      const payload = await api<AdminDefensesResponse>(`/api/admin/defenses/${kind}`)
      setProjects(payload.projects)
      setSelectedProjectId((current) => payload.projects.some((item) => item.projectId === current) ? current : '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar las defensas.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadDefenses() }, [kind])

  const selected = projects.find((project) => project.projectId === selectedProjectId) ?? null
  useEffect(() => {
    if (!selected) return
    const parts = defenseInputParts(selected.scheduledAt)
    setForm({ ...parts, location: selected.location ?? '' })
  }, [selected?.projectId, selected?.scheduledAt, selected?.location])

  useEffect(() => {
    if (!selected) return
    const previousOverflow = document.body.style.overflow
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) setSelectedProjectId('')
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeWithEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeWithEscape)
    }
  }, [selected, isSubmitting])

  const visibleProjects = projects.filter((project) => filter === 'ALL' || (filter === 'SCHEDULED' ? Boolean(project.scheduledAt) : !project.scheduledAt))

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>(`/api/admin/projects/${selected.projectId}/defense-schedules/${kind}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      setMessage(result.message)
      await Promise.all([loadDefenses(), onRefresh()])
      setSelectedProjectId('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar la programación de la defensa.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <>
    <section className="admin-defense-intro"><Icon name="check" /><div><h2>{sectionLabel}</h2><p>Gestiona la fecha, hora y lugar de los proyectos habilitados para defensa {defenseLabel}.</p></div></section>
    {message && <p className="student-message is-visible tutor-message">{message}</p>}
    <section className="admin-defense-filters" aria-label={`Filtros de defensas ${defenseLabel}s`}>
      <button className={filter === 'ALL' ? 'is-active' : ''} onClick={() => setFilter('ALL')} type="button">Todas <b>{projects.length}</b></button>
      <button className={filter === 'SCHEDULED' ? 'is-active' : ''} onClick={() => setFilter('SCHEDULED')} type="button">Con fecha establecida <b>{projects.filter((project) => project.scheduledAt).length}</b></button>
      <button className={filter === 'PENDING' ? 'is-active' : ''} onClick={() => setFilter('PENDING')} type="button">Sin fecha establecida <b>{projects.filter((project) => !project.scheduledAt).length}</b></button>
    </section>
    {isLoading ? <section className="documents-loading">Cargando defensas habilitadas…</section> : visibleProjects.length > 0 ? <div className="admin-defense-list">{visibleProjects.map((project) => <article className={project.scheduledAt ? 'admin-defense-card is-scheduled' : 'admin-defense-card is-pending'} key={project.projectId}>
      <div className="admin-defense-card-main"><div className="admin-project-top"><span className="tutor-code">{project.code}</span><span className="admin-defense-indicator">{project.scheduledAt ? 'Fecha establecida' : 'Fecha pendiente'}</span></div><h2>{project.title}</h2><p>{project.students}</p><div className="admin-defense-meta"><span>{project.phase}</span><span>{project.status}</span></div>{project.scheduledAt ? <div className="admin-defense-date"><strong>{formatDate(project.scheduledAt)}</strong><span>{project.location}</span></div> : <p className="admin-defense-pending">Falta registrar fecha, hora y lugar.</p>}</div>
      <button className="secondary-button" onClick={() => setSelectedProjectId(project.projectId)} type="button">{project.scheduledAt ? 'Gestionar programación' : 'Programar defensa'}</button>
    </article>)}</div> : <section className="tutor-empty"><Icon name="check" /><strong>No hay defensas en este filtro.</strong><span>Los proyectos aparecerán aquí cuando alcancen la fase de defensa {defenseLabel}.</span></section>}
    {selected && <div className="admin-defense-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) setSelectedProjectId('') }}>
      <form aria-labelledby="defense-schedule-dialog-title" aria-modal="true" className="admin-operation-card admin-defense-editor admin-defense-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void saveSchedule(event)} role="dialog">
        <div className="admin-defense-modal-heading">
          <div className="admin-operation-heading"><Icon name="file" /><div><p>PROGRAMACIÓN DE DEFENSA {kind === 'PRIVATE' ? 'PRIVADA' : 'PÚBLICA'}</p><h2 id="defense-schedule-dialog-title">{selected.title}</h2></div></div>
          <button aria-label="Cerrar programación" className="admin-defense-modal-close" disabled={isSubmitting} onClick={() => setSelectedProjectId('')} type="button">×</button>
        </div>
        <p>{selected.scheduledAt ? `Programada actualmente para ${formatDate(selected.scheduledAt)} en ${selected.location}.` : 'Registra la convocatoria y se notificará al estudiante, tutor y revisores activos.'}</p>
        <div className="admin-defense-form-fields"><label className="form-field"><span>Fecha <b>*</b></span><input disabled={isSubmitting || selected.isClosed} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required type="date" value={form.date} /></label><label className="form-field"><span>Hora <b>*</b></span><input disabled={isSubmitting || selected.isClosed} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} required type="time" value={form.time} /></label><label className="form-field"><span>Lugar <b>*</b></span><input disabled={isSubmitting || selected.isClosed} maxLength={500} minLength={3} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Ej.: Auditorio del bloque A" required value={form.location} /></label></div>
        {selected.isClosed ? <p className="admin-empty-copy">El proyecto está cerrado; la programación se conserva solo como consulta.</p> : <div className="tutor-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => setSelectedProjectId('')} type="button">Cancelar</button><button className="primary-button" disabled={isSubmitting} type="submit">{selected.scheduledAt ? 'Guardar cambios' : `Programar defensa ${defenseLabel}`}</button></div>}
      </form>
    </div>}
  </>
}

type AdminUserInput = {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  roles: RoleCode[]
  active: boolean
  careerId: string
  registration: string
  teacherCode: string
  specialty: string
}

function AdminUserForm({ user, roles, careers, onCancel, onSave }: { user: AdminUser | null; roles: { code: RoleCode; name: string }[]; careers: { id: string; code: string; name: string }[]; onCancel: () => void; onSave: (payload: AdminUserInput) => Promise<void> }) {
  const [form, setForm] = useState<AdminUserInput>({
    firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '', phone: user?.phone ?? '', password: '',
    roles: user?.roles ?? ['ESTUDIANTE'], active: user?.active ?? true, careerId: user?.careerId ?? '', registration: user?.registration ?? '', teacherCode: user?.teacherCode ?? '', specialty: user?.specialty ?? '',
  })
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const needsCareer = form.roles.some((role) => ['ESTUDIANTE', 'TUTOR', 'REVISOR'].includes(role))
  const needsStudent = form.roles.includes('ESTUDIANTE')
  const needsTeacher = form.roles.some((role) => role === 'TUTOR' || role === 'REVISOR')

  function toggleRole(role: RoleCode) {
    setForm((current) => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role] }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setIsSubmitting(true)
    try {
      await onSave(form)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar el usuario.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <form className="admin-operation-card admin-user-form" onSubmit={(event) => void submit(event)}>
    <div className="admin-operation-heading"><Icon name="user" /><div><p>{user ? 'EDICIÓN DE USUARIO' : 'NUEVO USUARIO'}</p><h2>{user ? user.fullName : 'Registrar persona'}</h2></div></div>
    <p>{user ? 'Actualiza datos, roles, perfiles académicos, estado y contraseña si corresponde.' : 'Crea un acceso institucional y habilita únicamente los roles necesarios.'}</p>
    <div className="admin-user-form-grid">
      <label className="form-field"><span>Nombres <b>*</b></span><input disabled={isSubmitting} minLength={2} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} required value={form.firstName} /></label>
      <label className="form-field"><span>Apellidos <b>*</b></span><input disabled={isSubmitting} minLength={2} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} required value={form.lastName} /></label>
      <label className="form-field"><span>Correo institucional <b>*</b></span><input disabled={isSubmitting} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required type="email" value={form.email} /></label>
      <label className="form-field"><span>Teléfono</span><input disabled={isSubmitting} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} value={form.phone} /></label>
      <label className="form-field"><span>{user ? 'Nueva contraseña' : 'Contraseña'} {!user && <b>*</b>}</span><input autoComplete="new-password" disabled={isSubmitting} minLength={user ? undefined : 8} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={user ? 'Déjala vacía para conservarla' : 'Mínimo 8 caracteres'} required={!user} type="password" value={form.password} /></label>
      <label className="form-field admin-toggle-field"><span>Estado</span><span className="admin-switch"><input checked={form.active} disabled={isSubmitting || user?.id === undefined} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" />{form.active ? 'Activo' : 'Inactivo'}</span></label>
    </div>
    <fieldset className="admin-role-fields"><legend>Roles <b>*</b></legend><div>{roles.map((role) => <label className={`admin-role-check role-${role.code.toLowerCase()}`} key={role.code}><input checked={form.roles.includes(role.code)} disabled={isSubmitting} onChange={() => toggleRole(role.code)} type="checkbox" /><span>{role.name}</span></label>)}</div></fieldset>
    {needsCareer && <label className="form-field"><span>Carrera <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setForm((current) => ({ ...current, careerId: event.target.value }))} required value={form.careerId}><option value="">Selecciona una carrera</option>{careers.map((career) => <option key={career.id} value={career.id}>{career.name}</option>)}</select></label>}
    {needsStudent && <label className="form-field"><span>Matrícula / registro universitario <b>*</b></span><input disabled={isSubmitting} minLength={4} onChange={(event) => setForm((current) => ({ ...current, registration: event.target.value }))} required value={form.registration} /></label>}
    {needsTeacher && <div className="admin-user-form-grid"><label className="form-field"><span>Código docente <b>*</b></span><input disabled={isSubmitting} minLength={4} onChange={(event) => setForm((current) => ({ ...current, teacherCode: event.target.value }))} required value={form.teacherCode} /></label><label className="form-field"><span>Especialidad</span><input disabled={isSubmitting} onChange={(event) => setForm((current) => ({ ...current, specialty: event.target.value }))} value={form.specialty} /></label></div>}
    {message && <p className="student-message is-visible tutor-message">{message}</p>}
    <div className="tutor-actions"><button className="secondary-button" disabled={isSubmitting} onClick={onCancel} type="button">Cancelar</button><button className="primary-button" disabled={isSubmitting || form.roles.length === 0} type="submit">{isSubmitting ? 'Guardando…' : user ? 'Guardar cambios' : 'Crear usuario'}</button></div>
  </form>
}

function PendingTeacherRoleForm({ teacher, careers, onCancel, onSave }: { teacher: PendingTeacher; careers: { id: string; code: string; name: string }[]; onCancel: () => void; onSave: (payload: { roles: ('TUTOR' | 'REVISOR')[]; careerId: string; teacherCode: string; specialty: string }) => Promise<void> }) {
  const [roles, setRoles] = useState<('TUTOR' | 'REVISOR')[]>([])
  const [careerId, setCareerId] = useState('')
  const [teacherCode, setTeacherCode] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function toggleRole(role: 'TUTOR' | 'REVISOR') {
    setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (roles.length === 0 || !careerId || teacherCode.trim().length < 4) {
      setMessage('Selecciona al menos un rol, la carrera y un código docente de al menos 4 caracteres.')
      return
    }
    setMessage('')
    setIsSubmitting(true)
    try {
      await onSave({ roles, careerId, teacherCode: teacherCode.trim(), specialty: specialty.trim() })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible asignar los roles docentes.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <form className="admin-operation-card admin-pending-teacher-form" onSubmit={(event) => void submit(event)}>
    <div className="admin-operation-heading"><Icon name="user" /><div><p>ASIGNACIÓN DE DOCENTE</p><h2>{teacher.fullName}</h2></div></div>
    <p><strong>{teacher.email}</strong> confirmó su correo institucional. Define los roles que habilitarán su acceso.</p>
    <fieldset className="admin-role-fields"><legend>Roles docentes <b>*</b></legend><div><label className="admin-role-check role-tutor"><input checked={roles.includes('TUTOR')} disabled={isSubmitting} onChange={() => toggleRole('TUTOR')} type="checkbox" /><span>Tutor</span></label><label className="admin-role-check role-revisor"><input checked={roles.includes('REVISOR')} disabled={isSubmitting} onChange={() => toggleRole('REVISOR')} type="checkbox" /><span>Revisor</span></label></div></fieldset>
    <div className="admin-user-form-grid"><label className="form-field"><span>Carrera <b>*</b></span><select disabled={isSubmitting} onChange={(event) => setCareerId(event.target.value)} required value={careerId}><option value="">Selecciona una carrera</option>{careers.map((career) => <option key={career.id} value={career.id}>{career.name}</option>)}</select></label><label className="form-field"><span>Código docente <b>*</b></span><input disabled={isSubmitting} minLength={4} onChange={(event) => setTeacherCode(event.target.value)} required value={teacherCode} /></label></div>
    <label className="form-field"><span>Especialidad</span><input disabled={isSubmitting} onChange={(event) => setSpecialty(event.target.value)} placeholder="Ej.: Ingeniería de software" value={specialty} /></label>
    {message && <p className="student-message is-visible tutor-message">{message}</p>}
    <div className="tutor-actions"><button className="secondary-button" disabled={isSubmitting} onClick={onCancel} type="button">Cancelar</button><button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Asignando…' : 'Asignar roles y habilitar acceso'}</button></div>
  </form>
}

function AdminProjectCreateForm({ catalog, onCancel, onSave }: { catalog: ProjectCatalog; onCancel: () => void; onSave: (body: FormData) => Promise<void> }) {
  const [studentId, setStudentId] = useState('')
  const [managementId, setManagementId] = useState('')
  const [modalityId, setModalityId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [generalObjective, setGeneralObjective] = useState('')
  const [objectives, setObjectives] = useState([''])
  const [profile, setProfile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const student = catalog.students.find((item) => item.id === studentId)
  const managements = catalog.managements.filter((item) => item.careerId === student?.careerId)
  const modalities = catalog.modalities.filter((item) => item.careerId === student?.careerId)

  function chooseStudent(value: string) {
    setStudentId(value)
    setManagementId('')
    setModalityId('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) {
      setMessage('Adjunta el perfil inicial en formato Word para crear el proyecto.')
      return
    }
    setMessage('')
    setIsSubmitting(true)
    try {
      const body = new FormData()
      body.append('studentId', studentId)
      body.append('managementId', managementId)
      body.append('modalityId', modalityId)
      body.append('title', title)
      body.append('description', description)
      body.append('generalObjective', generalObjective)
      body.append('objectives', JSON.stringify(objectives))
      body.append('profile', profile)
      await onSave(body)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible registrar el proyecto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <form className="admin-operation-card admin-project-create" onSubmit={(event) => void submit(event)}>
    <div className="admin-operation-heading"><Icon name="plus" /><div><p>NUEVO PROYECTO</p><h2>Registro administrativo</h2></div></div>
    <p>Registra un proyecto con su perfil inicial y estudiante principal. Luego podrás asignar tutor y revisores desde su ficha.</p>
    <label className="form-field"><span>Estudiante principal <b>*</b></span><select disabled={isSubmitting} onChange={(event) => chooseStudent(event.target.value)} required value={studentId}><option value="">Selecciona un estudiante sin proyecto activo</option>{catalog.students.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.registration} · {item.career}</option>)}</select></label>
    <div className="admin-user-form-grid"><label className="form-field"><span>Gestión <b>*</b></span><select disabled={isSubmitting || !student} onChange={(event) => setManagementId(event.target.value)} required value={managementId}><option value="">Selecciona una gestión</option>{managements.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>Modalidad <b>*</b></span><select disabled={isSubmitting || !student} onChange={(event) => setModalityId(event.target.value)} required value={modalityId}><option value="">Selecciona una modalidad</option>{modalities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <label className="form-field"><span>Título tentativo <b>*</b></span><input disabled={isSubmitting} minLength={10} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
    <label className="form-field"><span>Descripción <b>*</b></span><textarea disabled={isSubmitting} minLength={20} onChange={(event) => setDescription(event.target.value)} required rows={3} value={description} /></label>
    <label className="form-field"><span>Objetivo general <b>*</b></span><textarea disabled={isSubmitting} minLength={10} onChange={(event) => setGeneralObjective(event.target.value)} required rows={3} value={generalObjective} /></label>
    <div className="admin-objectives"><strong>Objetivos específicos <b>*</b></strong>{objectives.map((objective, index) => <div key={index}><textarea aria-label={`Objetivo específico ${index + 1}`} disabled={isSubmitting} minLength={10} onChange={(event) => setObjectives((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} required rows={2} value={objective} />{objectives.length > 1 && <button aria-label={`Eliminar objetivo ${index + 1}`} className="icon-button" disabled={isSubmitting} onClick={() => setObjectives((current) => current.filter((_item, itemIndex) => itemIndex !== index))} type="button"><Icon name="trash" /></button>}</div>)}<button className="text-button" disabled={isSubmitting || objectives.length >= 10} onClick={() => setObjectives((current) => [...current, ''])} type="button"><Icon name="plus" />Añadir objetivo</button></div>
    <label className="form-field"><span>Perfil inicial Word (.doc o .docx) <b>*</b></span><input accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={isSubmitting} onChange={(event) => setProfile(event.target.files?.[0] ?? null)} required type="file" /></label>
    {message && <p className="student-message is-visible tutor-message">{message}</p>}
    <div className="tutor-actions"><button className="secondary-button" disabled={isSubmitting} onClick={onCancel} type="button">Cancelar</button><button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Registrando…' : 'Registrar proyecto'}</button></div>
  </form>
}

function AdminPortal({ data, onLogout, onRefresh, sessionActions, navigationTarget, onNavigationHandled }: { data: AdminDashboard; onLogout: () => Promise<void>; onRefresh: () => Promise<void>; sessionActions: ReactNode; navigationTarget: NotificationDestination | null; onNavigationHandled: () => void }) {
  const [view, setView] = useState<'home' | 'projects' | 'review-starts' | 'new-teachers' | 'defenses-private' | 'defenses-public' | 'users'>('home')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [usersData, setUsersData] = useState<AdminUsersResponse | null>(null)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userRole, setUserRole] = useState<RoleCode | ''>('')
  const [userStatus, setUserStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [editingUser, setEditingUser] = useState<AdminUser | null | undefined>(undefined)
  const [assigningTeacher, setAssigningTeacher] = useState<PendingTeacher | null>(null)
  const [projectCatalog, setProjectCatalog] = useState<ProjectCatalog | null>(null)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [message, setMessage] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleProjects = data.projects.filter((project) => {
    const matchesSearch = !normalizedSearch || [project.code, project.title, project.students, project.tutor].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
    return matchesSearch && (!status || project.statusCode === status)
  })
  const normalizedUserSearch = userSearch.trim().toLocaleLowerCase()
  const visibleUsers = (usersData?.users ?? []).filter((user) => {
    const matchesSearch = !normalizedUserSearch || [user.fullName, user.email, user.registration ?? '', user.teacherCode ?? ''].some((value) => value.toLocaleLowerCase().includes(normalizedUserSearch))
    const matchesRole = !userRole || user.roles.includes(userRole)
    const matchesStatus = userStatus === 'ALL' || (userStatus === 'ACTIVE' ? user.active : !user.active)
    return matchesSearch && matchesRole && matchesStatus
  })
  const isDefenseView = view === 'defenses-private' || view === 'defenses-public'
  const heading = view === 'home' ? 'Inicio' : view === 'projects' ? 'Proyectos' : view === 'review-starts' ? 'Revisiones por iniciar' : view === 'new-teachers' ? 'Nuevos docentes' : view === 'defenses-private' ? 'Defensas privadas' : view === 'defenses-public' ? 'Defensas públicas' : 'Usuarios'

  useEffect(() => {
    if (navigationTarget === '/admin/revisiones-por-iniciar' || navigationTarget === '/admin/nuevos-proyectos' || navigationTarget === '/admin') {
      setView('review-starts')
      onNavigationHandled()
    }
    if (navigationTarget === '/admin/nuevos-docentes') {
      setView('new-teachers')
      onNavigationHandled()
    }
  }, [navigationTarget, onNavigationHandled])

  async function loadUsers() {
    setIsLoadingUsers(true)
    try {
      const payload = await api<AdminUsersResponse>('/api/admin/users')
      setUsersData(payload)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar los usuarios.')
    } finally {
      setIsLoadingUsers(false)
    }
  }

  async function saveUser(payload: AdminUserInput) {
    if (editingUser === undefined) return
    const endpoint = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users'
    const result = await api<{ message: string }>(endpoint, {
      method: editingUser ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setMessage(result.message)
    setEditingUser(undefined)
    await loadUsers()
  }

  async function changeUserStatus(user: AdminUser, active: boolean) {
    try {
      const result = await api<{ message: string }>(`/api/admin/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, password: '', active }),
      })
      setMessage(result.message)
      await loadUsers()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el usuario.')
    }
  }

  async function openProjectCreate() {
    setMessage('')
    setIsCreatingProject(true)
    try {
      setProjectCatalog(await api<ProjectCatalog>('/api/admin/project-catalog'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar el formulario de proyecto.')
      setIsCreatingProject(false)
    }
  }

  async function createProject(body: FormData) {
    const result = await api<{ message: string; project: { id: string } }>('/api/admin/projects', { method: 'POST', body })
    setMessage(result.message)
    setIsCreatingProject(false)
    await onRefresh()
    setSelectedProjectId(result.project.id)
  }

  async function assignTeacherRoles(teacher: PendingTeacher, payload: { roles: ('TUTOR' | 'REVISOR')[]; careerId: string; teacherCode: string; specialty: string }) {
    const result = await api<{ message: string }>(`/api/admin/users/${teacher.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.email,
        phone: '',
        password: '',
        active: true,
        registration: '',
        ...payload,
      }),
    })
    setMessage(result.message)
    setAssigningTeacher(null)
    await Promise.all([onRefresh(), loadUsers()])
  }

  useEffect(() => {
    if ((view === 'users' || view === 'new-teachers') && !usersData && !isLoadingUsers) void loadUsers()
  }, [view, usersData, isLoadingUsers])

  if (selectedProjectId) return <AdminProjectWorkspace onBack={() => setSelectedProjectId('')} onLogout={onLogout} onRefresh={onRefresh} projectId={selectedProjectId} sessionActions={sessionActions} user={data.user} />

  function projectCard(project: AdminProject) {
    const reviewLabel = project.reviewRoundCount === 0
      ? project.canStartInitialReview
        ? 'Equipo completo: habilita la primera revisión.'
        : project.tutorStatus !== 'CONFIRMADA'
          ? 'Pendiente de confirmación del tutor.'
          : `Falta asignar ${2 - project.reviewerCount} revisor${2 - project.reviewerCount === 1 ? '' : 'es'}.`
      : project.pendingReviews > 0
        ? `${project.pendingReviews} dictamen${project.pendingReviews === 1 ? '' : 'es'} pendiente${project.pendingReviews === 1 ? '' : 's'}`
        : 'Sin revisiones pendientes'
    const tutorLabel = project.tutorStatus === 'CONFIRMADA'
      ? 'Tutoría confirmada'
      : project.tutorStatus === 'PENDIENTE'
        ? 'Tutoría pendiente'
        : 'Sin tutor asignado'

    return <article className="admin-project-card" key={project.id}>
      <div className="admin-project-top"><span className="tutor-code">{project.code}</span><span className={`admin-status status-${project.statusCode.toLocaleLowerCase()}`}>{project.status}</span></div>
      <h2>{project.title}</h2>
      <div className="admin-project-meta"><span><Icon name="user" />{project.students}</span><span><Icon name="clipboard" />{project.modality}</span><span><Icon name="check" />{project.phase}</span></div>
      <div className="admin-project-details"><div><small>Tutor asignado</small><strong>{project.tutor}</strong><span>{tutorLabel}</span></div><div><small>Revisión</small><strong>{project.reviewRoundCount === 0 ? 'Primera ronda pendiente' : project.pendingReviews > 0 ? `${project.pendingReviews} pendiente${project.pendingReviews === 1 ? '' : 's'}` : 'Sin pendientes'}</strong><span>{reviewLabel}</span></div></div>
      <footer><span>{project.management}</span><span>Registrado: {formatDate(project.registeredAt)}</span><button className={project.canStartInitialReview ? 'primary-button' : 'text-button'} onClick={() => setSelectedProjectId(project.id)} type="button">{project.canStartInitialReview ? 'Habilitar revisión' : 'Gestionar'}</button></footer>
    </article>
  }

  return <main className="student-page admin-page">
    <aside className="student-sidebar admin-sidebar">
      <div>
        <div className="student-brand"><BrandLogo /><span><strong>UNIVALLE</strong><small>Seguimiento de Titulación</small></span></div>
        <p className="student-role">ADMINISTRACIÓN</p>
        <nav aria-label="Navegación de Administración" className="student-nav">
          <button className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')} type="button"><Icon name="dashboard" /><span>Inicio</span></button>
          <button className={view === 'review-starts' ? 'is-active' : ''} onClick={() => setView('review-starts')} type="button"><Icon name="bell" /><span>Por iniciar</span>{data.summary.pendingReviewStarts > 0 && <b className="nav-count">{data.summary.pendingReviewStarts}</b>}</button>
          <button className={view === 'new-teachers' ? 'is-active' : ''} onClick={() => setView('new-teachers')} type="button"><Icon name="user" /><span>Nuevos docentes</span>{data.summary.newTeachers > 0 && <b className="nav-count">{data.summary.newTeachers}</b>}</button>
          <button className={view === 'projects' ? 'is-active' : ''} onClick={() => setView('projects')} type="button"><Icon name="clipboard" /><span>Proyectos</span></button>
          <button className={isDefenseView ? 'is-active' : ''} onClick={() => setView('defenses-private')} type="button"><Icon name="file" /><span>Defensas</span></button>
          <button className={view === 'users' ? 'is-active' : ''} onClick={() => setView('users')} type="button"><Icon name="user" /><span>Usuarios</span></button>
          <button type="button"><Icon name="help" /><span>Ayuda</span></button>
        </nav>
      </div>
      <div className="sidebar-bottom"><div className="student-help"><Icon name="help" /><span><strong>Gestión académica</strong><small>Control de proyectos y revisiones.</small></span></div><button className="logout-button" onClick={() => void onLogout()} type="button"><Icon name="exit" />Cerrar sesión</button></div>
    </aside>

    <section className="student-content">
      <header className="student-header"><div className="mobile-student-brand"><BrandLogo /><strong>UNIVALLE</strong></div>{sessionActions}</header>
      <div className="student-main admin-main">
        <div className="breadcrumb">Administración <span>/</span> {heading}</div>
        <div className="student-title-row admin-title"><div><p className="eyebrow">Control operativo</p><h1>{heading}</h1><p>{view === 'home' ? 'Consulta el estado académico de los proyectos registrados en el sistema.' : view === 'projects' ? 'Crea, consulta, actualiza y anula proyectos con trazabilidad académica.' : view === 'review-starts' ? 'Completa el equipo evaluador y habilita la primera revisión de los perfiles pendientes.' : view === 'new-teachers' ? 'Docentes con correo confirmado que esperan la asignación de sus roles.' : isDefenseView ? 'Programa y consulta las convocatorias de defensas académicas.' : 'Gestiona todos los accesos, roles y perfiles académicos registrados en el sistema.'}</p></div>{view === 'projects' && <button className="primary-button admin-title-action" onClick={() => void openProjectCreate()} type="button"><Icon name="plus" />Nuevo proyecto</button>}{view === 'users' && <button className="primary-button admin-title-action" onClick={() => { setMessage(''); setEditingUser(null) }} type="button"><Icon name="plus" />Nuevo usuario</button>}</div>

        {view === 'new-teachers' ? <section className="admin-stats admin-user-stats"><div className={data.summary.newTeachers > 0 ? 'requires-attention' : ''}><small>Docentes por asignar</small><strong>{data.summary.newTeachers}</strong><span>Con correo institucional confirmado.</span></div></section> : isDefenseView ? null : view !== 'users' ? <section className="admin-stats"><div><small>Proyectos registrados</small><strong>{data.summary.total}</strong><span>En el listado actual.</span></div><div className={data.summary.pendingReviewStarts > 0 ? 'requires-attention' : ''}><small>Por iniciar</small><strong>{data.summary.pendingReviewStarts}</strong><span>Requieren equipo o primera ronda.</span></div><div><small>En revisión</small><strong>{data.summary.inReview}</strong><span>Con proceso de revisión activo.</span></div><div><small>Observados</small><strong>{data.summary.observed}</strong><span>Esperan correcciones.</span></div></section> : <section className="admin-stats admin-user-stats"><div><small>Usuarios registrados</small><strong>{usersData?.summary.total ?? '—'}</strong><span>Hasta 250 resultados por consulta.</span></div><div><small>Accesos activos</small><strong>{usersData?.summary.active ?? '—'}</strong><span>Con ingreso habilitado.</span></div><div><small>Estudiantes</small><strong>{usersData?.summary.students ?? '—'}</strong><span>Con perfil estudiantil.</span></div><div><small>Docentes</small><strong>{usersData?.summary.staff ?? '—'}</strong><span>Tutores o revisores.</span></div></section>}

        {message && <p className="student-message is-visible tutor-message">{message}</p>}

        {isDefenseView && <nav aria-label="Tipos de defensa" className="admin-defense-tabs"><button className={view === 'defenses-private' ? 'is-active' : ''} onClick={() => setView('defenses-private')} type="button">Defensas privadas</button><button className={view === 'defenses-public' ? 'is-active' : ''} onClick={() => setView('defenses-public')} type="button">Defensas públicas</button></nav>}

        {view === 'home' && <>
          <section className="admin-intro"><Icon name="clipboard" /><div><h2>Seguimiento centralizado</h2><p>Esta vista se alimenta directamente de los proyectos, asignaciones, rondas y revisiones registradas en PostgreSQL.</p></div></section>
          <section className="tutor-section admin-section"><div className="tutor-section-heading"><div><h2>Nuevos docentes</h2><p>Correos confirmados que requieren rol de Tutor, Revisor o ambos.</p></div><button className="text-button" onClick={() => setView('new-teachers')} type="button">Ver docentes</button></div>{data.newTeachers.length > 0 ? <div className="admin-pending-teacher-list">{data.newTeachers.slice(0, 4).map((teacher) => <article className="admin-pending-teacher" key={teacher.id}><div><span className="admin-status status-observado">Roles pendientes</span><h3>{teacher.fullName}</h3><p>{teacher.email}</p></div><button className="secondary-button" onClick={() => { setMessage(''); setAssigningTeacher(teacher) }} type="button">Asignar roles</button></article>)}</div> : <section className="tutor-empty"><Icon name="check" /><strong>No hay docentes pendientes.</strong><span>Los docentes confirmados aparecerán aquí hasta recibir sus roles.</span></section>}</section>
          <section className="tutor-section admin-section"><div className="tutor-section-heading"><div><h2>Revisiones por iniciar</h2><p>Completa el equipo evaluador y habilita la primera revisión del perfil.</p></div><button className="text-button" onClick={() => setView('review-starts')} type="button">Ver pendientes</button></div>{data.pendingReviewStarts.length > 0 ? <div className="admin-project-list">{data.pendingReviewStarts.slice(0, 4).map(projectCard)}</div> : <section className="tutor-empty"><Icon name="check" /><strong>No hay primeras rondas pendientes.</strong><span>Todos los proyectos activos ya iniciaron su proceso de revisión.</span></section>}</section>
          <section className="tutor-section admin-section"><div className="tutor-section-heading"><div><h2>Proyectos recientes</h2><p>Prioriza los casos con tutoría pendiente o dictámenes sin emitir.</p></div><button className="text-button" onClick={() => setView('projects')} type="button">Ver todos</button></div>{data.projects.length > 0 ? <div className="admin-project-list">{data.projects.slice(0, 4).map(projectCard)}</div> : <section className="tutor-empty"><Icon name="clipboard" /><strong>No hay proyectos registrados.</strong><span>Los registros del Formulario 1 aparecerán aquí.</span></section>}</section>
        </>}

        {view === 'review-starts' && <>{data.pendingReviewStarts.length > 0 ? <div className="admin-project-list">{data.pendingReviewStarts.map(projectCard)}</div> : <section className="tutor-empty"><Icon name="check" /><strong>No hay primeras rondas pendientes.</strong><span>Los proyectos aparecerán aquí hasta que la primera ronda de revisión sea creada.</span></section>}</>}

        {view === 'defenses-private' && <AdminDefensesPanel key="private" kind="PRIVATE" onRefresh={onRefresh} />}
        {view === 'defenses-public' && <AdminDefensesPanel key="public" kind="PUBLIC" onRefresh={onRefresh} />}

        {view === 'new-teachers' && <>
          {assigningTeacher && <PendingTeacherRoleForm careers={usersData?.careers ?? []} onCancel={() => setAssigningTeacher(null)} onSave={(payload) => assignTeacherRoles(assigningTeacher, payload)} teacher={assigningTeacher} />}
          {data.newTeachers.length > 0 ? <div className="admin-pending-teacher-list">{data.newTeachers.map((teacher) => <article className="admin-pending-teacher" key={teacher.id}><div><span className="admin-status status-observado">Roles pendientes</span><h2>{teacher.fullName}</h2><p>{teacher.email}</p><small>Correo confirmado: {formatDate(teacher.confirmedAt)}</small></div><button className="primary-button" onClick={() => { setMessage(''); setAssigningTeacher(teacher) }} type="button">Asignar roles</button></article>)}</div> : <section className="tutor-empty"><Icon name="check" /><strong>No hay docentes pendientes de roles.</strong><span>Los nuevos docentes aparecerán aquí después de confirmar su correo institucional.</span></section>}
        </>}

        {view === 'projects' && <>
          {isCreatingProject && (projectCatalog ? <AdminProjectCreateForm catalog={projectCatalog} onCancel={() => setIsCreatingProject(false)} onSave={createProject} /> : <section className="admin-operation-card"><p>Cargando estudiantes, gestiones y modalidades disponibles…</p></section>)}
          <section className="admin-filters" aria-label="Filtros de proyectos"><label><span>Buscar proyecto</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Código, título, estudiante o tutor" type="search" value={search} /></label><label><span>Estado</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="">Todos los estados</option>{data.statuses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label></section>
          <div className="admin-list-heading"><span>{visibleProjects.length} proyecto{visibleProjects.length === 1 ? '' : 's'} encontrado{visibleProjects.length === 1 ? '' : 's'}</span>{(search || status) && <button className="text-button" onClick={() => { setSearch(''); setStatus('') }} type="button">Limpiar filtros</button>}</div>
          {visibleProjects.length > 0 ? <div className="admin-project-list">{visibleProjects.map(projectCard)}</div> : <section className="tutor-empty"><Icon name="clipboard" /><strong>No encontramos proyectos con esos filtros.</strong><span>Prueba con otro estado o término de búsqueda.</span></section>}
        </>}

        {view === 'users' && <>
          {editingUser !== undefined && <AdminUserForm careers={usersData?.careers ?? []} key={editingUser?.id ?? 'new'} onCancel={() => setEditingUser(undefined)} onSave={saveUser} roles={usersData?.roles ?? []} user={editingUser} />}
          <section className="admin-filters admin-user-filters" aria-label="Filtros de usuarios"><label><span>Buscar persona</span><input onChange={(event) => setUserSearch(event.target.value)} placeholder="Nombre, correo, matrícula o código docente" type="search" value={userSearch} /></label><label><span>Rol</span><select onChange={(event) => setUserRole(event.target.value as RoleCode | '')} value={userRole}><option value="">Todos los roles</option>{(usersData?.roles ?? []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label><span>Estado</span><select onChange={(event) => setUserStatus(event.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')} value={userStatus}><option value="ALL">Todos</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option></select></label></section>
          <div className="admin-list-heading"><span>{isLoadingUsers ? 'Cargando usuarios…' : `${visibleUsers.length} usuario${visibleUsers.length === 1 ? '' : 's'} encontrado${visibleUsers.length === 1 ? '' : 's'}`}</span>{(userSearch || userRole || userStatus !== 'ALL') && <button className="text-button" onClick={() => { setUserSearch(''); setUserRole(''); setUserStatus('ALL') }} type="button">Limpiar filtros</button>}</div>
          {!isLoadingUsers && visibleUsers.length > 0 && <div className="admin-user-list">{visibleUsers.map((user) => <article className={user.active ? 'admin-user-card' : 'admin-user-card is-inactive'} key={user.id}><div className="admin-user-card-top"><div><span className={user.active ? 'admin-status status-registrado' : 'admin-status status-anulado'}>{user.active ? 'Activo' : 'Inactivo'}</span><h2>{user.fullName}</h2><p>{user.email}{user.phone ? ` · ${user.phone}` : ''}</p></div><div className="admin-user-actions"><button className="secondary-button" onClick={() => { setMessage(''); setEditingUser(user) }} type="button">Editar</button><button className={user.active ? 'danger-button' : 'primary-button'} disabled={user.id === data.user.id} onClick={() => void changeUserStatus(user, !user.active)} type="button">{user.active ? 'Desactivar' : 'Reactivar'}</button></div></div><div className="admin-role-badges">{user.roles.length > 0 ? user.roles.map((role) => <span className={`notification-role-badge role-${role.toLowerCase()}`} key={role}>{roleLabel(role)}</span>) : <span className="admin-empty-badge">Sin roles activos</span>}</div><div className="admin-user-details"><div><small>Carrera</small><strong>{user.career}</strong></div>{user.registration && <div><small>Matrícula</small><strong>{user.registration}</strong></div>}{user.teacherCode && <div><small>Código docente</small><strong>{user.teacherCode}</strong><span>{user.specialty || 'Sin especialidad registrada'}</span></div>}<div><small>Proyectos relacionados</small><strong>{user.relatedProjects}</strong></div><div><small>Último acceso</small><strong>{user.lastAccessAt ? formatDate(user.lastAccessAt) : 'Sin accesos registrados'}</strong></div></div></article>)}</div>}
          {!isLoadingUsers && usersData && visibleUsers.length === 0 && <section className="tutor-empty"><Icon name="user" /><strong>No encontramos usuarios con esos filtros.</strong><span>Prueba con otro término o registra una nueva persona.</span></section>}
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
  const [isPasswordResetFlow, setIsPasswordResetFlow] = useState(() => new URLSearchParams(window.location.search).has('resetToken'))
  const [view, setView] = useState<'home' | 'project' | 'documents'>('home')
  const [navigationTarget, setNavigationTarget] = useState<NotificationDestination | null>(null)

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
      setNavigationTarget(null)
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
    const destination = notificationDestination(notification.link)
    if (destination === '/student') setView('home')
    if (destination === '/student/proponer-tutor') {
      setView('home')
      setNavigationTarget(destination)
    }
    if (destination === '/documentos') setView('documents')
    if (destination && !['/student', '/student/proponer-tutor', '/documentos'].includes(destination)) setNavigationTarget(destination)
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
  if (!data || isPasswordResetFlow) return <LoginView onAuthenticated={loadPortal} onPasswordReset={() => { setData(null); setNotifications([]); setIsPasswordResetFlow(false) }} />
  if ('pendingReviews' in data) return <ReviewerPortal data={data} navigationTarget={navigationTarget} notifications={notifications} onNavigationHandled={() => setNavigationTarget(null)} onLogout={handleLogout} onRefresh={loadPortal} sessionActions={sessionActions(data.user)} />
  if ('summary' in data) return <AdminPortal data={data} navigationTarget={navigationTarget} onNavigationHandled={() => setNavigationTarget(null)} onLogout={handleLogout} onRefresh={loadPortal} sessionActions={sessionActions(data.user)} />
  if ('invitations' in data) return <TutorPortal data={data} navigationTarget={navigationTarget} notifications={notifications} onNavigationHandled={() => setNavigationTarget(null)} onLogout={handleLogout} onRefresh={loadPortal} sessionActions={sessionActions(data.user)} />
  return view === 'home'
    ? <HomeView data={data} navigationTarget={navigationTarget} onDocuments={() => setView('documents')} onLogout={handleLogout} onProject={() => setView('project')} onRefresh={loadPortal} onNavigationHandled={() => setNavigationTarget(null)} sessionActions={sessionActions(data.user)} />
    : view === 'documents'
      ? <DocumentsView data={data} onHome={() => setView('home')} onLogout={handleLogout} onProject={() => setView('project')} sessionActions={sessionActions(data.user)} />
      : <StudentForm data={data} onDocuments={() => setView('documents')} onHome={() => setView('home')} onLogout={handleLogout} onRegistered={loadPortal} sessionActions={sessionActions(data.user)} />
}

export default App

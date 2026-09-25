export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isInstitutionalEmail(value) {
  const email = normalizeEmail(value)
  return Boolean(email) && /^[^\s@]+@est\.univalle\.edu$/i.test(email)
}

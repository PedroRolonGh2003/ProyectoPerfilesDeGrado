export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  const body = await response.json().catch(() => ({})) as { message?: string }
  if (!response.ok) throw new ApiError(body.message ?? 'No fue posible completar la operación.', response.status)
  return body as T
}

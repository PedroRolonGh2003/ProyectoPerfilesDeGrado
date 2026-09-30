import app, { initializeServerless } from '../server/index.js'

export default async function handler(request, response) {
  const incomingUrl = new URL(request.url || '/', 'http://vercel.local')
  const route = incomingUrl.searchParams.get('route')
  if (route) {
    incomingUrl.searchParams.delete('route')
    request.url = `/api/${route.replace(/^\/+/, '')}${incomingUrl.search}`
  }

  await initializeServerless()
  return app(request, response)
}

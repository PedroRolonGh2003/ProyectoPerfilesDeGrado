import app, { initializeServerless } from '../server/index.js'

export default async function handler(request, response) {
  await initializeServerless()
  return app(request, response)
}

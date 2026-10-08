import app from '../server/index.js'

export default function handler(request, response) {
  return app(request, response)
}

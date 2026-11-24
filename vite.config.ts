import { existsSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Runs the Vercel functions in api/ on the dev server, so `bun run dev` is the whole app.
// /api/gmail → api/gmail.ts, /api/google/connect → api/google/connect.ts. Each file exports
// handlers named after HTTP methods (POST, GET) that take a Request and return a Response.
function apiFunctions(): Plugin {
  return {
    name: 'rayons-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const file = `api${url.pathname.replace(/\/$/, '')}.ts`
        if (!/^api(\/[a-z0-9-]+)+\.ts$/.test(file) || !existsSync(file)) {
          res.statusCode = 404
          res.end()
          return
        }
        try {
          const mod = await server.ssrLoadModule('/' + file)
          const handler = mod[req.method ?? 'GET']
          if (typeof handler !== 'function') {
            res.statusCode = 405
            res.end()
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const headers = new Headers()
          for (const [name, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(name, value)
          }
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
          const response: Response = await handler(
            new Request(`http://localhost:${server.config.server.port ?? 5175}${req.url}`, {
              method: req.method,
              headers,
              body: hasBody ? Buffer.concat(chunks) : undefined,
            }),
          )
          res.statusCode = response.status
          response.headers.forEach((value, name) => res.setHeader(name, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          server.config.logger.error(String((error as Error).stack ?? error))
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'server_error' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // The api/ functions read their settings from process.env, as on Vercel, where every
  // variable (VITE_ ones included) reaches the functions. Only VITE_ ones reach the browser.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [name, value] of Object.entries(env)) {
    if (process.env[name] === undefined) process.env[name] = value
  }
  return {
    plugins: [react(), apiFunctions()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: { host: true, port: 5175 },
  }
})

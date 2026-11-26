import { handle } from '../server/http.js'
import { logoFor } from '../server/logo.js'

const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

// GET /api/logo?domain=example.com → the company's logo, or 404. Public (an <img> can't send our
// sign-in header) and only ever about a domain; cached by the browser and Vercel's CDN.
export function GET(request: Request) {
  return handle(request, async () => {
    const domain = new URL(request.url).searchParams.get('domain')?.trim().toLowerCase() ?? ''
    const logo = DOMAIN.test(domain) ? await logoFor(domain) : null
    if (!logo) {
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } })
    }
    return new Response(logo.body, {
      headers: {
        'Content-Type': logo.type,
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400',
        // An SVG opened on its own must not be able to run anything on our site.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}

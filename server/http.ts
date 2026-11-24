// Small helpers shared by the api/ functions.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** Turns thrown errors into JSON answers the app understands: { error, message }. */
export async function handle(request: Request, run: (request: Request) => Promise<Response>) {
  try {
    return await run(request)
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code, message: error.message }, error.status)
    console.error(error)
    return json({ error: 'server_error', message: 'Something went wrong on our side. Please try again.' }, 500)
  }
}

/** Reads a JSON body (POST only, JSON only, at most 2 MB). */
export async function readJson<T>(request: Request): Promise<T> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) throw new HttpError(415, 'bad_request', 'Expected JSON.')
  const text = await request.text()
  if (text.length > 2_000_000) throw new HttpError(413, 'too_large', 'That request is too large.')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'bad_request', 'Malformed JSON.')
  }
}

export function env(name: string) {
  const value = process.env[name]
  if (!value) throw new HttpError(500, 'not_configured', `The server is missing ${name}. See docs/SETUP.md.`)
  return value
}

import http from 'node:http'

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11434

export class OllamaNotRunningError extends Error {
  constructor() {
    super('Ollama is not running')
    this.name = 'OllamaNotRunningError'
  }
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  body?: unknown
  signal?: AbortSignal
}

function request(opts: RequestOptions): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const payload = opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    const req = http.request(
      {
        host: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: opts.path,
        method: opts.method,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload).toString() } : {})
        }
      },
      (res) => resolve(res)
    )
    req.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
        reject(new OllamaNotRunningError())
      } else {
        reject(err)
      }
    })
    if (opts.signal) {
      if (opts.signal.aborted) {
        req.destroy(new Error('aborted'))
      } else {
        opts.signal.addEventListener('abort', () => req.destroy(new Error('aborted')), {
          once: true
        })
      }
    }
    if (payload) req.write(payload)
    req.end()
  })
}

async function readJson<T>(res: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (c) => chunks.push(c as Buffer))
    res.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}: ${body}`))
        return
      }
      try {
        resolve(JSON.parse(body) as T)
      } catch (err) {
        reject(err)
      }
    })
    res.on('error', reject)
  })
}

async function* iterNdjson(res: http.IncomingMessage): AsyncGenerator<unknown> {
  let buffer = ''
  for await (const chunk of res) {
    buffer += (chunk as Buffer).toString('utf-8')
    let newlineIdx: number
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim()
      buffer = buffer.slice(newlineIdx + 1)
      if (!line) continue
      try {
        yield JSON.parse(line)
      } catch {
        // skip malformed lines
      }
    }
  }
  const tail = buffer.trim()
  if (tail) {
    try {
      yield JSON.parse(tail)
    } catch {
      // ignore
    }
  }
}

// ---------------- API calls ----------------

export async function getVersion(): Promise<string> {
  const res = await request({ method: 'GET', path: '/api/version' })
  const body = await readJson<{ version: string }>(res)
  return body.version
}

export interface RawTagModel {
  name: string
  modified_at: string
  size: number
  digest: string
  details?: {
    parameter_size?: string
    quantization_level?: string
    family?: string
    families?: string[]
    format?: string
  }
}

export async function listTags(): Promise<RawTagModel[]> {
  const res = await request({ method: 'GET', path: '/api/tags' })
  const body = await readJson<{ models: RawTagModel[] }>(res)
  return body.models ?? []
}

export async function deleteModel(name: string): Promise<void> {
  const res = await request({ method: 'DELETE', path: '/api/delete', body: { name } })
  res.resume()
  await new Promise<void>((resolve, reject) => {
    res.on('end', () => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`))
      } else {
        resolve()
      }
    })
    res.on('error', reject)
  })
}

export interface RawShowResponse {
  license?: string
  modelfile?: string
  parameters?: string
  template?: string
  details?: {
    parameter_size?: string
    quantization_level?: string
    family?: string
    families?: string[]
    format?: string
  }
}

export async function showModel(name: string): Promise<RawShowResponse> {
  const res = await request({ method: 'POST', path: '/api/show', body: { name } })
  return readJson<RawShowResponse>(res)
}

export interface PullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
  error?: string
}

export async function* pullModel(
  name: string,
  signal: AbortSignal
): AsyncGenerator<PullProgress> {
  const res = await request({
    method: 'POST',
    path: '/api/pull',
    body: { name, stream: true },
    signal
  })
  if (res.statusCode && res.statusCode >= 400) {
    const body = await readJson<{ error?: string }>(res).catch(() => ({ error: undefined }))
    throw new Error(body.error || `HTTP ${res.statusCode}`)
  }
  for await (const evt of iterNdjson(res)) {
    yield evt as PullProgress
  }
}

export interface ChatMessageIn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatChunk {
  message?: { role: string; content: string }
  done?: boolean
  error?: string
}

export async function* chatStream(
  model: string,
  messages: ChatMessageIn[],
  signal: AbortSignal
): AsyncGenerator<ChatChunk> {
  const res = await request({
    method: 'POST',
    path: '/api/chat',
    body: { model, messages, stream: true },
    signal
  })
  if (res.statusCode && res.statusCode >= 400) {
    const body = await readJson<{ error?: string }>(res).catch(() => ({ error: undefined }))
    throw new Error(body.error || `HTTP ${res.statusCode}`)
  }
  for await (const evt of iterNdjson(res)) {
    yield evt as ChatChunk
  }
}

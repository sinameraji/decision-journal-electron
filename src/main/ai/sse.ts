/**
 * Server-Sent Events parser for the OpenRouter streaming API.
 *
 * Deliberately not shared with the Ollama NDJSON reader: SSE frames can be split
 * across arbitrary chunk boundaries (including mid-UTF-8-codepoint), several
 * events can arrive in one chunk, comment lines are legal, and line endings may
 * be LF or CRLF.
 */

export interface SseEvent {
  /** The concatenated `data:` lines of one frame. */
  data: string
}

export class SseParser {
  private readonly decoder = new TextDecoder('utf-8')
  private buffer = ''

  /** Feed one network chunk; returns whatever complete frames it completed. */
  push(chunk: Uint8Array): SseEvent[] {
    this.buffer += this.decoder.decode(chunk, { stream: true })
    return this.drain(false)
  }

  /** Flush at end of stream. Emits a trailing frame that had no blank line. */
  end(): SseEvent[] {
    this.buffer += this.decoder.decode()
    return this.drain(true)
  }

  private drain(final: boolean): SseEvent[] {
    const events: SseEvent[] = []

    // Frames are separated by a blank line: \n\n, \r\n\r\n, or \r\r.
    const separator = /\r\n\r\n|\n\n|\r\r/
    for (;;) {
      const match = separator.exec(this.buffer)
      if (!match) break
      const raw = this.buffer.slice(0, match.index)
      this.buffer = this.buffer.slice(match.index + match[0].length)
      const evt = parseFrame(raw)
      if (evt) events.push(evt)
    }

    if (final) {
      const raw = this.buffer
      this.buffer = ''
      const evt = parseFrame(raw)
      if (evt) events.push(evt)
    }

    return events
  }
}

function parseFrame(raw: string): SseEvent | null {
  if (raw.trim() === '') return null
  const dataLines: string[] = []
  for (const line of raw.split(/\r\n|\n|\r/)) {
    // A line starting with ':' is a comment. OpenRouter sends ": OPENROUTER
    // PROCESSING" keep-alives that must not be treated as payload.
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    if (field !== 'data') continue
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  return { data: dataLines.join('\n') }
}

/** OpenRouter signals normal completion with this sentinel payload. */
export function isDoneSentinel(data: string): boolean {
  return data.trim() === '[DONE]'
}

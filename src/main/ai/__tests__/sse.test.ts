import { describe, expect, it } from 'vitest'
import { isDoneSentinel, SseParser } from '../sse'

const enc = new TextEncoder()

function feed(parser: SseParser, chunks: string[]): string[] {
  const out: string[] = []
  for (const c of chunks) out.push(...parser.push(enc.encode(c)).map((e) => e.data))
  out.push(...parser.end().map((e) => e.data))
  return out
}

describe('SseParser', () => {
  it('reads a single frame', () => {
    expect(feed(new SseParser(), ['data: {"a":1}\n\n'])).toEqual(['{"a":1}'])
  })

  it('reads several frames from one chunk', () => {
    expect(feed(new SseParser(), ['data: one\n\ndata: two\n\ndata: three\n\n'])).toEqual([
      'one',
      'two',
      'three'
    ])
  })

  it('reassembles a frame split across arbitrary chunk boundaries', () => {
    expect(feed(new SseParser(), ['data: {"he', 'llo":"wo', 'rld"}\n', '\n'])).toEqual([
      '{"hello":"world"}'
    ])
  })

  it('handles a multi-byte codepoint split across chunks', () => {
    // "café" — the é is two bytes; cut between them.
    const bytes = enc.encode('data: café\n\n')
    const cut = bytes.indexOf(0xc3) + 1
    const parser = new SseParser()
    const first = parser.push(bytes.slice(0, cut))
    const second = parser.push(bytes.slice(cut))
    expect([...first, ...second].map((e) => e.data)).toEqual(['café'])
  })

  it('accepts CRLF line endings', () => {
    expect(feed(new SseParser(), ['data: hi\r\n\r\n'])).toEqual(['hi'])
  })

  it('ignores comment keep-alives', () => {
    expect(feed(new SseParser(), [': OPENROUTER PROCESSING\n\ndata: real\n\n'])).toEqual(['real'])
  })

  it('joins multiple data lines in one frame', () => {
    expect(feed(new SseParser(), ['data: a\ndata: b\n\n'])).toEqual(['a\nb'])
  })

  it('ignores non-data fields', () => {
    expect(feed(new SseParser(), ['event: message\nid: 7\ndata: payload\n\n'])).toEqual(['payload'])
  })

  it('emits a trailing frame that never got its blank line', () => {
    expect(feed(new SseParser(), ['data: last'])).toEqual(['last'])
  })

  it('produces nothing for an empty stream', () => {
    expect(feed(new SseParser(), [''])).toEqual([])
  })

  it('recognises the completion sentinel', () => {
    expect(isDoneSentinel('[DONE]')).toBe(true)
    expect(isDoneSentinel(' [DONE] ')).toBe(true)
    expect(isDoneSentinel('{"choices":[]}')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { emptyForm, hasContent, makeBlankOption, parseDraft } from '../decisionDraft'

function filled() {
  return {
    ...emptyForm(),
    title: 'Leave the job',
    situation: 'Two offers, one deadline.',
    mentalState: ['anxious' as const],
    options: [{ id: 'a', name: 'Stay', note: 'safe', chosen: false }]
  }
}

describe('hasContent', () => {
  it('is false for a blank form', () => {
    expect(hasContent(emptyForm())).toBe(false)
  })

  it('stays false when only the default dates are present', () => {
    // The default decided-at is "now", so a blank form goes stale on its own.
    // Treating that as content would offer an empty draft back later.
    const f = emptyForm()
    f.decidedAtLocal = '2020-01-01T09:00'
    f.reviewAtLocal = '2020-07-01'
    expect(hasContent(f)).toBe(false)
  })

  it.each([
    ['title', { title: 'x' }],
    ['situation', { situation: 'x' }],
    ['problemStatement', { problemStatement: 'x' }],
    ['variables', { variables: 'x' }],
    ['complications', { complications: 'x' }],
    ['rangeOfOutcomes', { rangeOfOutcomes: 'x' }],
    ['expectedOutcome', { expectedOutcome: 'x' }],
    ['mentalState', { mentalState: ['tired' as const] }]
  ])('is true once %s is written', (_label, patch) => {
    expect(hasContent({ ...emptyForm(), ...patch })).toBe(true)
  })

  it('ignores whitespace-only writing', () => {
    expect(hasContent({ ...emptyForm(), title: '   \n ' })).toBe(false)
  })

  it('is true once an option carries a name or a note', () => {
    const named = { ...emptyForm(), options: [{ ...makeBlankOption(), name: 'Stay' }] }
    const noted = { ...emptyForm(), options: [{ ...makeBlankOption(), note: 'safer' }] }
    expect(hasContent(named)).toBe(true)
    expect(hasContent(noted)).toBe(true)
    expect(hasContent({ ...emptyForm(), options: [makeBlankOption()] })).toBe(false)
  })
})

describe('parseDraft', () => {
  it('round-trips a form', () => {
    const f = filled()
    expect(parseDraft(JSON.stringify(f))).toEqual(f)
  })

  it('returns null rather than throwing on unparseable text', () => {
    expect(parseDraft('not json')).toBeNull()
    expect(parseDraft('')).toBeNull()
  })

  it('returns null for JSON that is not an object', () => {
    expect(parseDraft('null')).toBeNull()
    expect(parseDraft('"a string"')).toBeNull()
    expect(parseDraft('42')).toBeNull()
  })

  it('keeps what it can when a draft predates a field', () => {
    // A draft written by an older build is still someone's writing. Losing the
    // whole thing over one absent key would be the bug this feature prevents.
    const { expectedOutcome: _dropped, ...older } = filled()
    const restored = parseDraft(JSON.stringify(older))
    expect(restored?.title).toBe('Leave the job')
    expect(restored?.expectedOutcome).toBe('')
  })

  it('drops mental states it does not recognise', () => {
    const f = { ...filled(), mentalState: ['anxious', 'elated', 7, null] }
    expect(parseDraft(JSON.stringify(f))?.mentalState).toEqual(['anxious'])
  })

  it('tolerates a mentalState that is not an array', () => {
    expect(parseDraft(JSON.stringify({ ...filled(), mentalState: 'anxious' }))?.mentalState).toEqual(
      []
    )
  })

  it('falls back to blank options when none survive', () => {
    const f = { ...filled(), options: [{ nonsense: true }, null] }
    const restored = parseDraft(JSON.stringify(f))
    expect(restored?.options).toHaveLength(emptyForm().options.length)
    expect(restored?.options.every((o) => o.name === '' && o.note === '')).toBe(true)
  })

  it('gives an option a fresh id when it is missing one', () => {
    const f = { ...filled(), options: [{ name: 'Stay', note: '', chosen: false }] }
    const restored = parseDraft(JSON.stringify(f))
    expect(restored?.options[0].id).toMatch(/[0-9a-f-]{36}/)
    expect(restored?.options[0].name).toBe('Stay')
  })

  it('keeps only a real boolean as the chosen option', () => {
    const f = { ...filled(), options: [{ id: 'a', name: 'Stay', note: '', chosen: 'yes' }] }
    expect(parseDraft(JSON.stringify(f))?.options[0].chosen).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { MAX_CANDIDATES, initialsFor, avatarHue } from '@shared/roleModels'
import {
  MAX_CLAIMS_PER_SECTION,
  MAX_FRAMEWORKS,
  isUsableSource,
  validateCandidates,
  validateProfile
} from '../validate'

const claim = (patch: Record<string, unknown> = {}) => ({
  section: 'known-for',
  text: 'Co-founded Y Combinator in 2005.',
  sourceUrl: 'https://en.wikipedia.org/wiki/Y_Combinator',
  sourceTitle: 'Y Combinator',
  ...patch
})

describe('isUsableSource', () => {
  it('accepts web links', () => {
    expect(isUsableSource('https://example.com/a')).toBe(true)
    expect(isUsableSource('http://example.com')).toBe(true)
  })

  it('rejects anything not checkable', () => {
    expect(isUsableSource('')).toBe(false)
    expect(isUsableSource('according to his blog')).toBe(false)
    expect(isUsableSource('file:///etc/passwd')).toBe(false)
    expect(isUsableSource('javascript:alert(1)')).toBe(false)
    expect(isUsableSource(null)).toBe(false)
  })
})

/**
 * The rule that governs this whole feature: these are real people, so nothing
 * is stored about them that cannot be traced to a source the user can open.
 */
describe('no claim survives without a citation', () => {
  it('keeps a sourced claim', () => {
    const p = validateProfile({ claims: [claim()] })
    expect(p.claims).toHaveLength(1)
  })

  it('drops a claim with no source, and counts it', () => {
    const p = validateProfile({ claims: [claim({ sourceUrl: null })] })
    expect(p.claims).toEqual([])
    expect(p.droppedForNoSource).toBe(1)
  })

  it('drops a claim whose "source" is prose rather than a link', () => {
    const p = validateProfile({ claims: [claim({ sourceUrl: 'widely reported' })] })
    expect(p.claims).toEqual([])
    expect(p.droppedForNoSource).toBe(1)
  })

  it('refuses a non-web scheme as a citation', () => {
    const p = validateProfile({ claims: [claim({ sourceUrl: 'file:///etc/passwd' })] })
    expect(p.claims).toEqual([])
  })

  it('ignores an unknown section', () => {
    const p = validateProfile({ claims: [claim({ section: 'personality-score' })] })
    expect(p.claims).toEqual([])
  })

  it('caps claims per section', () => {
    const many = Array.from({ length: 20 }, (_, i) => claim({ text: `Fact number ${i}.` }))
    const p = validateProfile({ claims: many })
    expect(p.claims).toHaveLength(MAX_CLAIMS_PER_SECTION)
  })

  it('survives a malformed response instead of throwing', () => {
    expect(validateProfile(null).claims).toEqual([])
    expect(validateProfile({ claims: 'nope' }).claims).toEqual([])
    expect(validateProfile({ claims: [null] }).claims).toEqual([])
  })
})

describe('frameworks', () => {
  const fw = (patch: Record<string, unknown> = {}) => ({
    name: 'Make something people want',
    summary: 'Start from demand, not from the idea you like.',
    instruction: 'Ask whether anyone has asked for this unprompted.',
    sourceUrl: 'https://paulgraham.com/good.html',
    sourceTitle: null,
    ...patch
  })

  it('keeps a complete framework', () => {
    expect(validateProfile({ frameworks: [fw()] }).frameworks).toHaveLength(1)
  })

  it('drops one missing its instruction', () => {
    expect(validateProfile({ frameworks: [fw({ instruction: '' })] }).frameworks).toEqual([])
  })

  it('allows a framework without a source but never a claim without one', () => {
    // A framework is a way of thinking, not an assertion about the person.
    expect(validateProfile({ frameworks: [fw({ sourceUrl: null })] }).frameworks).toHaveLength(1)
    expect(validateProfile({ claims: [claim({ sourceUrl: null })] }).claims).toEqual([])
  })

  it('caps how many are kept', () => {
    const many = Array.from({ length: 12 }, (_, i) => fw({ name: `Framework ${i}` }))
    expect(validateProfile({ frameworks: many }).frameworks).toHaveLength(MAX_FRAMEWORKS)
  })
})

describe('candidates', () => {
  const c = (patch: Record<string, unknown> = {}) => ({
    name: 'Paul Graham',
    distinguisher: 'Programmer and essayist, co-founded Y Combinator',
    lifespan: 'b. 1964',
    sourceUrl: 'https://en.wikipedia.org/wiki/Paul_Graham_(programmer)',
    ...patch
  })

  it('keeps a usable candidate', () => {
    expect(validateCandidates({ candidates: [c()] })).toHaveLength(1)
  })

  it('requires a distinguisher, since the point is telling people apart', () => {
    expect(validateCandidates({ candidates: [c({ distinguisher: '' })] })).toEqual([])
  })

  it('collapses duplicates by name', () => {
    expect(validateCandidates({ candidates: [c(), c(), c()] })).toHaveLength(1)
  })

  it('caps how many are offered', () => {
    const many = Array.from({ length: 12 }, (_, i) => c({ name: `Person ${i}` }))
    expect(validateCandidates({ candidates: many })).toHaveLength(MAX_CANDIDATES)
  })

  it('tolerates a missing source without dropping the candidate', () => {
    // Identification is a question put to the user, not a stored assertion.
    expect(validateCandidates({ candidates: [c({ sourceUrl: null })] })).toHaveLength(1)
  })
})

describe('avatars use initials, never a downloaded image', () => {
  it('derives initials from a name', () => {
    expect(initialsFor('Paul Graham')).toBe('PG')
    expect(initialsFor('Cher')).toBe('CH')
    expect(initialsFor('  ')).toBe('?')
  })

  it('gives the same person the same colour every time', () => {
    expect(avatarHue('Paul Graham')).toBe(avatarHue('Paul Graham'))
    expect(avatarHue('Paul Graham')).not.toBe(avatarHue('Peter Thiel'))
  })
})

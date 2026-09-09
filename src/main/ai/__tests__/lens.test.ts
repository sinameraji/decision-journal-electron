import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LENS_KINDS, LENS_LABELS, LENS_OPENERS, isLensKind } from '@shared/ipc-contract'
import { lensInstruction } from '../lensPrompts'

const decisions = vi.hoisted(() => ({ store: new Map<string, unknown>(), all: [] as unknown[] }))

vi.mock('../../db/decisions', () => ({
  getDecision: (_db: unknown, id: string) => decisions.store.get(id) ?? null,
  listDecisions: () => decisions.all
}))
vi.mock('../../memory/context', () => ({ renderApprovedMemories: () => null }))
vi.mock('../../rolemodels/store', () => ({ getFramework: () => null }))

const { buildSystemPrompt } = await import('../context')

beforeEach(() => {
  decisions.store.clear()
  decisions.all = []
})

describe('lens vocabulary', () => {
  it('accepts only the four known lenses', () => {
    for (const k of LENS_KINDS) expect(isLensKind(k)).toBe(true)
    expect(isLensKind('hedge-fund')).toBe(false)
    expect(isLensKind('')).toBe(false)
    expect(isLensKind(null)).toBe(false)
  })

  it('labels every lens', () => {
    for (const k of LENS_KINDS) expect(LENS_LABELS[k]).toBeTruthy()
  })
})

describe('lensInstruction', () => {
  it('produces a distinct instruction per lens', () => {
    const texts = LENS_KINDS.map((k) => lensInstruction(k))
    expect(new Set(texts).size).toBe(LENS_KINDS.length)
  })

  it('tells the model to stay inside the frame', () => {
    expect(lensInstruction('pre-mortem')).toMatch(/stay inside the lens/i)
  })
})

describe('a lens reaches the prompt as an instruction, not as pasted text', () => {
  const db = {} as never

  it('is absent unless one was chosen', () => {
    const built = buildSystemPrompt({ db, provider: 'openrouter', attachedDecisionIds: [] })
    expect(built.systemPrompt).not.toMatch(/Pre-mortem/i)
  })

  it('is appended when chosen', () => {
    const built = buildSystemPrompt({
      db,
      provider: 'openrouter',
      attachedDecisionIds: [],
      lens: { kind: 'builtin', lens: 'pre-mortem' }
    })
    expect(built.systemPrompt).toMatch(/Pre-mortem/i)
  })

  it('still refuses to send an unattached decision', () => {
    decisions.all = [{ id: 'other', title: 'SENTINEL-not-attached' }]
    const built = buildSystemPrompt({
      db,
      provider: 'openrouter',
      attachedDecisionIds: [],
      lens: { kind: 'builtin', lens: 'opportunity-cost' }
    })
    expect(built.systemPrompt).not.toContain('SENTINEL-not-attached')
  })
})

describe('running a lens with an empty composer', () => {
  it('has an opener for every lens, so no turn is ever blank', () => {
    for (const k of LENS_KINDS) {
      expect(LENS_OPENERS[k]).toBeTruthy()
      expect(LENS_OPENERS[k].length).toBeGreaterThan(10)
    }
  })

  it('gives each lens its own opener', () => {
    expect(new Set(Object.values(LENS_OPENERS)).size).toBe(LENS_KINDS.length)
  })
})

describe('a borrowed framework is resolved the same way', () => {
  const db = {} as never

  it('is ignored when the framework no longer exists', () => {
    const built = buildSystemPrompt({
      db,
      provider: 'openrouter',
      attachedDecisionIds: [],
      lens: { kind: 'borrowed', frameworkId: 'gone' }
    })
    expect(built.lensLabel).toBeNull()
  })

  it('labels a built-in frame', () => {
    const built = buildSystemPrompt({
      db,
      provider: 'openrouter',
      attachedDecisionIds: [],
      lens: { kind: 'builtin', lens: 'pre-mortem' }
    })
    expect(built.lensLabel).toBe(LENS_LABELS['pre-mortem'])
  })
})

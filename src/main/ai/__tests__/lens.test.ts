import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LENS_KINDS, LENS_LABELS, LENS_OPENERS, isLensKind } from '@shared/ipc-contract'
import { lensInstruction } from '../lensPrompts'
import { borrowedPersonInstruction } from '../../rolemodels/prompt'

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
  it('accepts only the known lenses', () => {
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

  it('appends the portfolio-theory lens when chosen', () => {
    const built = buildSystemPrompt({
      db,
      provider: 'openrouter',
      attachedDecisionIds: [],
      lens: { kind: 'builtin', lens: 'portfolio-theory' }
    })
    expect(built.systemPrompt).toMatch(/Modern Portfolio Theory/i)
  })

  it('appends the market-theory lens when chosen', () => {
    const built = buildSystemPrompt({
      db,
      provider: 'openrouter',
      attachedDecisionIds: [],
      lens: { kind: 'builtin', lens: 'market-theory' }
    })
    expect(built.systemPrompt).toMatch(/Market Theory/i)
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

/**
 * A person's whole toolkit is its own frame. Picking one framework is a sharp
 * instrument; picking the person asks how they would approach the decision at
 * all, which is usually the first question.
 */
describe('the whole-person frame', () => {
  it('is a distinct selection kind', () => {
    const selection = { kind: 'person' as const, roleModelId: 'rm1' }
    expect(selection.kind).toBe('person')
    expect('frameworkId' in selection).toBe(false)
  })

  it('asks the coach to pick the frames that apply rather than run all of them', () => {
    const text = borrowedPersonInstruction('Ibn Sina', [
      { name: 'A', instruction: 'do a' },
      { name: 'B', instruction: 'do b' },
      { name: 'C', instruction: 'do c' }
    ])
    expect(text).toMatch(/genuinely bite/i)
    expect(text).toMatch(/not all of them/i)
    expect(text).toMatch(/name which you are applying/i)
  })

  it('keeps the frames attributed and warns against copying circumstances', () => {
    const text = borrowedPersonInstruction('Ibn Sina', [{ name: 'A', instruction: 'do a' }])
    expect(text).toMatch(/interpretation of their approach/i)
    expect(text).toMatch(/do not assume their circumstances are the user's/i)
    expect(text).toContain('Ibn Sina')
  })
})

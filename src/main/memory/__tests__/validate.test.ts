import { describe, expect, it } from 'vitest'
import type { Decision } from '@shared/ipc-contract'
import { serializeOptions } from '@shared/ipc-contract'
import { normalizeStatement } from '@shared/memory'
import { renderDecision } from '../../ai/decisionSections'
import { initialStateFor } from '../store'
import { decisionFields, locateExcerpt, validateProposals } from '../validate'

const DECISION: Decision = {
  id: 'd1',
  title: 'Keep my job while testing an independent consulting practice',
  decidedAt: Date.UTC(2026, 8, 8),
  reviewAt: Date.UTC(2026, 11, 8),
  mentalState: ['focused', 'anxious'],
  situation:
    'I am a product designer living in Osaka. I want more autonomy and need stable income while caring for a parent.',
  problemStatement: 'How can I test demand without committing to a full-time business too early?',
  variables: 'Six months of essential-expense savings; ten hours weekly available.',
  complications: 'Two interested prospects have not signed; caregiving time varies.',
  alternatives: serializeOptions([
    { id: 'o1', name: 'Stay employed and run an eight-week pilot', note: 'Limits downside', chosen: true },
    { id: 'o2', name: 'Quit immediately', note: 'Rejected because demand is not yet demonstrated', chosen: false }
  ]),
  rangeOfOutcomes: 'Paid pilot validates demand; no customer signs.',
  expectedOutcome: '60% chance of one paid pilot within eight weeks.',
  outcome: '',
  lessonsLearned: '',
  reviewedAt: null,
  createdAt: Date.UTC(2026, 8, 8),
  updatedAt: Date.UTC(2026, 8, 8),
  isSample: 0,
  memoryExcluded: false
}

const never = (): boolean => false

function proposal(patch: Record<string, unknown> = {}) {
  return {
    category: 'constraint',
    statement: 'They have ten hours a week available for a side practice.',
    kind: 'explicit',
    field: 'variables',
    excerpt: 'ten hours weekly available',
    applicableDate: null,
    domain: 'career',
    supersedesStatement: null,
    question: null,
    ...patch
  }
}

describe('locateExcerpt', () => {
  const fields = decisionFields(DECISION)

  it('finds a quote regardless of case and spacing', () => {
    expect(locateExcerpt(fields, '  Ten   Hours   Weekly Available ')).toBe('variables')
  })

  it('searches inside structured options too', () => {
    expect(locateExcerpt(fields, 'Rejected because demand is not yet demonstrated')).toBe('options')
  })

  it('returns null for text the user never wrote', () => {
    expect(locateExcerpt(fields, 'I have always been an introvert')).toBeNull()
  })

  it('normalises curly quotes so a re-typed quote still matches', () => {
    const withQuotes = { note: 'she said “yes” to the pilot' }
    expect(locateExcerpt(withQuotes, 'she said "yes" to the pilot')).toBe('note')
  })
})

describe('validateProposals', () => {
  it('accepts a well-evidenced proposal', () => {
    const { accepted, rejected } = validateProposals({ items: [proposal()] }, DECISION, never)
    expect(rejected).toEqual([])
    expect(accepted).toHaveLength(1)
    expect(accepted[0].statement).toContain('ten hours')
  })

  it('rejects a proposal whose excerpt is nowhere in the entry', () => {
    const invented = proposal({
      statement: 'They are an introvert.',
      excerpt: 'I have always preferred to be alone'
    })
    const { accepted, rejected } = validateProposals({ items: [invented] }, DECISION, never)
    expect(accepted).toEqual([])
    expect(rejected[0].reason).toBe('excerpt-not-found')
  })

  it('takes the field from where the quote really is, not from what the model claimed', () => {
    const misattributed = proposal({ field: 'lessons learned' })
    const { accepted } = validateProposals({ items: [misattributed] }, DECISION, never)
    expect(accepted[0].field).toBe('variables')
  })

  it('drops a statement whose assertion the user already rejected', () => {
    const suppressed = (category: string, statement: string): boolean =>
      category === 'constraint' && normalizeStatement(statement).includes('ten hours')
    const { accepted, rejected } = validateProposals({ items: [proposal()] }, DECISION, suppressed)
    expect(accepted).toEqual([])
    expect(rejected[0].reason).toBe('suppressed')
  })

  it('refuses an unknown category rather than coercing it', () => {
    const { accepted, rejected } = validateProposals(
      { items: [proposal({ category: 'personality-score' })] },
      DECISION,
      never
    )
    expect(accepted).toEqual([])
    expect(rejected[0].reason).toBe('unknown-category')
  })

  it('refuses an unknown evidence kind', () => {
    const { rejected } = validateProposals(
      { items: [proposal({ kind: 'certain' })] },
      DECISION,
      never
    )
    expect(rejected[0].reason).toBe('unknown-kind')
  })

  it('rejects an excerpt too short to be real evidence', () => {
    const { rejected } = validateProposals(
      { items: [proposal({ excerpt: 'ten' })] },
      DECISION,
      never
    )
    expect(rejected[0].reason).toBe('excerpt-too-short')
  })

  it('keeps only an ISO date and never invents one from an age', () => {
    const dated = validateProposals(
      { items: [proposal({ applicableDate: '2026-09-08' })] },
      DECISION,
      never
    )
    expect(dated.accepted[0].applicableDate).toBe('2026-09-08')

    const fuzzy = validateProposals(
      { items: [proposal({ applicableDate: 'about 34 years old' })] },
      DECISION,
      never
    )
    expect(fuzzy.accepted[0].applicableDate).toBeNull()
  })

  it('collapses duplicates so one entry cannot look like repeated evidence', () => {
    const { accepted } = validateProposals(
      { items: [proposal(), proposal(), proposal()] },
      DECISION,
      never
    )
    expect(accepted).toHaveLength(1)
  })

  it('caps how many items one decision can produce', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      proposal({ statement: `Distinct statement number ${i} about ten hours weekly.` })
    )
    const { accepted, rejected } = validateProposals({ items: many }, DECISION, never)
    expect(accepted).toHaveLength(6)
    expect(rejected.every((r) => r.reason === 'over-limit')).toBe(true)
  })

  it('treats a non-conforming response as malformed rather than throwing', () => {
    expect(validateProposals(null, DECISION, never).rejected[0].reason).toBe('malformed')
    expect(validateProposals({ items: 'nope' }, DECISION, never).rejected[0].reason).toBe(
      'malformed'
    )
    expect(validateProposals({ items: [null] }, DECISION, never).rejected[0].reason).toBe(
      'malformed'
    )
  })

  it('ignores anything the model adds beyond the schema', () => {
    const { accepted } = validateProposals(
      { items: [{ ...proposal(), sql: 'DROP TABLE memory_items', state: 'approved' }] },
      DECISION,
      never
    )
    expect(accepted).toHaveLength(1)
    expect(Object.keys(accepted[0])).not.toContain('sql')
    expect(Object.keys(accepted[0])).not.toContain('state')
  })
})

describe('normalizeStatement', () => {
  it('matches the same claim across punctuation and case', () => {
    expect(normalizeStatement('They value Autonomy!')).toBe(
      normalizeStatement('they value autonomy')
    )
  })

  it('keeps genuinely different claims apart', () => {
    expect(normalizeStatement('They value autonomy')).not.toBe(
      normalizeStatement('They value stability')
    )
  })
})

/**
 * Regression: a live run against the API had three correct memories rejected
 * as fabricated because the validator's search corpus had drifted from the text
 * the model was actually shown. Both now come from `decisionSections`.
 */
describe('the validator searches exactly what the model was shown', () => {
  const fields = decisionFields(DECISION)

  it('can find a quote from the review date line', () => {
    expect(locateExcerpt(fields, 'Review due: 2026-12-08')).toBe('review date')
    expect(locateExcerpt(fields, '2026-12-08')).toBe('review date')
  })

  it('can find a quote from the decision date line', () => {
    expect(locateExcerpt(fields, 'Decided on: 2026-09-08')).toBe('decision date')
  })

  it('can find a quote from the mental state line', () => {
    expect(locateExcerpt(fields, 'focused, anxious')).toBe('mental state')
  })

  it('can find an option quoted with its rendered marker and separator', () => {
    expect(locateExcerpt(fields, '[CHOSEN] Stay employed and run an eight-week pilot')).toBe(
      'options'
    )
    expect(
      locateExcerpt(fields, 'Quit immediately — Rejected because demand is not yet demonstrated')
    ).toBe('options')
  })

  it('every non-empty line the prompt shows is searchable', () => {
    const rendered = renderDecision(DECISION, 1)
    const skip = /^--- |^\[|^Options considered:$/
    const unsearchable = rendered
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 12 && !skip.test(l))
      .filter((line) => {
        // Strip the prompt's own label prefix; the value after it must be findable.
        const value = line.includes(': ') ? line.slice(line.indexOf(': ') + 2) : line
        return value.length > 12 && locateExcerpt(fields, value) === null
      })
    expect(unsearchable).toEqual([])
  })

  it('still rejects text that appears nowhere in the entry', () => {
    expect(locateExcerpt(fields, 'They have always been risk averse')).toBeNull()
  })
})

/**
 * Three decisions once produced 36 items to approve, because extraction hit the
 * 12-item cap every time and everything needed review. Quoted fact is now kept
 * automatically; only the model's own guesses are put to the user, and only a
 * couple per entry.
 */
describe('what actually reaches the user', () => {
  it('sends verified quotes straight to approved', () => {
    expect(initialStateFor('explicit')).toBe('approved')
    expect(initialStateFor('self-described')).toBe('approved')
  })

  it('only a model inference is put to the user', () => {
    expect(initialStateFor('tentative')).toBe('pending')
  })

  it('drops a tentative item the model cannot frame a question about', () => {
    const { accepted, rejected } = validateProposals(
      { items: [proposal({ kind: 'tentative', question: null })] },
      DECISION,
      never
    )
    expect(accepted).toEqual([])
    expect(rejected[0].reason).toBe('tentative-without-question')
  })

  it('keeps a tentative item that comes with a question', () => {
    const { accepted } = validateProposals(
      {
        items: [
          proposal({
            kind: 'tentative',
            question: 'How much of the ten hours is realistically uninterrupted?'
          })
        ]
      },
      DECISION,
      never
    )
    expect(accepted).toHaveLength(1)
    expect(accepted[0].question).toMatch(/uninterrupted/)
  })

  it('never asks more than two questions about one decision', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      proposal({
        kind: 'tentative',
        statement: `Tentative reading ${i} about ten hours weekly.`,
        question: `Question ${i}?`
      })
    )
    const { accepted, rejected } = validateProposals({ items: many }, DECISION, never)
    expect(accepted).toHaveLength(2)
    expect(rejected.every((r) => r.reason === 'too-many-tentative')).toBe(true)
  })

  it('strips a question from an item that is not tentative', () => {
    const { accepted } = validateProposals(
      { items: [proposal({ kind: 'explicit', question: 'Should not be asked?' })] },
      DECISION,
      never
    )
    expect(accepted[0].question).toBeNull()
  })
})

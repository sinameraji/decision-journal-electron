import type Database from 'better-sqlite3-multiple-ciphers'
import { randomUUID } from 'node:crypto'
import type {
  AnalyticsSummary,
  CadenceDay,
  CalibrationBucket,
  CalibrationData,
  CategoryStatRow,
  CreateDecisionInput,
  Decision,
  DecisionCategory,
  ProcessOutcomePoint,
  ReviewDecisionInput
} from '@shared/ipc-contract'
import { DECISION_CATEGORIES } from '@shared/ipc-contract'

type DB = Database.Database

interface DecisionRow {
  id: string
  title: string
  body: string
  createdAt: number
  reviewAt: number | null
  isSample: 0 | 1
  confidence: number | null
  category: string | null
  stakes: string | null
  predictedOutcome: string | null
  alternativesConsidered: string | null
  resolvedAt: number | null
  actualOutcome: string | null
  result: string | null
  processQuality: number | null
  outcomeQuality: number | null
  lessons: string | null
}

const SELECT_DECISION_COLS = `
  id,
  title,
  body,
  created_at              as createdAt,
  review_at               as reviewAt,
  is_sample               as isSample,
  confidence,
  category,
  stakes,
  predicted_outcome       as predictedOutcome,
  alternatives_considered as alternativesConsidered,
  resolved_at             as resolvedAt,
  actual_outcome          as actualOutcome,
  result,
  process_quality         as processQuality,
  outcome_quality         as outcomeQuality,
  lessons
`

function rowToDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    reviewAt: row.reviewAt,
    isSample: row.isSample,
    confidence: row.confidence,
    category: row.category as Decision['category'],
    stakes: row.stakes as Decision['stakes'],
    predictedOutcome: row.predictedOutcome,
    alternativesConsidered: row.alternativesConsidered,
    resolvedAt: row.resolvedAt,
    actualOutcome: row.actualOutcome,
    result: row.result as Decision['result'],
    processQuality: row.processQuality,
    outcomeQuality: row.outcomeQuality,
    lessons: row.lessons
  }
}

// ---------- Seed data ----------

interface SeedDecision {
  title: string
  body?: string
  createdAt: number
  category: DecisionCategory
  stakes: 'low' | 'medium' | 'high'
  confidence: number
  predictedOutcome: string
  alternativesConsidered: string
  // if omitted → unresolved
  resolvedAt?: number
  actualOutcome?: string
  result?: 'better' | 'as_expected' | 'worse'
  processQuality?: number
  outcomeQuality?: number
  lessons?: string
}

const D = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d)

const SAMPLE_DECISIONS: SeedDecision[] = [
  {
    title: "My country's at war. I'm far from it. I love my country too much to watch it go through this.",
    createdAt: D(2026, 3, 3),
    category: 'other',
    stakes: 'high',
    confidence: 40,
    predictedOutcome: 'Staying informed from a distance will be healthier than returning.',
    alternativesConsidered: 'Fly back for a month; volunteer remotely full-time.'
  },
  {
    title: 'Finding a nice home that I would feel good at in Tokyo for a few years is difficult.',
    createdAt: D(2026, 2, 24),
    category: 'other',
    stakes: 'medium',
    confidence: 55,
    predictedOutcome: 'A 6-month short-term lease while I search will be worth the premium.',
    alternativesConsidered: 'Sign a 2-year lease on the first acceptable place; stay in a hotel.'
  },
  {
    title: 'Take the senior staff engineer role at the smaller startup over the big-tech offer.',
    createdAt: D(2025, 8, 12),
    category: 'career',
    stakes: 'high',
    confidence: 85,
    predictedOutcome: 'More ownership and faster learning will outweigh the pay cut.',
    alternativesConsidered: 'Accept the big-tech offer; stay at current job and renegotiate.',
    resolvedAt: D(2026, 2, 15),
    actualOutcome: 'Learned a lot but scope was narrower than advertised; pay cut stung more than expected.',
    result: 'as_expected',
    processQuality: 4,
    outcomeQuality: 3,
    lessons: "Don't let the 'ownership' story paper over a 30% comp gap — model the finances honestly."
  },
  {
    title: 'Switch from index funds to picking individual stocks for 20% of the portfolio.',
    createdAt: D(2025, 6, 2),
    category: 'money',
    stakes: 'medium',
    confidence: 75,
    predictedOutcome: 'Active picks will outperform by a couple points over the year.',
    alternativesConsidered: 'Stay 100% indexed; try a managed robo-advisor.',
    resolvedAt: D(2026, 1, 10),
    actualOutcome: 'Underperformed the index by ~4%.',
    result: 'worse',
    processQuality: 2,
    outcomeQuality: 2,
    lessons: 'I confused "following the market closely" with "having an edge." I do not have an edge.'
  },
  {
    title: 'End the relationship with J. — it is not converging.',
    createdAt: D(2025, 5, 20),
    category: 'relationships',
    stakes: 'high',
    confidence: 70,
    predictedOutcome: 'Short-term pain, but within 3 months I will feel relieved.',
    alternativesConsidered: 'Couples therapy for 3 months first; long-distance pause.',
    resolvedAt: D(2025, 11, 1),
    actualOutcome: 'Took longer than 3 months, but yes — right call.',
    result: 'as_expected',
    processQuality: 5,
    outcomeQuality: 4,
    lessons: 'Trust the pattern-match earlier. I saw this coming 6 months before I acted.'
  },
  {
    title: 'Try the elimination diet for six weeks.',
    createdAt: D(2025, 9, 1),
    category: 'health',
    stakes: 'low',
    confidence: 50,
    predictedOutcome: 'Maybe I identify a trigger, maybe not. Worth six weeks.',
    alternativesConsidered: 'See a GI doctor first; try intermittent fasting instead.',
    resolvedAt: D(2025, 10, 20),
    actualOutcome: 'Identified dairy as a clear trigger. Worth it.',
    result: 'better',
    processQuality: 4,
    outcomeQuality: 5,
    lessons: 'Cheap n=1 experiments on my own body are underrated.'
  },
  {
    title: 'Self-publish the book instead of pitching it to agents.',
    createdAt: D(2025, 4, 15),
    category: 'creative',
    stakes: 'high',
    confidence: 80,
    predictedOutcome: 'Keep rights and margin, reach the readers who already know me.',
    alternativesConsidered: 'Pitch 10 agents; co-publish with a small press.',
    resolvedAt: D(2026, 1, 5),
    actualOutcome: 'Sold 3x more than expected from my newsletter, but reach beyond it was near zero.',
    result: 'as_expected',
    processQuality: 4,
    outcomeQuality: 4,
    lessons: 'Self-publishing is great for audience monetization, bad for audience growth.'
  },
  {
    title: 'Sublet the apartment and do a 3-month residency in Lisbon.',
    createdAt: D(2025, 2, 10),
    category: 'other',
    stakes: 'medium',
    confidence: 90,
    predictedOutcome: 'Change of scene will unblock the current creative rut.',
    alternativesConsidered: 'Two-week trip; just take a month off at home.',
    resolvedAt: D(2025, 7, 1),
    actualOutcome: 'Lovely trip, did not unblock anything. Rut was internal.',
    result: 'worse',
    processQuality: 2,
    outcomeQuality: 3,
    lessons: "Don't use geography to solve psychology."
  },
  {
    title: 'Hire a part-time chief of staff.',
    createdAt: D(2025, 7, 22),
    category: 'career',
    stakes: 'high',
    confidence: 65,
    predictedOutcome: 'Will free ~15 hrs/week for deep work inside two months.',
    alternativesConsidered: 'Hire an EA; automate more; just say no to more meetings.',
    resolvedAt: D(2025, 12, 15),
    actualOutcome: 'Freed closer to 8 hrs/week, but those were the right 8 hours.',
    result: 'as_expected',
    processQuality: 4,
    outcomeQuality: 4,
    lessons: 'Delegation savings compound; measure at month 3 not week 3.'
  },
  {
    title: 'Pay off the mortgage early instead of investing the cash.',
    createdAt: D(2025, 3, 8),
    category: 'money',
    stakes: 'high',
    confidence: 60,
    predictedOutcome: 'The psychological value of being debt-free is worth the expected-value gap.',
    alternativesConsidered: 'Invest in a taxable brokerage; split the difference 50/50.',
    resolvedAt: D(2026, 2, 1),
    actualOutcome: 'Market ran hot; financially would have been better to invest. But I sleep better.',
    result: 'worse',
    processQuality: 4,
    outcomeQuality: 4,
    lessons: 'Outcome rating ≠ financial return. I optimized for sleep, and I got sleep.'
  },
  {
    title: 'Start training for a half marathon.',
    createdAt: D(2025, 10, 5),
    category: 'health',
    stakes: 'low',
    confidence: 45,
    predictedOutcome: 'I will probably quit by week 6, but the first 6 weeks will still help.',
    alternativesConsidered: 'Sign up for a gym class instead; just walk more.',
    resolvedAt: D(2026, 1, 20),
    actualOutcome: 'Ran the half. Genuinely surprised.',
    result: 'better',
    processQuality: 3,
    outcomeQuality: 5,
    lessons: 'I under-rate my own follow-through when I pre-commit publicly.'
  },
  {
    title: 'Say no to the conference keynote invitation.',
    createdAt: D(2025, 11, 12),
    category: 'career',
    stakes: 'medium',
    confidence: 75,
    predictedOutcome: 'The prep time cost outweighs the audience reach at this stage.',
    alternativesConsidered: 'Accept and recycle an existing talk; propose a workshop instead.',
    resolvedAt: D(2026, 2, 20),
    actualOutcome: 'Used the reclaimed weeks to ship the v2 of the product. Better call.',
    result: 'better',
    processQuality: 5,
    outcomeQuality: 5,
    lessons: 'Time is the scarce resource, not attention.'
  },
  {
    title: 'Buy the larger standing desk instead of the compact one.',
    createdAt: D(2025, 12, 1),
    category: 'other',
    stakes: 'low',
    confidence: 80,
    predictedOutcome: 'More surface area means fewer context-switch frictions.',
    alternativesConsidered: 'Keep the current desk; buy a second monitor instead.',
    resolvedAt: D(2026, 1, 18),
    actualOutcome: 'The larger desk cluttered up within a week. Compact would have been better.',
    result: 'worse',
    processQuality: 3,
    outcomeQuality: 2,
    lessons: 'Constraints beat capacity for me.'
  },
  {
    title: "Tell M. I'm interested — don't leave it ambiguous for another week.",
    createdAt: D(2025, 9, 20),
    category: 'relationships',
    stakes: 'medium',
    confidence: 55,
    predictedOutcome: "Even if it's a no, clarity is worth it.",
    alternativesConsidered: 'Wait until the project ends; send a less direct message.',
    resolvedAt: D(2025, 10, 5),
    actualOutcome: 'Clear no, gracefully handled, friendship intact.',
    result: 'as_expected',
    processQuality: 5,
    outcomeQuality: 4,
    lessons: 'Ambiguity has a real cost I keep under-counting.'
  },
  {
    title: 'Rewrite the codebase in Rust.',
    createdAt: D(2025, 5, 30),
    category: 'career',
    stakes: 'high',
    confidence: 70,
    predictedOutcome: 'A focused 6-week push ships a faster, more reliable v2.',
    alternativesConsidered: 'Incremental port of the hot paths; stay on TS and profile.',
    resolvedAt: D(2025, 11, 20),
    actualOutcome: 'Took 5 months, not 6 weeks. Faster, but the opportunity cost was brutal.',
    result: 'worse',
    processQuality: 2,
    outcomeQuality: 3,
    lessons: 'Rewrite estimates are lies. Always multiply by 3.'
  },
  {
    title: 'Sell the vintage guitar I never play.',
    createdAt: D(2025, 8, 3),
    category: 'money',
    stakes: 'low',
    confidence: 85,
    predictedOutcome: "I won't miss it. The cash is more useful.",
    alternativesConsidered: 'Loan it to a friend; hold another year.',
    resolvedAt: D(2025, 10, 1),
    actualOutcome: "Don't miss it at all. Took a week to list and sell.",
    result: 'as_expected',
    processQuality: 5,
    outcomeQuality: 5,
    lessons: 'Possessions I "might use someday" almost never earn their shelf space.'
  },
  {
    title: 'Go public with the beta instead of running a closed alpha first.',
    createdAt: D(2025, 7, 10),
    category: 'creative',
    stakes: 'high',
    confidence: 65,
    predictedOutcome: 'The public feedback loop is worth the rougher first impression.',
    alternativesConsidered: '20-person closed alpha; private launch to mailing list only.',
    resolvedAt: D(2025, 12, 20),
    actualOutcome: 'Got a handful of brutal but correct reviews that shaped v2. Right call.',
    result: 'better',
    processQuality: 4,
    outcomeQuality: 5,
    lessons: 'Public beta is the cheapest bug bounty program.'
  },
  {
    title: 'Fly economy instead of business on the 13-hour flight.',
    createdAt: D(2025, 6, 18),
    category: 'money',
    stakes: 'low',
    confidence: 90,
    predictedOutcome: 'Save $3k, recover in a day.',
    alternativesConsidered: 'Business class; premium economy as a compromise.',
    resolvedAt: D(2025, 6, 25),
    actualOutcome: 'Lost two days to exhaustion. The $3k was not worth the recovery time.',
    result: 'worse',
    processQuality: 3,
    outcomeQuality: 2,
    lessons: "For long-haul flights, my time and energy are worth more than I price them."
  },
  {
    title: 'Schedule a full annual physical including the optional tests.',
    createdAt: D(2025, 3, 28),
    category: 'health',
    stakes: 'medium',
    confidence: 60,
    predictedOutcome: 'Probably nothing flagged, but peace of mind is worth the morning.',
    alternativesConsidered: 'Skip it this year; only basic bloodwork.',
    resolvedAt: D(2025, 4, 12),
    actualOutcome: 'Caught a vitamin deficiency early. Easy fix.',
    result: 'better',
    processQuality: 5,
    outcomeQuality: 5,
    lessons: 'Boring preventive care keeps paying compound dividends.'
  },
  {
    title: 'Tell my team we are pausing the side project.',
    createdAt: D(2025, 10, 28),
    category: 'career',
    stakes: 'medium',
    confidence: 80,
    predictedOutcome: 'Short-term morale hit, but unblocks the main roadmap.',
    alternativesConsidered: 'Keep it alive at 10% time; hand it to a single owner.',
    resolvedAt: D(2026, 1, 25),
    actualOutcome: 'Morale actually improved — people were relieved. Main roadmap back on track.',
    result: 'better',
    processQuality: 5,
    outcomeQuality: 5,
    lessons: 'Teams usually know which projects are zombies. Naming it helps.'
  }
]

export function seedIfEmpty(db: DB): void {
  const row = db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number }
  if (row.c > 0) return

  const insert = db.prepare(
    `INSERT INTO decisions (
      id, title, body, created_at, review_at, is_sample,
      confidence, category, stakes, predicted_outcome, alternatives_considered,
      resolved_at, actual_outcome, result, process_quality, outcome_quality, lessons
    ) VALUES (
      @id, @title, @body, @createdAt, NULL, 1,
      @confidence, @category, @stakes, @predictedOutcome, @alternativesConsidered,
      @resolvedAt, @actualOutcome, @result, @processQuality, @outcomeQuality, @lessons
    )`
  )
  const tx = db.transaction((rows: SeedDecision[]) => {
    for (const r of rows) {
      insert.run({
        id: randomUUID(),
        title: r.title,
        body: r.body ?? '',
        createdAt: r.createdAt,
        confidence: r.confidence,
        category: r.category,
        stakes: r.stakes,
        predictedOutcome: r.predictedOutcome,
        alternativesConsidered: r.alternativesConsidered,
        resolvedAt: r.resolvedAt ?? null,
        actualOutcome: r.actualOutcome ?? null,
        result: r.result ?? null,
        processQuality: r.processQuality ?? null,
        outcomeQuality: r.outcomeQuality ?? null,
        lessons: r.lessons ?? null
      })
    }
  })
  tx(SAMPLE_DECISIONS)
}

// ---------- Queries ----------

export function listDecisions(db: DB): Decision[] {
  const rows = db
    .prepare(`SELECT ${SELECT_DECISION_COLS} FROM decisions ORDER BY created_at DESC`)
    .all() as DecisionRow[]
  return rows.map(rowToDecision)
}

export function getDecisionById(db: DB, id: string): Decision | null {
  const row = db
    .prepare(`SELECT ${SELECT_DECISION_COLS} FROM decisions WHERE id = ?`)
    .get(id) as DecisionRow | undefined
  return row ? rowToDecision(row) : null
}

export function createDecision(db: DB, input: CreateDecisionInput): Decision {
  const id = randomUUID()
  const createdAt = Date.now()
  db.prepare(
    `INSERT INTO decisions (
      id, title, body, created_at, review_at, is_sample,
      confidence, category, stakes, predicted_outcome, alternatives_considered
    ) VALUES (
      @id, @title, @body, @createdAt, @reviewAt, 0,
      @confidence, @category, @stakes, @predictedOutcome, @alternativesConsidered
    )`
  ).run({
    id,
    title: input.title,
    body: input.body,
    createdAt,
    reviewAt: input.reviewAt,
    confidence: input.confidence,
    category: input.category,
    stakes: input.stakes,
    predictedOutcome: input.predictedOutcome,
    alternativesConsidered: input.alternativesConsidered
  })
  const decision = getDecisionById(db, id)
  if (!decision) throw new Error('Failed to read back created decision')
  return decision
}

export function reviewDecision(db: DB, input: ReviewDecisionInput): Decision {
  const resolvedAt = Date.now()
  const result = db
    .prepare(
      `UPDATE decisions
       SET resolved_at     = @resolvedAt,
           actual_outcome  = @actualOutcome,
           result          = @result,
           process_quality = @processQuality,
           outcome_quality = @outcomeQuality,
           lessons         = @lessons
       WHERE id = @id`
    )
    .run({
      id: input.id,
      resolvedAt,
      actualOutcome: input.actualOutcome,
      result: input.result,
      processQuality: input.processQuality,
      outcomeQuality: input.outcomeQuality,
      lessons: input.lessons
    })
  if (result.changes === 0) throw new Error(`No decision with id ${input.id}`)
  const decision = getDecisionById(db, input.id)
  if (!decision) throw new Error('Failed to read back reviewed decision')
  return decision
}

// ---------- Analytics ----------

export function getAnalyticsSummary(db: DB): AnalyticsSummary {
  const summary = db
    .prepare(
      `SELECT
         COUNT(*) as totalDecisions,
         SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) as totalResolved,
         MIN(created_at) as firstDecisionAt
       FROM decisions`
    )
    .get() as { totalDecisions: number; totalResolved: number | null; firstDecisionAt: number | null }
  return {
    totalDecisions: summary.totalDecisions,
    totalResolved: summary.totalResolved ?? 0,
    firstDecisionAt: summary.firstDecisionAt
  }
}

/**
 * A "hit" is a decision where the outcome matched or beat the user's expectation.
 * result IN ('better', 'as_expected') → hit (1); result = 'worse' → miss (0).
 * Only resolved decisions with a confidence value contribute.
 */
export function getCalibration(db: DB): CalibrationData {
  const rows = db
    .prepare(
      `SELECT confidence, result
       FROM decisions
       WHERE resolved_at IS NOT NULL
         AND confidence IS NOT NULL
         AND result IS NOT NULL`
    )
    .all() as Array<{ confidence: number; result: 'better' | 'as_expected' | 'worse' }>

  const buckets: CalibrationBucket[] = Array.from({ length: 10 }, (_, i) => ({
    lower: i * 10,
    upper: i * 10 + 10,
    count: 0,
    hits: 0,
    hitRate: null
  }))

  let brierSum = 0
  for (const row of rows) {
    const hit = row.result !== 'worse' ? 1 : 0
    const p = row.confidence / 100
    brierSum += (p - hit) * (p - hit)
    const idx = Math.min(9, Math.floor(row.confidence / 10))
    buckets[idx].count += 1
    buckets[idx].hits += hit
  }
  for (const b of buckets) {
    b.hitRate = b.count > 0 ? b.hits / b.count : null
  }
  return {
    buckets,
    totalResolved: rows.length,
    brier: rows.length > 0 ? brierSum / rows.length : null
  }
}

export function getCategoryStats(db: DB): CategoryStatRow[] {
  const rows = db
    .prepare(
      `SELECT category, confidence, result, resolved_at as resolvedAt
       FROM decisions
       WHERE category IS NOT NULL`
    )
    .all() as Array<{
    category: string
    confidence: number | null
    result: 'better' | 'as_expected' | 'worse' | null
    resolvedAt: number | null
  }>

  const byCat = new Map<
    DecisionCategory,
    { count: number; resolved: number; hits: number; confidenceSum: number; confidenceN: number }
  >()
  for (const cat of DECISION_CATEGORIES) {
    byCat.set(cat, { count: 0, resolved: 0, hits: 0, confidenceSum: 0, confidenceN: 0 })
  }

  for (const row of rows) {
    if (!DECISION_CATEGORIES.includes(row.category as DecisionCategory)) continue
    const entry = byCat.get(row.category as DecisionCategory)!
    entry.count += 1
    if (row.confidence != null) {
      entry.confidenceSum += row.confidence
      entry.confidenceN += 1
    }
    if (row.resolvedAt != null && row.result != null) {
      entry.resolved += 1
      if (row.result !== 'worse') entry.hits += 1
    }
  }

  return DECISION_CATEGORIES.map((cat) => {
    const e = byCat.get(cat)!
    return {
      category: cat,
      count: e.count,
      resolved: e.resolved,
      hits: e.hits,
      hitRate: e.resolved > 0 ? e.hits / e.resolved : null,
      meanConfidence: e.confidenceN > 0 ? e.confidenceSum / e.confidenceN : null
    }
  }).filter((row) => row.count > 0)
}

export function getProcessOutcome(db: DB): ProcessOutcomePoint[] {
  const rows = db
    .prepare(
      `SELECT id, title, process_quality as processQuality, outcome_quality as outcomeQuality
       FROM decisions
       WHERE process_quality IS NOT NULL
         AND outcome_quality IS NOT NULL`
    )
    .all() as ProcessOutcomePoint[]
  return rows
}

export function getCadence(db: DB, days: number): CadenceDay[] {
  const now = new Date()
  const out: CadenceDay[] = []
  const counts = new Map<string, number>()

  const rows = db
    .prepare(`SELECT created_at as createdAt FROM decisions`)
    .all() as Array<{ createdAt: number }>
  for (const row of rows) {
    const key = localDateKey(new Date(row.createdAt))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = localDateKey(d)
    out.push({ date: key, count: counts.get(key) ?? 0 })
  }
  return out
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

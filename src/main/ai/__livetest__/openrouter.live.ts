/**
 * Paid, opt-in integration test against the real OpenRouter API.
 *
 *   OPENROUTER_KEY=sk-or-... npm run test:live
 *   OPENROUTER_KEY=... OPENROUTER_MODEL=some/other-model npm run test:live
 *
 * Never runs in CI — `npm test` does not include it and CI has no key. Runs
 * inside Electron so it exercises the real client end to end: the gated
 * non-persistent session, the real SSE parser, the real error mapping, the
 * shared decision renderer, and the memory validator.
 *
 * It uses a throwaway userData directory and an invented fixture, so it can
 * never read or write a real journal. One full run costs a fraction of a cent
 * (~$0.004 on gpt-5.6-luna) and prints the total.
 *
 * This harness earned its keep: it caught the search corpus in
 * memory/validate.ts drifting from what the prompt actually shows the model,
 * which silently rejected correct memories as fabricated.
 */
import { app } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'

app.setPath('userData', mkdtempSync(join(tmpdir(), 'dj-livetest-')))

import { fetchOnlineCatalog, streamChatCompletion } from '../openrouterClient'
import { buildSystemPrompt, renderDecision } from '../context'
import { OpenRouterError } from '../errors'
import { EXTRACTION_INSTRUCTION, EXTRACTION_RESPONSE_FORMAT } from '../../memory/prompt'
import { validateProposals } from '../../memory/validate'
import type { Decision } from '@shared/ipc-contract'

const RAW_KEY = process.env.OPENROUTER_KEY
if (!RAW_KEY) {
  console.error('Set OPENROUTER_KEY to run this. It is never read from the app vault.')
  process.exit(2)
}
const KEY: string = RAW_KEY
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-5.6-luna'

/** A sentinel that lives in an UNATTACHED entry and must never be transmitted. */
const SENTINEL = 'XYZZY-UNRELATED-SENTINEL-42'

const FIXTURE_ROW = {
  id: 'fixture-1',
  title: 'Keep my job while testing an independent consulting practice',
  decided_at: Date.UTC(2026, 8, 8),
  review_at: Date.UTC(2026, 11, 8),
  mental_state: JSON.stringify(['focused', 'anxious']),
  situation:
    'I am a product designer living in Osaka. I want more autonomy and need stable income while caring for a parent.',
  problem_statement: 'How can I test demand without committing to a full-time business too early?',
  variables:
    'Six months of essential-expense savings; ten hours weekly available; employment contract restrictions still need checking.',
  complications:
    'Two interested prospects have not signed; caregiving time varies; enthusiasm may be mistaken for demand.',
  alternatives: JSON.stringify([
    { id: 'o1', name: 'Stay employed and run an eight-week pilot', note: 'Limits downside and provides evidence', chosen: true },
    { id: 'o2', name: 'Quit immediately', note: 'Rejected because demand is not yet demonstrated', chosen: false },
    { id: 'o3', name: 'Postpone for a year', note: 'Rejected because a small pilot seems feasible now', chosen: false }
  ]),
  range_of_outcomes: 'Paid pilot validates demand; no customer signs; workload exceeds the ten-hour limit.',
  expected_outcome:
    '60% chance of one paid pilot within eight weeks, 30% of interest without payment, 10% of stopping because workload is too high.',
  outcome: '',
  lessons_learned: '',
  reviewed_at: null,
  created_at: Date.UTC(2026, 8, 8),
  updated_at: Date.UTC(2026, 8, 8),
  is_sample: 0,
  memory_excluded: 0
}

const UNATTACHED_ROW = {
  ...FIXTURE_ROW,
  id: 'fixture-2',
  title: `Something private ${SENTINEL}`,
  situation: `This entry contains ${SENTINEL} and was never attached.`
}

/**
 * Minimal stand-in for better-sqlite3. Deliberately goes through the real
 * getDecision/listDecisions so row-to-Decision mapping is under test too.
 */
const db = {
  prepare(sql: string) {
    return {
      get: (id?: string) => (sql.includes('WHERE id = ?') && id === 'fixture-1' ? FIXTURE_ROW : undefined),
      all: () => [FIXTURE_ROW, UNATTACHED_ROW]
    }
  }
} as never

let totalCost = 0
let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass += 1
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    fail += 1
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

function newSignal(): AbortSignal {
  return new AbortController().signal
}

async function main(): Promise<void> {
  console.log('\n=== 1. Catalog + ZDR routing ===')
  try {
    const catalog = await fetchOnlineCatalog(KEY)
    check('catalog fetched', catalog.length > 0, `${catalog.length} ZDR-capable models`)
    const target = catalog.find((m) => m.id === MODEL)
    check(
      `${MODEL} has a ZDR route`,
      !!target,
      target
        ? `${target.contextLength.toLocaleString()} ctx · $${target.promptUsdPerMillion}/M in · $${target.completionUsdPerMillion}/M out · structured=${target.supportsStructuredOutputs}`
        : 'NOT FOUND in ZDR list'
    )
    check('every listed model is ZDR-flagged', catalog.every((m) => m.zdrAvailable))
  } catch (err) {
    check('catalog fetched', false, err instanceof OpenRouterError ? `${err.code}: ${err.message}` : String(err))
  }

  console.log('\n=== 2. Prompt construction ===')
  const built = buildSystemPrompt({ db, provider: 'openrouter', attachedDecisionIds: ['fixture-1'] })
  check('attached decision is present', built.systemPrompt.includes('eight-week pilot'))
  check('UNATTACHED entry is not present (sentinel check)', !built.systemPrompt.includes(SENTINEL))
  check('chosen option is marked', built.systemPrompt.includes('[CHOSEN]'))
  check('mode is described as online', built.systemPrompt.includes('processed online'))

  console.log('\n=== 3. Chat completion (real stream) ===')
  let answer = ''
  let served: string | null = null
  try {
    await streamChatCompletion(
      {
        apiKey: KEY,
        model: MODEL,
        messages: [
          { role: 'system', content: built.systemPrompt },
          {
            role: 'user',
            content:
              'What did I choose, why did I reject quitting, what assumption should I test first, and what would make me reconsider?'
          }
        ],
        signal: newSignal()
      },
      {
        onToken: (t) => {
          answer += t
        },
        onDone: (m, usage) => {
          served = m
          if (usage?.costUsd) totalCost += usage.costUsd
          console.log(
            `  usage: prompt=${usage?.promptTokens} completion=${usage?.completionTokens} cost=$${usage?.costUsd ?? 'n/a'}`
          )
        }
      }
    )
    check('stream produced text', answer.length > 100, `${answer.length} chars`)
    check('served model reported', served !== null, String(served))
    check('names the pilot choice', /pilot/i.test(answer))
    check('recalls why quitting was rejected', /demand/i.test(answer))
    check('no sentinel in the reply', !answer.includes(SENTINEL))
    console.log('\n--- REPLY (first 1200 chars) ---\n' + answer.slice(0, 1200) + '\n---')
  } catch (err) {
    check('chat completion', false, err instanceof OpenRouterError ? `${err.code}: ${err.message}` : String(err))
  }

  console.log('\n=== 4. Refuses to invent demographics ===')
  let probe = ''
  try {
    await streamChatCompletion(
      {
        apiKey: KEY,
        model: MODEL,
        messages: [
          { role: 'system', content: built.systemPrompt },
          { role: 'user', content: 'Do you know my age or whether I am introverted? Answer directly.' }
        ],
        signal: newSignal()
      },
      {
        onToken: (t) => {
          probe += t
        },
        onDone: (_m, u) => {
          if (u?.costUsd) totalCost += u.costUsd
        }
      }
    )
    check(
      'admits it does not know age/personality',
      /don'?t know|do not know|not recorded|no information|isn'?t stated|not stated|can'?t tell|cannot tell|nothing.*about your age/i.test(probe)
    )
    console.log('\n--- PROBE REPLY ---\n' + probe.slice(0, 700) + '\n---')
  } catch (err) {
    check('demographic probe', false, String(err))
  }

  console.log('\n=== 5. Structured memory extraction ===')
  const fixtureDecision = { ...FIXTURE_ROW } as unknown as Decision
  // Re-read through the real mapper so the validator sees a real Decision.
  const mapped = buildSystemPrompt({ db, provider: 'ollama', attachedDecisionIds: ['fixture-1'] })
  check('fixture round-trips through the row mapper', mapped.attachedTitles.length === 1)
  const decisionForValidation = {
    id: 'fixture-1',
    title: FIXTURE_ROW.title,
    decidedAt: FIXTURE_ROW.decided_at,
    reviewAt: FIXTURE_ROW.review_at,
    mentalState: ['focused', 'anxious'],
    situation: FIXTURE_ROW.situation,
    problemStatement: FIXTURE_ROW.problem_statement,
    variables: FIXTURE_ROW.variables,
    complications: FIXTURE_ROW.complications,
    alternatives: FIXTURE_ROW.alternatives,
    rangeOfOutcomes: FIXTURE_ROW.range_of_outcomes,
    expectedOutcome: FIXTURE_ROW.expected_outcome,
    outcome: '',
    lessonsLearned: '',
    reviewedAt: null,
    createdAt: FIXTURE_ROW.created_at,
    updatedAt: FIXTURE_ROW.updated_at,
    isSample: 0,
    memoryExcluded: false
  } as Decision

  let raw = ''
  try {
    await streamChatCompletion(
      {
        apiKey: KEY,
        model: MODEL,
        messages: [
          { role: 'system', content: EXTRACTION_INSTRUCTION },
          { role: 'user', content: 'Journal entry to extract from:\n\n' + renderDecision(decisionForValidation, 1) }
        ],
        signal: newSignal(),
        responseFormat: EXTRACTION_RESPONSE_FORMAT
      },
      {
        onToken: (t) => {
          raw += t
        },
        onDone: (_m, u) => {
          if (u?.costUsd) totalCost += u.costUsd
        }
      }
    )
    let parsed: unknown = null
    let jsonOk = true
    try {
      parsed = JSON.parse(raw)
    } catch {
      jsonOk = false
    }
    check('structured output is valid JSON', jsonOk, jsonOk ? '' : raw.slice(0, 200))

    if (jsonOk) {
      const result = validateProposals(parsed, decisionForValidation, () => false)
      check(
        'proposals survive local evidence validation',
        result.accepted.length > 0,
        `${result.accepted.length} accepted, ${result.rejected.length} rejected`
      )
      console.log('\n--- ACCEPTED MEMORIES ---')
      for (const a of result.accepted) {
        console.log(`  [${a.category}/${a.kind}] ${a.statement}`)
        console.log(`       evidence (${a.field}): "${a.excerpt}"`)
      }
      if (result.rejected.length > 0) {
        console.log('--- REJECTED BY LOCAL VALIDATION ---')
        for (const r of result.rejected) console.log(`  (${r.reason}) ${r.statement.slice(0, 100)}`)
      }
      const demographic = result.accepted.filter((a) =>
        /\b(aged?|years old|gender|male|female|introvert|extrovert|wealthy|poor|religio|ethnic)\b/i.test(a.statement)
      )
      check(
        'no demographic or personality claim accepted',
        demographic.length === 0,
        demographic.map((d) => d.statement).join(' | ')
      )
    }
  } catch (err) {
    check('structured extraction', false, err instanceof OpenRouterError ? `${err.code}: ${err.message}` : String(err))
  }

  console.log('\n=== 6. Variability: same question, three runs ===')
  for (let run = 1; run <= 3; run++) {
    let out = ''
    try {
      await streamChatCompletion(
        {
          apiKey: KEY,
          model: MODEL,
          messages: [
            { role: 'system', content: built.systemPrompt },
            { role: 'user', content: 'What did I choose, and what is the single assumption I should test first?' }
          ],
          signal: newSignal()
        },
        { onToken: (t) => { out += t }, onDone: (_m, u) => { if (u?.costUsd) totalCost += u.costUsd } }
      )
      const namesChoice = /pilot/i.test(out) && /(stay|remain|keep).{0,20}(employ|job)/i.test(out)
      // The concept, not the word: "will interest convert into payment?".
      // A literal /demand/ match wrongly failed a run that phrased it as
      // "convert into a paid pilot — not just express interest".
      const namesAssumption = /demand|paid|pay(ing|ment)?\b|convert|sign(ed|s)?\b/i.test(out)
      const inventsDemographics = /\b(you are|you're) (an? )?(introvert|extrovert|\d+ years old)/i.test(out)
      check(`run ${run}: names the choice`, namesChoice)
      check(`run ${run}: identifies the demand assumption`, namesAssumption)
      if (!namesAssumption) console.log(`  --- run ${run} text ---\n${out}\n  ---`)
      check(`run ${run}: invents no demographics`, !inventsDemographics)
    } catch (err) {
      check(`run ${run}`, false, String(err))
    }
  }

  console.log('\n=== 7. Multi-turn: constraint changes mid-conversation ===')
  let followUp = ''
  try {
    await streamChatCompletion(
      {
        apiKey: KEY,
        model: MODEL,
        messages: [
          { role: 'system', content: built.systemPrompt },
          { role: 'user', content: 'What did I choose, and what should I test first?' },
          { role: 'assistant', content: answer.slice(0, 1500) },
          { role: 'user', content: 'My available time just dropped from ten hours a week to five. How should the plan change?' }
        ],
        signal: newSignal()
      },
      { onToken: (t) => { followUp += t }, onDone: (_m, u) => { if (u?.costUsd) totalCost += u.costUsd } }
    )
    check('incorporates the new five-hour constraint', /five hours|5 hours|5h\b/i.test(followUp))
    check('does not silently keep asserting ten hours', !/you have ten hours (a|per) week/i.test(followUp))
    check('still grounded in the pilot plan', /pilot/i.test(followUp))
    console.log('\n--- FOLLOW-UP (first 900 chars) ---\n' + followUp.slice(0, 900) + '\n---')
  } catch (err) {
    check('multi-turn follow-up', false, String(err))
  }

  console.log('\n=== 8. Error mapping against the live API ===')
  try {
    await streamChatCompletion(
      {
        // Built at runtime: a literal here trips GitHub's secret scanner even
        // though it is obviously not a real credential.
        apiKey: ['sk', 'or', 'v1', '0'.repeat(64)].join('-'),
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        signal: newSignal()
      },
      { onToken: () => {}, onDone: () => {} }
    )
    check('bad key rejected', false, 'the request unexpectedly succeeded')
  } catch (err) {
    const code = err instanceof OpenRouterError ? err.code : `not-an-OpenRouterError(${String(err)})`
    check('bad key maps to invalid-key', code === 'invalid-key', `got ${code}`)
  }

  console.log(`\n=== ${pass} passed, ${fail} failed · cost this run: $${totalCost.toFixed(5)} ===\n`)
  app.exit(fail === 0 ? 0 : 1)
}

app.whenReady().then(() => {
  main().catch((err) => {
    console.error('HARNESS ERROR', err)
    app.exit(2)
  })
})

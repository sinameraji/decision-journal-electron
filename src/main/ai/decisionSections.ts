/**
 * The single rendering of a decision.
 *
 * Both the prompt the model sees (`renderDecision`) and the corpus the memory
 * validator searches for quoted evidence are built from this. They must never
 * drift: if the model is shown a line the validator cannot search, a correct
 * quotation gets rejected as fabricated.
 */

import type { Decision } from '@shared/ipc-contract'
import { parseAlternatives } from '@shared/ipc-contract'

export function formatDate(ms: number | null): string {
  if (!ms) return 'not set'
  return new Date(ms).toISOString().slice(0, 10)
}

function renderOptions(raw: string): string {
  const parsed = parseAlternatives(raw)
  if (parsed.kind === 'empty') return ''
  if (parsed.kind === 'legacy') return parsed.text.trim()
  return parsed.options
    .map((o, i) => {
      const mark = o.chosen ? 'CHOSEN' : 'not chosen'
      const note = o.note.trim() ? ` — ${o.note.trim()}` : ''
      return `  ${i + 1}. [${mark}] ${o.name.trim()}${note}`
    })
    .join('\n')
}

/**
 * Label → rendered text, in the order it is shown to the model. Empty sections
 * are kept (rather than dropped) so the two consumers stay index-aligned;
 * callers filter them.
 */
export function decisionSections(d: Decision): Record<string, string> {
  const reviewed = d.reviewedAt !== null && (d.outcome.trim() !== '' || d.lessonsLearned.trim() !== '')

  return {
    title: d.title.trim(),
    'decision date': `Decided on: ${formatDate(d.decidedAt)}`,
    'review date': d.reviewAt ? `Review due: ${formatDate(d.reviewAt)}` : '',
    'mental state': d.mentalState.length
      ? `Mental state when deciding: ${d.mentalState.join(', ')}`
      : '',
    situation: d.situation.trim(),
    'problem statement': d.problemStatement.trim(),
    variables: d.variables.trim(),
    complications: d.complications.trim(),
    options: renderOptions(d.alternatives),
    'range of outcomes': d.rangeOfOutcomes.trim(),
    'expected outcome': d.expectedOutcome.trim(),
    'review date reached': reviewed ? `Reviewed on ${formatDate(d.reviewedAt)}` : '',
    outcome: reviewed ? d.outcome.trim() : '',
    'lessons learned': reviewed ? d.lessonsLearned.trim() : ''
  }
}

/** Human-readable labels used in the prompt, keyed by section. */
const PROMPT_LABELS: Record<string, string> = {
  title: '',
  'decision date': '',
  'review date': '',
  'mental state': '',
  situation: 'Situation',
  'problem statement': 'Problem statement',
  variables: 'Variables in play',
  complications: 'Complications',
  options: 'Options considered',
  'range of outcomes': 'Range of outcomes considered',
  'expected outcome': "Expected outcome (the user's own forecast, recorded before the result)",
  'review date reached': '',
  outcome: 'What actually happened',
  'lessons learned': 'Lesson the user drew'
}

/**
 * Renders one decision for a prompt, with review material clearly separated
 * from the original reasoning so hindsight is not presented as foresight.
 */
export function renderDecision(d: Decision, index: number): string {
  const s = decisionSections(d)
  const lines: string[] = [`--- Decision ${index}: ${s.title || '(untitled)'} ---`]

  const emit = (key: string): void => {
    const value = s[key]
    if (!value) return
    const label = PROMPT_LABELS[key]
    lines.push(label ? `${label}: ${value}` : value)
  }

  emit('decision date')
  emit('review date')
  emit('mental state')
  emit('situation')
  emit('problem statement')
  emit('variables')
  emit('complications')
  if (s.options) lines.push(`${PROMPT_LABELS.options}:\n${s.options}`)
  emit('range of outcomes')
  emit('expected outcome')

  if (s['review date reached']) {
    lines.push(
      `\n[Written later, at review — this was NOT known when the decision was made. ${s['review date reached']}]`
    )
    emit('outcome')
    emit('lessons learned')
  } else {
    lines.push('\n[Not reviewed yet — the outcome is still unknown.]')
  }

  return lines.join('\n')
}

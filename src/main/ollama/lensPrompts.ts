import type { Decision, DecisionOption, LensKind } from '@shared/ipc-contract'
import { parseAlternatives } from '@shared/ipc-contract'

function formatOptionsBlock(d: Decision): string {
  const parsed = parseAlternatives(d.alternatives)
  if (parsed.kind === 'structured' && parsed.options.length > 0) {
    return parsed.options
      .map((o: DecisionOption, i: number) => {
        const marker = o.chosen ? ' (CHOSEN)' : ''
        const name = o.name.trim() || `Option ${i + 1}`
        const note = o.note.trim() ? `\n    ${o.note.trim().replace(/\n/g, '\n    ')}` : ''
        return `  - ${name}${marker}${note}`
      })
      .join('\n')
  }
  if (parsed.kind === 'legacy') {
    return `  (free-text notes)\n    ${parsed.text.replace(/\n/g, '\n    ')}`
  }
  return '  (none listed)'
}

function formatMentalState(d: Decision): string {
  return d.mentalState.length > 0 ? d.mentalState.join(', ') : '(not specified)'
}

function formatDate(ms: number | null): string {
  if (ms == null) return '(not set)'
  return new Date(ms).toISOString().slice(0, 10)
}

function buildDecisionContext(d: Decision): string {
  return [
    `Title: ${d.title}`,
    `Decided at: ${formatDate(d.decidedAt)}`,
    `Review date: ${formatDate(d.reviewAt)}`,
    `Mental state when deciding: ${formatMentalState(d)}`,
    '',
    `Situation / context:\n${d.situation || '(empty)'}`,
    '',
    `Problem frame:\n${d.problemStatement || '(empty)'}`,
    '',
    `Variables governing the outcome:\n${d.variables || '(empty)'}`,
    '',
    `Complications:\n${d.complications || '(empty)'}`,
    '',
    `Options considered:\n${formatOptionsBlock(d)}`,
    '',
    `Range of outcomes:\n${d.rangeOfOutcomes || '(empty)'}`,
    '',
    `Expected outcome (with probabilities):\n${d.expectedOutcome || '(empty)'}`
  ].join('\n')
}

const LENS_INSTRUCTIONS: Record<LensKind, string> = {
  'opportunity-cost': `Analyze this decision through the **Opportunity Cost** lens.

Focus on what I'm giving up by picking the option I picked — the value of the next-best alternative I listed. Think in terms of:
1. What concrete value does the chosen option give up that the rejected options would have delivered?
2. Which hidden costs did I not mention in my write-up? (career optionality, relationships, learning velocity, time, money, energy, reputation, reversibility)
3. Point to ONE specific claim in my own write-up that deserves a harder push-back. Quote me back to myself.

End with a single pointed question that would make me uncomfortable in a useful way. Use markdown headings and keep it to four short sections.`,

  'pre-mortem': `Run a **Pre-mortem** on this decision.

Assume it is 12 months from now and this decision has clearly failed. Walk me through:
1. The 2–3 most likely failure modes, ranked by how plausible they are given what I wrote about my situation and mental state.
2. For each failure mode: the earliest observable warning sign I could look for between now and then.
3. One thing I could do THIS WEEK to de-risk the most likely failure mode without abandoning the decision.

Be concrete. Reference my own complications and variables. Do not hedge. Use markdown so I can scan it.`,

  'regret-minimization': `Run a **Regret Minimization** analysis (Bezos-style: project to the long term and look backward).

Project me ten years into the future, looking back at this decision. Address:
1. Which option, looking backward from ten years out, would I most likely regret NOT choosing? Give your reasoning from what I wrote.
2. Is the regret I should be minimizing short-term (next 1–2 years) or long-term (5+ years)? How do you know from my write-up?
3. Name one thing I'm weighting too heavily right now that a ten-years-older version of me would downweight.
4. One question the ten-years-older version would ask today's me.

Keep it human. Do not turn this into a spreadsheet. Markdown headings please.`,

  'counterparty-incentives': `Analyze this decision through the **Counterparty Incentives** lens.

I'm modeling this as a solo choice, but rarely is it one. Walk through:
1. Who else has real skin in this outcome? List them (people, teams, organizations, future selves).
2. For each counterparty: what are their incentives, and how do those incentives shift the actual payoff I should expect (not the one I wrote down)?
3. Which counterparty's incentives are most misaligned with mine, and how would that misalignment show up in the next 3–6 months?
4. One move I could make right now that accounts for the misalignment I am currently ignoring.

This is the game-theoretic lens. Be rigorous but plain-spoken. Use markdown.`
}

export function buildLensUserMessage(decision: Decision, kind: LensKind): string {
  const context = buildDecisionContext(decision)
  const instructions = LENS_INSTRUCTIONS[kind]
  return [
    "I'd like you to analyze the following decision I wrote down, using a specific lens. Stay inside the lens — don't give me a generic analysis, and don't summarize the decision back to me (I wrote it, I know what it says).",
    '',
    '--- DECISION ---',
    context,
    '',
    '--- LENS ---',
    instructions
  ].join('\n')
}

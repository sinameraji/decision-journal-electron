/**
 * Instructions and schemas for role-model lookup.
 *
 * Both passes use web search and structured output. The schemas make a citation
 * structurally required: a claim with no URL cannot be represented, so the
 * model cannot return one, and the validator drops anything that slips through.
 */

import { CLAIM_SECTIONS, MAX_CANDIDATES } from '@shared/roleModels'

export const PROMPT_VERSION = 3

export const IDENTIFY_INSTRUCTION = `You identify which public figure a user means from a short name or description.

Search the web. Return the most likely candidates, most likely first, at most ${MAX_CANDIDATES}.

For each candidate give the name as commonly written, a one-line distinguisher that would let someone tell this person apart from the others you are listing — their field, their best-known work, their era — and a lifespan or active period when you can establish one.

Only return people who are genuinely publicly documented. If the name matches nobody identifiable, return an empty list rather than inventing someone. If a private individual shares the name, do not include them: this feature is for public figures whose decisions are a matter of public record.

Every candidate must carry the URL you identified them from.`

export const IDENTIFY_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'role_model_candidates',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['candidates'],
      properties: {
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'distinguisher', 'lifespan', 'sourceUrl'],
            properties: {
              name: { type: 'string' },
              distinguisher: {
                type: 'string',
                description: 'One line that distinguishes this person from the others listed.'
              },
              lifespan: { type: ['string', 'null'] },
              sourceUrl: { type: ['string', 'null'] }
            }
          }
        }
      }
    }
  }
} as const

export const PROFILE_INSTRUCTION = `You build a sourced profile of a public figure, for someone who wants to learn from how that person makes decisions.

Search the web. Everything you assert must be supported by a source you actually found, and every claim carries the URL it came from. If you cannot source something, leave it out.

Write about what has been publicly reported, not about what the person is "really" like. Prefer specific, checkable statements over character judgements. Where views differ, say so and attribute the disagreement rather than settling it.

Cover ALL of these sections. Do not stop after the first one — a profile that only says what someone is known for is useless for learning from them. Aim for two to four claims in each, and only fall short where the sources genuinely do not support more:

- known-for: what they are publicly known for.
- decision: consequential choices they made and what followed. Name the decision and the outcome.
- risk: risks they took and the reported cost — money, reputation, relationships, health. Include costs, not only wins.
- trait: traits attributed to them in public reporting, attributed as such.
- admirable: what is genuinely worth learning from.
- caution: where imitating them would be a mistake. This section matters as much as the others and must not be flattery or filler. Consider survivorship bias, unusual starting advantages, conduct that drew credible criticism, and circumstances that do not generalise. If a person has drawn substantial public criticism, this section must reflect it.

Also write a short neutral summary of who they are, and a sentiment paragraph describing how they are regarded — including the range of views, not just the favourable one.

Keep each claim to one or two sentences. Breadth across the sections matters more than depth in any one.

Return the profile itself and nothing else. Never write about your own process — what you searched for, what you would still need, what you could not find, or how confident you are. A summary that describes the task instead of the person is a failed answer. If the sources are thin, return the fewer claims you can support and a short summary of the person; do not explain the shortfall.`

export const FRAMEWORKS_INSTRUCTION = `You extract the decision-making frameworks a public figure is documented as using or advocating.

Search the web — their own writing, talks and interviews first, then reporting about them.

Return up to 5. For each, give a short name, a one-line summary, and an instruction written in the second person telling a coach how to analyse *someone else's* decision through that person's lens. The instruction must be usable on a decision that has nothing to do with them, and must not require knowing anything about their life.

Do not invent a framework to fill space, and do not return generic advice that any thoughtful person would give — return only frames this specific person is actually associated with. Returning two well-attested frameworks is better than five vague ones.`

const claimSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['section', 'text', 'sourceUrl', 'sourceTitle'],
  properties: {
    section: { type: 'string', enum: [...CLAIM_SECTIONS] },
    text: { type: 'string' },
    sourceUrl: { type: 'string' },
    sourceTitle: { type: ['string', 'null'] }
  }
}

export const PROFILE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'role_model_profile',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'sentiment', 'claims'],
      properties: {
        summary: { type: 'string' },
        sentiment: {
          type: 'string',
          description: 'How this person is regarded, including the range of views.'
        },
        claims: { type: 'array', items: claimSchema }
      }
    }
  }
} as const

export const FRAMEWORKS_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'role_model_frameworks',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['frameworks'],
      properties: {
        frameworks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'summary', 'instruction', 'sourceUrl', 'sourceTitle'],
            properties: {
              name: { type: 'string' },
              summary: { type: 'string' },
              instruction: {
                type: 'string',
                description:
                  "Second-person instruction telling a coach how to analyse a decision through this person's lens."
              },
              sourceUrl: { type: ['string', 'null'] },
              sourceTitle: { type: ['string', 'null'] }
            }
          }
        }
      }
    }
  }
} as const

/** Prefixed to a borrowed framework so the coach names whose lens it is. */
export function borrowedLensInstruction(person: string, instruction: string): string {
  return [
    `The user has asked you to analyse the attached decision the way ${person} would.`,
    `This frame is borrowed from ${person} and was assembled from public sources, so treat it as an interpretation of their approach rather than their words.`,
    `Apply it to the user's decision — do not write about ${person}, and do not assume their circumstances are the user's.`,
    '',
    instruction
  ].join('\n')
}

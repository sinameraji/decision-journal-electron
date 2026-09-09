/**
 * Instructions and schemas for role-model lookup.
 *
 * Both passes use web search and structured output. The schemas make a citation
 * structurally required: a claim with no URL cannot be represented, so the
 * model cannot return one, and the validator drops anything that slips through.
 */

import { CLAIM_SECTIONS, MAX_CANDIDATES } from '@shared/roleModels'

export const PROMPT_VERSION = 4

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

Go to the person first. Search their own essays, books, talks, interviews, letters, filings and official transcripts before you search commentary about them, and prefer a claim you can ground in their own words or their documented actions over one grounded in someone's opinion of them. People worth studying are usually polarising, so second-hand characterisation often says more about the commentator than the subject. Mark each claim "primary" when the source is the person's own words or their own published work, and "secondary" when it is anyone else writing about them. Be honest about which it is — a mislabelled source is worse than a missing one.

Write about what has been publicly reported, not about what the person is "really" like. Prefer specific, checkable statements over character judgements. Where views differ, say so and attribute the disagreement rather than settling it.

Cover ALL of these sections. Do not stop after the first one — a profile that only says what someone is known for is useless for learning from them. Aim for two to four claims in each, and only fall short where the sources genuinely do not support more:

- known-for: what they are publicly known for.
- decision: consequential choices they made and what followed. Name the decision and the outcome.
- risk: risks they took and the reported cost — money, reputation, relationships, health. Include costs, not only wins.
- trait: traits evident from what they have said and done. Prefer their own self-description and their documented behaviour over someone else's characterisation.
- admirable: what is genuinely worth learning from.
- caution: where imitating them would be a mistake. This section matters as much as the others and must not be flattery or filler. Ground it wherever possible in the person's own account of their mistakes, in documented outcomes, and in the specifics of their circumstances — survivorship bias, unusual starting advantages, conditions that do not generalise. Where the caution rests on criticism from others, mark it secondary and attribute it to who said it rather than stating it as settled fact. Do not omit substantial criticism, and do not launder opinion into fact.

Also write a short neutral summary of who they are, and a sentiment paragraph describing how they are regarded — including the range of views, not just the favourable one.

Keep each claim to one or two sentences. Breadth across the sections matters more than depth in any one.

Return the profile itself and nothing else. Never write about your own process — what you searched for, what you would still need, what you could not find, or how confident you are. A summary that describes the task instead of the person is a failed answer. If the sources are thin, return the fewer claims you can support and a short summary of the person; do not explain the shortfall.`

export const FRAMEWORKS_INSTRUCTION = `You extract the decision-making frameworks a public figure is documented as using or advocating.

Search the web — their own writing, talks and interviews first, then reporting about them. A framework is only worth borrowing if the person actually articulated or demonstrably practised it, so prefer their own formulation over someone else's summary of their thinking, and mark the source "primary" when it is their own words.

Return up to 5. For each, give a short name, a one-line summary, and an instruction written in the second person telling a coach how to analyse *someone else's* decision through that person's lens. The instruction must be usable on a decision that has nothing to do with them, and must not require knowing anything about their life.

Do not invent a framework to fill space, and do not return generic advice that any thoughtful person would give — return only frames this specific person is actually associated with. Returning two well-attested frameworks is better than five vague ones.`

const claimSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['section', 'text', 'sourceUrl', 'sourceTitle', 'sourceType'],
  properties: {
    section: { type: 'string', enum: [...CLAIM_SECTIONS] },
    text: { type: 'string' },
    sourceUrl: { type: 'string' },
    sourceTitle: { type: ['string', 'null'] },
    sourceType: {
      type: 'string',
      enum: ['primary', 'secondary'],
      description:
        "primary = the person's own words or published work; secondary = anyone else writing about them."
    }
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
            required: ['name', 'summary', 'instruction', 'sourceUrl', 'sourceTitle', 'sourceType'],
            properties: {
              name: { type: 'string' },
              summary: { type: 'string' },
              instruction: {
                type: 'string',
                description:
                  "Second-person instruction telling a coach how to analyse a decision through this person's lens."
              },
              sourceUrl: { type: ['string', 'null'] },
              sourceTitle: { type: ['string', 'null'] },
              sourceType: { type: 'string', enum: ['primary', 'secondary'] }
            }
          }
        }
      }
    }
  }
} as const

export const SOURCE_INSTRUCTION = `You read one specific piece written or spoken by a public figure, and extract what it adds to an existing profile of how that person makes decisions.

The user has given you a URL. Retrieve it and work from what it actually says. If you cannot retrieve it, return nothing rather than writing from memory of the person — a fabricated reading of a source the user chose is worse than an empty result.

Everything you return must be supported by this specific document, and must cite it. Because it is the person's own words, mark every item "primary".

You will be shown what the profile already contains. Return only what this document ADDS — a claim that restates something already there is noise. If the document contradicts an existing claim, say so as a new claim rather than silently replacing it.

Extract at most 6 claims across the sections, and at most 3 frameworks, and fewer if the document does not support more. A short essay may yield one good claim and no frameworks; that is a fine answer.

Do not describe your process, the document's structure, or what you would need — return the extraction itself.`

export const SOURCE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'role_model_source_extraction',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['retrieved', 'title', 'claims', 'frameworks'],
      properties: {
        retrieved: {
          type: 'boolean',
          description: 'False if the document could not actually be read.'
        },
        title: { type: ['string', 'null'] },
        claims: { type: 'array', items: claimSchema },
        frameworks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'summary', 'instruction', 'sourceUrl', 'sourceTitle', 'sourceType'],
            properties: {
              name: { type: 'string' },
              summary: { type: 'string' },
              instruction: { type: 'string' },
              sourceUrl: { type: ['string', 'null'] },
              sourceTitle: { type: ['string', 'null'] },
              sourceType: { type: 'string', enum: ['primary', 'secondary'] }
            }
          }
        }
      }
    }
  }
} as const

/**
 * Applies a person's whole toolkit rather than one frame.
 *
 * Handing over five frames at once invites a shallow pass at each, so the
 * instruction asks for the ones that actually bite on this decision and for the
 * coach to name which it is using — the value is in seeing which of someone's
 * habits of thought apply here, not in a checklist.
 */
export function borrowedPersonInstruction(
  person: string,
  frameworks: { name: string; instruction: string }[]
): string {
  const listed = frameworks
    .map((f, i) => `${i + 1}. ${f.name}\n${f.instruction}`)
    .join('\n\n')
  return [
    `The user has asked you to analyse the attached decision the way ${person} would, using the whole of how they think rather than one frame.`,
    `These frames were assembled from public sources, so treat them as an interpretation of their approach rather than their words.`,
    `Work through the frames that genuinely bite on this decision — usually two or three, not all of them — and name which you are applying as you go. Say explicitly if one of them does not apply here, and why. Do not write about ${person}, and do not assume their circumstances are the user's.`,
    '',
    listed
  ].join('\n')
}

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

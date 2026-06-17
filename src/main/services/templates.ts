import type { ProjectType } from '@shared/types'
import { OVERLAY_LABELS, type StructureOverlay } from '@shared/api'

/** A node in a starter-template tree. Documents may carry placeholder body text. */
export interface TemplateNode {
  type: 'folder' | 'document'
  title: string
  synopsis?: string
  isSpecial?: boolean
  /** Placeholder paragraphs for documents (kept light — fully editable). */
  body?: string[]
  children?: TemplateNode[]
}

/** Journalism types ship with the fact-check workflow enabled. */
export function factCheckDefault(type: ProjectType): boolean {
  return type === 'journalism-short' || type === 'journalism-long'
}

function sheet(title: string, fields: string[]): TemplateNode {
  return { type: 'document', title, body: fields }
}

const STRUCTURE_BEATS: Record<StructureOverlay, Array<[string, string]>> = {
  'three-act': [
    ['Act I — Setup', 'Establish the ordinary world, the protagonist, and the stakes.'],
    ['Inciting Incident', 'The event that disrupts the status quo and starts the story.'],
    ['Plot Point 1', 'The protagonist commits; we cross into Act II.'],
    ['Act II — Rising Action', 'Escalating obstacles; the protagonist adapts.'],
    ['Midpoint', 'A reversal or revelation that raises the stakes.'],
    ['Plot Point 2', 'The lowest point; everything seems lost.'],
    ['Act III — Climax', 'The final confrontation and its resolution.'],
    ['Resolution', 'The new normal; threads tie off.']
  ],
  'seven-point': [
    ['Hook', 'The starting state, opposite of the resolution.'],
    ['Plot Turn 1', 'The call to adventure; move toward the midpoint.'],
    ['Pinch Point 1', 'Apply pressure; reveal the antagonistic force.'],
    ['Midpoint', 'Shift from reaction to action.'],
    ['Pinch Point 2', 'Greater pressure; things look dire.'],
    ['Plot Turn 2', 'The protagonist gets the final piece they need.'],
    ['Resolution', 'The payoff; the opposite of the hook.']
  ],
  'heros-journey': [
    ['Ordinary World', 'Life before the adventure.'],
    ['Call to Adventure', 'The challenge presents itself.'],
    ['Refusal of the Call', 'Hesitation and fear.'],
    ['Meeting the Mentor', 'Guidance and gifts.'],
    ['Crossing the Threshold', 'Commitment to the journey.'],
    ['Tests, Allies, Enemies', 'Learning the rules of the new world.'],
    ['Approach', 'Preparing for the central ordeal.'],
    ['The Ordeal', 'The greatest fear; a brush with death.'],
    ['Reward', 'Seizing the prize.'],
    ['The Road Back', 'Driven to complete the journey.'],
    ['Resurrection', 'The final test; transformation.'],
    ['Return with the Elixir', 'Home, changed, with something to share.']
  ],
  'save-the-cat': [
    ['Opening Image', 'A snapshot of the world before.'],
    ['Theme Stated', 'What the story is really about.'],
    ['Set-Up', 'Introduce the world and what needs fixing.'],
    ['Catalyst', 'The life-changing event.'],
    ['Debate', 'Should they go?'],
    ['Break into Two', 'The choice to enter the new world.'],
    ['B Story', 'The secondary, often relational, thread.'],
    ['Fun and Games', 'The promise of the premise.'],
    ['Midpoint', 'A false victory or false defeat.'],
    ['Bad Guys Close In', 'Pressure mounts within and without.'],
    ['All Is Lost', 'The lowest point.'],
    ['Dark Night of the Soul', 'The darkest hour before the dawn.'],
    ['Break into Three', 'The solution emerges.'],
    ['Finale', 'Applying the lesson; the climax.'],
    ['Final Image', 'The opposite of the opening image.']
  ],
  'nf-narrative': [
    ['Opening Scene', 'Drop the reader into a vivid, concrete moment.'],
    ['The Question', 'The driving question or tension the book pursues.'],
    ['Background & Stakes', 'What the reader must know, and why it matters.'],
    ['Rising Complication', 'Developments that deepen the problem.'],
    ['Turning Point', 'The pivotal discovery or shift.'],
    ['Climax', 'The decisive moment everything has built toward.'],
    ['Resolution', 'How it settles.'],
    ['Takeaway', 'What it all means for the reader.']
  ],
  'nf-argument': [
    ['Thesis', 'The central claim, in one sentence.'],
    ['Why Now', 'The urgency — why this argument, this moment.'],
    ['The Problem', 'The status quo or assumption you are challenging.'],
    ['Evidence & Cases', 'Data, stories, and examples that carry the claim.'],
    ['Counterarguments', 'Steelman the other side, then answer it.'],
    ['Synthesis', 'Bring the threads into a coherent whole.'],
    ['Call to Action', 'What the reader should now do or believe.']
  ],
  'nf-prescriptive': [
    ['The Promise', 'The transformation the book offers.'],
    ['The Problem', "What is keeping the reader stuck."],
    ['The Framework', 'Your core model or guiding principles.'],
    ['The Steps', 'The method, broken into ordered moves.'],
    ['Examples', 'Worked cases that prove the method.'],
    ['Pitfalls', 'Common mistakes and how to avoid them.'],
    ['Action Plan', "The reader's concrete next steps."]
  ],
  'news-inverted-pyramid': [
    ['Lede', 'The who/what/when/where/why in a sentence or two.'],
    ['Key Details', 'The most newsworthy facts, in order.'],
    ['Context', 'Background that frames the news.'],
    ['Supporting Quotes', 'Attribution and reaction.'],
    ['Minor Details', 'Least essential material — safe to cut from the bottom.']
  ],
  'feature-anatomy': [
    ['Lede', 'A scene or anecdote that pulls the reader in.'],
    ['Nut Graf', 'Why this story, why now — the point of it.'],
    ['Context', 'Background and stakes.'],
    ['Body', 'The reporting, in scenes or movements.'],
    ['Voices', 'Key quotes and characters.'],
    ['Counterpoint', 'Tension, complication, the other view.'],
    ['Kicker', 'A closing line that resonates.']
  ],
  'diss-standard': [
    ['Abstract', 'A concise summary of the whole.'],
    ['Introduction', 'Problem, aims, and significance.'],
    ['Literature Review', "What is known, and the gap you fill."],
    ['Methodology', 'How you investigated.'],
    ['Results', 'What you found.'],
    ['Discussion', 'What it means; limitations.'],
    ['Conclusion', 'Contributions and future work.'],
    ['References', 'Works cited.'],
    ['Appendices', 'Supplementary material.']
  ],
  'diss-imrad': [
    ['Introduction', 'Question and rationale.'],
    ['Methods', 'Design and procedure.'],
    ['Results', 'Findings, without interpretation.'],
    ['Discussion', 'Interpretation and implications.'],
    ['References', 'Works cited.']
  ]
}

function overlayFolder(overlay: StructureOverlay): TemplateNode {
  return {
    type: 'folder',
    title: `Outline — ${OVERLAY_LABELS[overlay]}`,
    synopsis: 'Structural placeholders. Keep, rearrange, or discard.',
    children: STRUCTURE_BEATS[overlay].map(([title, synopsis]) => ({
      type: 'document',
      title,
      synopsis
    }))
  }
}

function novelTemplate(novella: boolean): TemplateNode[] {
  const nodes: TemplateNode[] = [
    {
      type: 'folder',
      title: 'Manuscript',
      isSpecial: true,
      synopsis: 'The draft itself. Compile pulls from here, in order.',
      children: [
        {
          type: 'folder',
          title: 'Chapter One',
          children: [{ type: 'document', title: 'Scene', synopsis: 'Opening scene.' }]
        }
      ]
    },
    {
      type: 'folder',
      title: 'Characters',
      children: [
        sheet('Protagonist', ['Name:', 'Role:', 'Wants:', 'Needs:', 'Flaw:', 'Arc:'])
      ]
    },
    {
      type: 'folder',
      title: 'Settings',
      children: [sheet('Setting', ['Place:', 'Time period:', 'Mood:', 'Sensory details:'])]
    },
    { type: 'document', title: 'Timeline', synopsis: 'Chronology of events.' },
    { type: 'folder', title: 'Research', synopsis: 'Captured sources and notes.' }
  ]
  if (!novella) {
    // Full novels get a notes doc for series/worldbuilding scope.
    nodes.push({ type: 'document', title: 'Notes', body: [''] })
  }
  return nodes
}

function shortStoryTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Manuscript',
      isSpecial: true,
      children: [{ type: 'document', title: 'Story', synopsis: 'Single-arc draft.' }]
    },
    { type: 'document', title: 'Notes', body: [''] }
  ]
}

function nonfictionTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Proposal',
      synopsis: 'The selling apparatus an agent or editor reads first.',
      children: [
        { type: 'document', title: 'Overview', synopsis: 'The hook and argument of the book.' },
        sheet('Author Bio', ['Why you, why now:', 'Credentials:', 'Platform:']),
        {
          type: 'document',
          title: 'Comparable Titles',
          synopsis: 'Recent comps and how yours differs.'
        },
        { type: 'document', title: 'Market & Platform', synopsis: 'Audience, reach, channels.' },
        {
          type: 'document',
          title: 'Annotated Table of Contents',
          synopsis: 'Chapter-by-chapter summary.'
        },
        { type: 'folder', title: 'Sample Chapters' }
      ]
    },
    {
      type: 'folder',
      title: 'Manuscript',
      isSpecial: true,
      children: [
        {
          type: 'folder',
          title: 'Chapter 1',
          children: [{ type: 'document', title: 'Section', synopsis: '' }]
        }
      ]
    },
    { type: 'document', title: 'Bibliography', synopsis: 'Works cited.' },
    { type: 'folder', title: 'Research' }
  ]
}

function journalismShortTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Story',
      isSpecial: true,
      children: [
        { type: 'document', title: 'Headline', synopsis: 'Working title.' },
        { type: 'document', title: 'Dek', synopsis: 'Subhead / standfirst.' },
        { type: 'document', title: 'Lede', synopsis: 'The opening.' },
        { type: 'document', title: 'Nut Graf', synopsis: 'Why this matters, now.' },
        { type: 'document', title: 'Body', synopsis: 'The reporting.' },
        { type: 'document', title: 'Kicker', synopsis: 'The closing line.' }
      ]
    },
    { type: 'folder', title: 'Sources', synopsis: 'Source index for fact-checking.' },
    { type: 'document', title: 'Notes', body: [''] }
  ]
}

function journalismLongTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Feature',
      isSpecial: true,
      children: [
        { type: 'document', title: 'Lede', synopsis: 'Scene-setting opening.' },
        { type: 'document', title: 'Nut Graf', synopsis: 'The stakes and the argument.' },
        { type: 'document', title: 'Section', synopsis: 'A scene or movement.' },
        { type: 'document', title: 'Kicker', synopsis: 'The ending.' }
      ]
    },
    { type: 'folder', title: 'Sources', synopsis: 'Source index for fact-checking.' },
    {
      type: 'folder',
      title: 'Subjects',
      children: [sheet('Subject', ['Name:', 'Role:', 'Contact:', 'On/off record:'])]
    },
    { type: 'document', title: 'Timeline', synopsis: 'Chronology of events.' },
    { type: 'document', title: 'Notes', body: [''] }
  ]
}

function dissertationTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Front Matter',
      children: [
        { type: 'document', title: 'Abstract', synopsis: 'Concise summary.' },
        { type: 'document', title: 'Table of Contents', synopsis: 'Generated at compile.' },
        { type: 'document', title: 'List of Figures' },
        { type: 'document', title: 'List of Tables' }
      ]
    },
    {
      type: 'folder',
      title: 'Body',
      isSpecial: true,
      children: [
        { type: 'document', title: 'Introduction', synopsis: 'Problem and aims.' },
        { type: 'document', title: 'Literature Review', synopsis: 'Prior work.' },
        { type: 'document', title: 'Methodology', synopsis: 'Approach and methods.' },
        { type: 'document', title: 'Results', synopsis: 'Findings.' },
        { type: 'document', title: 'Discussion', synopsis: 'Interpretation.' },
        { type: 'document', title: 'Conclusion', synopsis: 'Contributions and future work.' }
      ]
    },
    { type: 'document', title: 'References', synopsis: 'Bibliography (citation style applied at compile).' }
  ]
}

function baseTemplate(type: ProjectType): TemplateNode[] {
  switch (type) {
    case 'novel':
      return novelTemplate(false)
    case 'novella':
      return novelTemplate(true)
    case 'short-story':
      return shortStoryTemplate()
    case 'nonfiction-book':
      return nonfictionTemplate()
    case 'journalism-short':
      return journalismShortTemplate()
    case 'journalism-long':
      return journalismLongTemplate()
    case 'dissertation':
      return dissertationTemplate()
    default:
      return shortStoryTemplate()
  }
}

export function getTemplate(type: ProjectType, overlay?: StructureOverlay | null): TemplateNode[] {
  const nodes = baseTemplate(type)
  // Drop the optional planning outline near the top, beneath the first folder.
  if (overlay && STRUCTURE_BEATS[overlay]) {
    nodes.splice(Math.min(1, nodes.length), 0, overlayFolder(overlay))
  }
  return nodes
}

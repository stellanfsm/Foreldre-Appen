import { describe, expect, it } from 'vitest'
import type { PortalEventProposal, PortalProposalItem, PortalTaskProposal } from '../../features/tankestrom/types'
import {
  applyCupWeekendEmbeddedScheduleMerge,
  normalizeEmbeddedScheduleParentDisplayTitle,
} from '../tankestromCupEmbeddedScheduleMerge'

function ev(
  id: string,
  date: string,
  title: string,
  start: string,
  end: string,
  personId = 'child-1'
): PortalEventProposal {
  return {
    proposalId: id,
    kind: 'event',
    sourceId: 'src',
    originalSourceType: 'text',
    confidence: 0.9,
    event: { date, personId, title, start, end, notes: '' },
  }
}

function task(id: string, date: string, title: string): PortalTaskProposal {
  return {
    proposalId: id,
    kind: 'task',
    sourceId: 'src',
    originalSourceType: 'text',
    confidence: 0.85,
    task: { date, title, notes: '', childPersonId: 'child-1', assignedToPersonId: '', dueTime: '' },
  }
}

describe('normalizeEmbeddedScheduleParentDisplayTitle', () => {
  it('fjerner «informasjon for helgen» og ukedag fra parent-tittel', () => {
    const { title, wasDayLikeTitle } = normalizeEmbeddedScheduleParentDisplayTitle(
      'Vårcupen 2026 – informasjon for helgen – fredag'
    )
    expect(wasDayLikeTitle).toBe(true)
    expect(title.toLowerCase()).toContain('vårcupen')
    expect(title).not.toMatch(/fredag/i)
    expect(title.toLowerCase()).not.toContain('informasjon for helgen')
  })
})

describe('applyCupWeekendEmbeddedScheduleMerge', () => {
  it('slår sammen tre helge-eventer med cup-signal til ett parent med embeddedSchedule', () => {
    const items: PortalProposalItem[] = [
      ev('e1', '2026-06-12', 'Vårcupen 2026 — oppmøte', '17:45', '18:15'),
      ev('e2', '2026-06-12', 'Kamp', '18:40', '20:00'),
      ev('e3', '2026-06-13', 'Kamp', '09:20', '10:30'),
      task('t1', '2026-06-10', 'Svar i Spond senest mandag'),
    ]
    const out = applyCupWeekendEmbeddedScheduleMerge(items, { sourceText: 'Velkommen til cup' })
    const events = out.filter((i): i is PortalEventProposal => i.kind === 'event')
    const tasksOut = out.filter((i): i is PortalTaskProposal => i.kind === 'task')
    expect(events).toHaveLength(1)
    expect(tasksOut).toHaveLength(1)
    const parent = events[0]!
    expect(parent.event.title).toContain('Vårcupen')
    expect(parent.event.metadata?.isAllDay).toBe(true)
    expect(parent.event.metadata?.endDate).toBe('2026-06-13')
    const sched = parent.event.metadata?.embeddedSchedule as { length: number } | undefined
    expect(sched?.length).toBe(3)
  })

  it('gjør ingenting uten cup/turnering-signal', () => {
    const items: PortalProposalItem[] = [
      ev('e1', '2026-06-12', 'Trening', '17:45', '18:15'),
      ev('e2', '2026-06-13', 'Trening', '09:20', '10:30'),
      ev('e3', '2026-06-14', 'Trening', '10:00', '11:00'),
    ]
    const out = applyCupWeekendEmbeddedScheduleMerge(items)
    expect(out.filter((i) => i.kind === 'event')).toHaveLength(3)
  })

  it('gjør ingenting for ukedag-eventer (ikke fre–søn)', () => {
    const items: PortalProposalItem[] = [
      ev('e1', '2026-06-10', 'Cup møte', '17:00', '18:00'),
      ev('e2', '2026-06-11', 'Cup kamp', '17:00', '18:00'),
      ev('e3', '2026-06-12', 'Cup kamp', '17:00', '18:00'),
    ]
    const out = applyCupWeekendEmbeddedScheduleMerge(items, { sourceText: 'turnering' })
    expect(out.filter((i) => i.kind === 'event')).toHaveLength(3)
  })

  it('markerer betinget segment fra tekst', () => {
    const items: PortalProposalItem[] = [
      ev('e1', '2026-06-12', 'Vårcup', '10:00', '11:00'),
      ev('e2', '2026-06-13', 'Kamp', '09:00', '10:00'),
      ev('e3', '2026-06-14', 'Eventuell sluttspillkamp', '11:00', '12:00'),
    ]
    const out = applyCupWeekendEmbeddedScheduleMerge(items)
    const parent = out.find((i): i is PortalEventProposal => i.kind === 'event')!
    const sched = parent.event.metadata?.embeddedSchedule as Array<{ isConditional?: boolean; title: string }>
    expect(sched.some((s) => s.isConditional)).toBe(true)
  })
})

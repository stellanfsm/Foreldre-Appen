import { describe, expect, it } from 'vitest'
import type { EmbeddedScheduleSegment } from '../../types'
import { presentEmbeddedChildNotesForReview } from '../tankestromEmbeddedChildNotesPresentation'

describe('presentEmbeddedChildNotesForReview', () => {
  it('samler klokkeslett, sorterer stigende og skiller notater', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Cup-dag',
      start: '10:00',
      end: '11:00',
      notes: [
        'Høydepunkter:',
        '15:10 Kamp',
        '09:20 Kamp',
        '17:45 Oppmøte',
        '',
        'Notater:',
        'Oppmøte 45 minutter før hver kamp',
        'Ta med mat',
      ].join('\n'),
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      parentCardTitle: 'Stor cup 2026',
      displayTitle: 'Cup-dag',
      childProposalId: 'test-1',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    const times = p.highlights.map((h) => h.displayTime)
    expect(times.slice().sort()).toEqual([...times].sort())
    expect(times[0]).toMatch(/^09:20/)
    expect(times[times.length - 1]).toMatch(/17:45/)
    expect(p.noteLines.some((l) => l.includes('mat'))).toBe(true)
    expect(p.noteLines.some((l) => l.includes('Oppmøte 45'))).toBe(true)
  })

  it('viser ikke høydepunkter-blokk når eneste punkt er trivial «—» etter tom etikett', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'X',
      notes: '12:00',
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'X',
      childProposalId: 'test-2',
    })
    expect(p?.mode).toBe('plain')
  })

  it('fjerner notatlinje som dupliserer highlight (samme klokkereste)', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Kamp',
      notes: ['09:20 Kamp', '09:20 Kamp', 'Husk drikke'].join('\n'),
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Kamp',
      childProposalId: 'test-3',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.highlights).toHaveLength(1)
    expect(p.noteLines).toEqual(['Husk drikke'])
  })
})

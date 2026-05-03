import { describe, expect, it } from 'vitest'
import type { EmbeddedScheduleSegment } from '../../types'
import {
  presentEmbeddedChildNotesForReview,
  tryDeriveOppmoteStartFromSegmentNotes,
} from '../tankestromEmbeddedChildNotesPresentation'

describe('presentEmbeddedChildNotesForReview', () => {
  it('samler klokkeslett fra notat, sorterer stigende; dropper segment-vindu når notat har tider', () => {
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
    expect(p.highlights).toHaveLength(3)
    const times = p.highlights.map((h) => h.timeStart)
    expect(times).toEqual(['09:20', '15:10', '17:45'])
    expect(p.highlights.some((h) => h.displayTime.includes('10:00'))).toBe(false)
    expect(p.noteLines.some((l) => l.includes('mat'))).toBe(true)
    expect(p.noteLines.some((l) => l.includes('Oppmøte 45'))).toBe(true)
  })

  it('undertrykker bred segmenttid når notat har mer konkret klokkeslett', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-07',
      title: 'Finale',
      start: '17:45',
      end: '18:45',
      notes: 'Kampstart kl. 18:40. Husk drikke.',
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Finale',
      childProposalId: 'test-seg-suppress',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.highlights).toHaveLength(1)
    expect(p.highlights[0]!.timeStart).toBe('18:40')
    expect(p.noteLines.some((l) => l.toLowerCase().includes('husk'))).toBe(true)
  })

  it('parser «Kamp kl. 09:20» som highlight', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Dag 1',
      notes: 'Kamp kl. 09:20',
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Dag 1',
      childProposalId: 'test-kl',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.highlights[0]!.timeStart).toBe('09:20')
    expect(normalizeLabel(p.highlights[0]!.label)).toContain('kamp')
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

  it('dedupliserer semantisk like highlights med og uten Høydepunkter-prefiks', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Dag',
      notes: ['18:40 Høydepunkter: Første kamp', '18:40 Første kamp'].join('\n'),
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Dag',
      childProposalId: 'test-dedupe-sem',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.highlights).toHaveLength(1)
    expect(p.highlights[0]!.label.toLowerCase()).toContain('første kamp')
    expect(p.highlights[0]!.label.toLowerCase()).not.toContain('høydepunkt')
  })

  it('fjerner ledende Notater: fra notatlinjer', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Dag',
      notes: ['15:00 Kamp', '', 'Notater: Det kan bli kaldt.'].join('\n'),
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Dag',
      childProposalId: 'test-notat-strip',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.noteLines.some((l) => l.toLowerCase().includes('notater:'))).toBe(false)
    expect(p.noteLines.some((l) => l.toLowerCase().includes('kaldt'))).toBe(true)
  })

  it('utleder oppmøte når teksten har minutter før og forankret første kamp-tid', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Dag',
      notes: 'Oppmøte 55 minutter før kampstart. Første kamp kl. 18:40.',
    }
    const d = tryDeriveOppmoteStartFromSegmentNotes(seg, { childProposalId: 'derive-1' })
    expect(d?.displayClock).toBe('17:45')
    expect(d?.anchorHm).toBe('18:40')
  })

  it('beholder segmenttid som highlight når notatet ikke har egne klokkeslett', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Trening',
      start: '16:00',
      end: '17:00',
      notes: 'Ta med ball og vann.',
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Trening',
      childProposalId: 'test-seg-only',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.highlights).toHaveLength(1)
    expect(p.highlights[0]!.displayTime).toContain('16:00')
  })
})

function normalizeLabel(s: string): string {
  return s.toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ').trim()
}

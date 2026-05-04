import { describe, expect, it } from 'vitest'
import type { EmbeddedScheduleSegment } from '../../types'
import {
  embeddedScheduleChildReviewListTimeClock,
  presentEmbeddedChildNotesForReview,
  resolveEmbeddedScheduleSegmentTimesForCalendarExport,
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

  it('fjerner gjentatte identiske notatlinjer (samme innhold to ganger)', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Cup-dag',
      start: '10:00',
      end: '11:00',
      notes: [
        'Høydepunkter:',
        '15:10 Kamp',
        '',
        'Notater:',
        'Oppmøte 45 minutter før hver kamp',
        'Oppmøte 45 minutter før hver kamp',
        'Det er meldt ustabilt vær.',
        'Det er meldt ustabilt vær.',
        'Ta med drikke',
      ].join('\n'),
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      parentCardTitle: 'Stor cup 2026',
      displayTitle: 'Cup-dag',
      childProposalId: 'test-dup-notes',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    const opp45 = p.noteLines.filter((l) => l.includes('Oppmøte 45'))
    const vær = p.noteLines.filter((l) => l.toLowerCase().includes('ustabilt'))
    expect(opp45).toHaveLength(1)
    expect(vær).toHaveLength(1)
  })

  it('viser ikke notatlinje som bare gjentar høydepunkt-tekst', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Kamp',
      notes: ['17:45 Oppmøte ved baneområdet', '', 'Notater:', 'Oppmøte ved baneområdet'].join('\n'),
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Kamp',
      childProposalId: 'test-note-dup-highlight',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.highlights.some((h) => h.timeStart === '17:45')).toBe(true)
    expect(p.noteLines.some((l) => l.toLowerCase().includes('baneområde'))).toBe(false)
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

  it('parser flere tider på én linje uten å krysse etiketter (Kamper kl. …)', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-07',
      title: 'Cup',
      notes: '09:20 Kamper kl. 15:10',
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Cup',
      childProposalId: 'test-multi-inline',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.highlights).toHaveLength(2)
    const byTime = [...p.highlights].sort((a, b) => a.timeStart.localeCompare(b.timeStart))
    expect(byTime[0]!.timeStart).toBe('09:20')
    expect(normalizeLabel(byTime[0]!.label)).toContain('kamper')
    expect(byTime[1]!.timeStart).toBe('15:10')
    expect(byTime[1]!.label.trim()).toBe('—')
  })

  it('tolker «Kamp kl. 09:20, neste kl. 15:10» med riktige etiketter per tid', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-07',
      title: 'Dag',
      notes: 'Kamp kl. 09:20, neste kl. 15:10',
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'Dag',
      childProposalId: 'test-multi-kl',
    })
    expect(p?.mode).toBe('structured')
    if (p?.mode !== 'structured') return
    expect(p.highlights).toHaveLength(2)
    const h09 = p.highlights.find((h) => h.timeStart === '09:20')
    const h15 = p.highlights.find((h) => h.timeStart === '15:10')
    expect(normalizeLabel(h09?.label ?? '')).toContain('kamp')
    expect(normalizeLabel(h15?.label ?? '')).toContain('neste')
  })

  it('ved bare flere klokkeslett uten tekst faller linjen til notat (trygt)', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-07',
      title: 'X',
      notes: '09:20  15:10',
    }
    const p = presentEmbeddedChildNotesForReview({
      seg,
      displayTitle: 'X',
      childProposalId: 'test-ambiguous-times',
    })
    expect(p?.mode).toBe('plain')
    if (p?.mode !== 'plain') return
    expect(p.notesText).toMatch(/09:20/)
    expect(p.notesText).toMatch(/15:10/)
  })

  it('skjuler segment slutt i review-klokke når slutt = første kamp og notat har relativt oppmøte', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-07',
      title: 'Finale',
      start: '17:45',
      end: '18:40',
      notes: 'Oppmøte 55 minutter før kampstart. Første kamp kl. 18:40.',
    }
    const c = embeddedScheduleChildReviewListTimeClock(seg)
    expect(c.clock).toBe('17:45')
    expect(c.durationSuppressedAsUnknown).toBe(true)
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

describe('resolveEmbeddedScheduleSegmentTimesForCalendarExport', () => {
  it('prioriterer avledet oppmøte og bruker konservativ slutt (60 min)', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Dag',
      start: '17:45',
      end: '18:40',
      notes: 'Oppmøte 55 minutter før kampstart. Første kamp kl. 18:40.',
    }
    const t = resolveEmbeddedScheduleSegmentTimesForCalendarExport(seg, { childProposalId: 'exp-1' })
    expect(t.start).toBe('17:45')
    expect(t.end).toBe('18:45')
    expect(t.embeddedScheduleChildExportTimePolicyUsed).toBe('derived_meeting_conservative_end')
    expect(t.embeddedScheduleChildExportDerivedMeetingTimeApplied).toBe(true)
  })

  it('undertrykker for bredt segment-vindu og bruker start + 60 min', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-07',
      title: 'Cup-dag',
      start: '08:00',
      end: '22:00',
      notes: 'Praktisk info uten konkrete klokkeslett som overstyrer.',
    }
    const t = resolveEmbeddedScheduleSegmentTimesForCalendarExport(seg)
    expect(t.start).toBe('08:00')
    expect(t.end).toBe('09:00')
    expect(t.embeddedScheduleChildExportTimePolicyUsed).toBe('broad_window_rejected_conservative_end')
  })

  it('bevarer kort segment-vindu når det er plausibelt', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Trening',
      start: '16:00',
      end: '17:00',
      notes: 'Ta med ball.',
    }
    const t = resolveEmbeddedScheduleSegmentTimesForCalendarExport(seg)
    expect(t.start).toBe('16:00')
    expect(t.end).toBe('17:00')
    expect(t.embeddedScheduleChildExportTimePolicyUsed).toBe('segment_pair_sanitized')
  })

  it('faller tilbake til standard-slot når segment-start er syntetisk', () => {
    const seg: EmbeddedScheduleSegment = {
      date: '2026-06-01',
      title: 'Dag',
      start: '06:00',
      end: '22:00',
      notes: 'Kort.',
    }
    const t = resolveEmbeddedScheduleSegmentTimesForCalendarExport(seg)
    expect(t.start).toBe('09:00')
    expect(t.end).toBe('10:00')
    expect(t.embeddedScheduleChildExportSyntheticTimeSkipped).toBe(true)
    expect(t.embeddedScheduleChildExportTimePolicyUsed).toBe('no_safe_segment_clock_default_slot')
  })
})

function normalizeLabel(s: string): string {
  return s.toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ').trim()
}

import { describe, expect, it } from 'vitest'
import type { PortalEventProposal, PortalProposalItem } from '../../features/tankestrom/types'
import {
  buildFlightCalendarTitle,
  dedupeNearDuplicateCalendarProposals,
} from '../tankestromImportDedupe'
import {
  buildImportClassificationContext,
  proposalItemQualifiesSecondaryZone,
} from '../tankestromSecondaryCandidates'

const travelBoardingPass = {
  type: 'flight',
  flightNumber: 'SK909',
  origin: 'New York',
  destination: 'London',
  departureTime: '08:30',
  arrivalTime: '11:30',
  passengerName: 'Jane Doe',
}

function flightEvent(
  proposalId: string,
  title: string,
  start: string,
  end: string,
  confidence = 0.88
): PortalEventProposal {
  return {
    proposalId,
    kind: 'event',
    sourceId: 'src-1',
    originalSourceType: 'boarding_pass',
    confidence,
    event: {
      date: '2025-06-10',
      personId: '',
      title,
      start,
      end,
      metadata: { travel: { ...travelBoardingPass } },
    },
  }
}

function primaryCalendarCount(items: PortalProposalItem[], ctx: ReturnType<typeof buildImportClassificationContext>) {
  const calendar = items.filter((i) => i.kind !== 'school_profile')
  return calendar.filter((it) => {
    if (it.kind !== 'event' && it.kind !== 'task') return true
    return !proposalItemQualifiesSecondaryZone(it, ctx)
  }).length
}

function initialEventSelectionCount(items: PortalProposalItem[], ctx: ReturnType<typeof buildImportClassificationContext>) {
  let n = 0
  for (const item of items) {
    if (item.kind === 'school_profile') continue
    if (item.kind === 'event' && !proposalItemQualifiesSecondaryZone(item, ctx)) n += 1
    if (item.kind === 'task' && !proposalItemQualifiesSecondaryZone(item, ctx)) n += 1
  }
  return n
}

describe('buildFlightCalendarTitle', () => {
  it('bruker tankestrek mellom byer', () => {
    expect(buildFlightCalendarTitle('New York', 'London')).toBe('Flyreise New York–London')
  })
})

describe('fly avreise + ankomst (boarding pass)', () => {
  it('slår sammen til ett forslag med semantisk tittel og riktig tidsrom', () => {
    const dep = flightEvent(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Flybillett New York–London – Avreise',
      '08:30',
      ''
    )
    const arr = flightEvent(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Flybillett New York–London – Ankomst',
      '11:30',
      ''
    )
    const out = dedupeNearDuplicateCalendarProposals([dep, arr])
    expect(out).toHaveLength(1)

    const ctx = buildImportClassificationContext({
      inputMode: 'file',
      provenanceSourceType: 'boarding_pass',
      sourceLength: 4000,
      calendarItemCount: out.length,
      secondaryCandidateCount: 0,
    })
    expect(primaryCalendarCount(out, ctx)).toBe(1)
    expect(initialEventSelectionCount(out, ctx)).toBe(1)

    const ev = out[0] as PortalEventProposal
    expect(ev.kind).toBe('event')
    expect(ev.event.title).toBe('Flyreise New York–London')
    expect(ev.event.start).toBe('08:30')
    expect(ev.event.end).toBe('11:30')
    const tr = ev.event.metadata?.travel as Record<string, unknown> | undefined
    expect(tr?.departureArrivalMerged).toBe(true)
  })

  it('fjerner ankomst når avreise allerede har slutt = ankomsttid', () => {
    const dep = flightEvent(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Fly – Avreise',
      '08:30',
      '11:30'
    )
    const arr = flightEvent(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Fly – Ankomst',
      '11:30',
      ''
    )
    const out = dedupeNearDuplicateCalendarProposals([dep, arr])
    expect(out).toHaveLength(1)
    const ev = out[0] as PortalEventProposal
    expect(ev.event.end).toBe('11:30')
    expect(ev.event.title).toBe('Flyreise New York–London')
  })

  it('ISO-tider i travel matcher HH:mm på event', () => {
    const dep = flightEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Avreise', '08:30', '')
    dep.event.metadata = {
      travel: {
        ...travelBoardingPass,
        departureTime: '2025-06-10T08:30:00',
        arrivalTime: '2025-06-10T11:30:00',
      },
    }
    const arr = flightEvent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Ankomst', '11:30', '')
    arr.event.metadata = { ...dep.event.metadata }
    const out = dedupeNearDuplicateCalendarProposals([dep, arr])
    expect(out).toHaveLength(1)
    expect((out[0] as PortalEventProposal).event.end).toBe('11:30')
  })

  it('ikke slå sammen ved motstridende sluttid på avreise', () => {
    const dep = flightEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Avreise', '08:30', '12:00')
    const arr = flightEvent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Ankomst', '11:30', '')
    const out = dedupeNearDuplicateCalendarProposals([dep, arr])
    expect(out).toHaveLength(2)
  })

  it('sammenslått fly forblir i hovedlisten ved middels confidence og lang dokumentmodus', () => {
    const dep = flightEvent(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Avreise',
      '08:30',
      '',
      0.45
    )
    const arr = flightEvent(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Ankomst',
      '11:30',
      '',
      0.45
    )
    const out = dedupeNearDuplicateCalendarProposals([dep, arr])
    expect(out).toHaveLength(1)
    const ctx = buildImportClassificationContext({
      inputMode: 'file',
      provenanceSourceType: 'uploaded_file',
      sourceLength: 8000,
      calendarItemCount: 2,
      secondaryCandidateCount: 0,
    })
    expect(ctx.isLongDocumentMode).toBe(true)
    expect(proposalItemQualifiesSecondaryZone(out[0]!, ctx)).toBe(false)
  })
})

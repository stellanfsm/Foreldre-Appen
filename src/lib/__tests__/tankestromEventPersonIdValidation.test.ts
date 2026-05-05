import { describe, expect, it } from 'vitest'
import { parsePortalImportProposalBundle } from '../tankestromApi'
import { requiresPersonForImport } from '../tankestromRequiresPerson'
import type { TankestromEventDraft } from '../../features/tankestrom/types'

const provenance = {
  sourceSystem: 'tankestrom' as const,
  sourceType: 'boarding_pass',
  generatedAt: '2026-05-05T12:00:00.000Z',
  importRunId: '00000000-0000-4000-8000-000000000001',
}

function eventItem(event: Record<string, unknown>) {
  return {
    proposalId: '11111111-1111-4111-8111-111111111111',
    kind: 'event' as const,
    sourceId: '22222222-2222-4222-8222-222222222222',
    originalSourceType: 'boarding_pass',
    confidence: 0.95,
    event,
  }
}

describe('Tankestrom event personId parsing', () => {
  it('does not throw "mangler eller tom streng for event.personId" when personId is null', () => {
    expect(() =>
      parsePortalImportProposalBundle({
        schemaVersion: '1.0.0',
        provenance,
        items: [
          eventItem({
            date: '2026-06-01',
            start: '10:00',
            end: '12:00',
            title: 'Flight SK123',
            personId: null,
            metadata: {
              travel: { type: 'flight', passengerName: 'John Doe' },
            },
          }),
        ],
      })
    ).not.toThrow(/event\.personId/)

    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [
        eventItem({
          date: '2026-06-01',
          start: '10:00',
          end: '12:00',
          title: 'Flight SK123',
          personId: null,
          metadata: {
            travel: { type: 'flight', passengerName: 'John Doe' },
            documentExtractedPersonName: 'John Doe',
            personMatchStatus: 'unmatched_document_name',
          },
        }),
      ],
    })
    const item = bundle.items[0]
    expect(item.kind).toBe('event')
    if (item.kind !== 'event') return
    expect(item.event.personId).toBe('')
    const meta = item.event.metadata as Record<string, unknown>
    expect(meta.travel).toEqual(
      expect.objectContaining({
        type: 'flight',
        passengerName: 'John Doe',
      })
    )
    expect(meta.personMatchStatus).toBe('unmatched_document_name')
    expect(meta.documentExtractedPersonName).toBe('John Doe')
  })

  it('lifts personMatchStatus from proposal item root into event metadata', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [
        {
          ...eventItem({
            date: '2026-06-01',
            start: '10:00',
            end: '12:00',
            title: 'Flight SK123',
            personId: null,
            metadata: { travel: { type: 'flight', passengerName: 'John Doe' } },
          }),
          personMatchStatus: 'unmatched_document_name',
          documentExtractedPersonName: 'John Doe',
        },
      ],
    })
    const item = bundle.items[0]
    expect(item.kind).toBe('event')
    if (item.kind !== 'event') return
    expect((item.event.metadata as Record<string, unknown>).personMatchStatus).toBe('unmatched_document_name')
    expect((item.event.metadata as Record<string, unknown>).documentExtractedPersonName).toBe('John Doe')
  })
})

describe('requiresPersonForImport', () => {
  const base: TankestromEventDraft = {
    title: 'X',
    date: '2026-06-01',
    start: '10:00',
    end: '11:00',
    personId: '',
    location: '',
    notes: '',
    includeRecurrence: false,
    dropoffBy: '',
    pickupBy: '',
  }

  it('returns false for flight travel type on draft', () => {
    expect(requiresPersonForImport({ ...base, travelImportType: 'flight' })).toBe(false)
  })

  it('returns false when personMatchStatus is unmatched_document_name', () => {
    expect(
      requiresPersonForImport({
        ...base,
        personMatchStatus: 'unmatched_document_name',
        importRequiresPerson: true,
      })
    ).toBe(false)
  })

  it('returns true only when importRequiresPerson is true and no exemption applies', () => {
    expect(
      requiresPersonForImport({
        ...base,
        personMatchStatus: 'matched',
        importRequiresPerson: true,
      })
    ).toBe(true)
    expect(
      requiresPersonForImport({
        ...base,
        personMatchStatus: 'matched',
      })
    ).toBe(false)
  })

  it('always requires person for manual calendar entry drafts', () => {
    expect(
      requiresPersonForImport({
        ...base,
        isManualCalendarEntry: true,
        travelImportType: 'flight',
        personMatchStatus: 'unmatched_document_name',
      })
    ).toBe(true)
  })
})

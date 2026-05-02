import { describe, expect, it } from 'vitest'
import type { PortalProposalItem } from '../../features/tankestrom/types'
import { dedupeNearDuplicateCalendarProposals } from '../tankestromImportDedupe'

describe('dedupeNearDuplicateCalendarProposals', () => {
  it('fjerner like hendelser med samme tittel uansett ukedag-prefiks', () => {
    const base = {
      proposalId: 'a1111111-1111-4111-8111-111111111111',
      kind: 'event' as const,
      sourceId: 'x',
      originalSourceType: 'text',
      confidence: 0.9,
      event: {
        date: '2026-05-15',
        personId: 'p1',
        title: 'fredag – Foreldre hjelp trengs til samlingspunkt og utstyr',
        start: '18:00',
        end: '19:00',
        notes: 'Fra: text\n\nTa med kopp',
      },
    }
    const dup: PortalProposalItem = {
      ...base,
      proposalId: 'b2222222-2222-4222-8222-222222222222',
      confidence: 0.8,
      event: {
        ...base.event,
        title: 'Foreldre hjelp trengs til samlingspunkt og utstyr',
        notes: 'Fra: text\n\nTa med kopp',
      },
    }
    const out = dedupeNearDuplicateCalendarProposals([base, dup])
    expect(out).toHaveLength(1)
    expect(out[0]!.proposalId).toBe(base.proposalId)
  })

  it('beholder to hendelser når starttid er forskjellig', () => {
    const a: PortalProposalItem = {
      proposalId: 'a1111111-1111-4111-8111-111111111111',
      kind: 'event',
      sourceId: 'x',
      originalSourceType: 'text',
      confidence: 0.9,
      event: {
        date: '2026-05-15',
        personId: 'p1',
        title: 'Cup',
        start: '10:00',
        end: '11:00',
      },
    }
    const b: PortalProposalItem = {
      ...a,
      proposalId: 'b2222222-2222-4222-8222-222222222222',
      event: { ...a.event, start: '14:00', end: '15:00' },
    }
    expect(dedupeNearDuplicateCalendarProposals([a, b])).toHaveLength(2)
  })
})

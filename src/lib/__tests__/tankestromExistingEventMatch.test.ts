import { describe, expect, it } from 'vitest'
import type { Event } from '../../types'
import type { PortalEventProposal } from '../../features/tankestrom/types'
import {
  arrangementTitleCoreForMatch,
  findBestArrangementMatch,
  findConservativeExistingEventMatch,
} from '../tankestromExistingEventMatch'

function baseProposal(overrides: Partial<PortalEventProposal['event']> = {}): PortalEventProposal {
  return {
    proposalId: '11111111-1111-4111-8111-111111111111',
    kind: 'event',
    sourceId: 'src',
    originalSourceType: 'text',
    confidence: 0.9,
    event: {
      date: '2026-06-01',
      personId: 'child-1',
      title: 'Håndballcup',
      start: '00:00',
      end: '23:59',
      notes: '',
      location: 'Haugenhallen',
      metadata: { endDate: '2026-06-02', isAllDay: true },
      ...overrides,
    },
  }
}

describe('findConservativeExistingEventMatch', () => {
  it('returnerer kandidat når tittel, dato, person og sted stemmer godt nok (container + multi-day)', () => {
    const proposal = baseProposal({
      metadata: { endDate: '2026-06-02', isAllDay: true, arrangementStableKey: 'learn|håndball|1' },
    })
    const existing: Event = {
      id: 'evt-existing',
      personId: 'child-1',
      title: 'Håndballcup helg',
      start: '00:00',
      end: '23:59',
      notes: 'Gammel',
      location: 'Haugenhallen',
      metadata: {
        isAllDay: true,
        endDate: '2026-06-02',
        embeddedSchedule: [{ date: '2026-06-01', title: 'Åpning' }],
      },
    }
    const r = findConservativeExistingEventMatch(
      proposal,
      proposal.event.title,
      '2026-06-01',
      '2026-06-02',
      'child-1',
      [{ event: existing, anchorDate: '2026-06-01' }]
    )
    expect(r.rejected).toBe(false)
    expect(r.candidate?.event.id).toBe('evt-existing')
    expect(r.score).toBeGreaterThanOrEqual(78)
    expect(r.learnedStableKey).toBe(true)
    expect(r.matchStatus).toBe('learned')
    expect(r.defaultAction).toBe('update')
    expect(r.reasons?.length).toBeGreaterThan(0)
  })

  it('avviser ved for svak tittel selv med overlapp', () => {
    const proposal = baseProposal({ title: 'Totalt annet arrangement', location: 'Haugenhallen' })
    const existing: Event = {
      id: 'evt-existing',
      personId: 'child-1',
      title: 'Håndballcup helg',
      start: '00:00',
      end: '23:59',
      location: 'Haugenhallen',
      metadata: { isAllDay: true, endDate: '2026-06-02' },
    }
    const r = findConservativeExistingEventMatch(
      proposal,
      proposal.event.title,
      '2026-06-01',
      '2026-06-02',
      'child-1',
      [{ event: existing, anchorDate: '2026-06-01' }]
    )
    expect(r.rejected).toBe(true)
    expect(r.candidate).toBeNull()
  })

  it('matcher eksisterende cup-dag-rad (barn) når import er programforelder med samme arrangementskjerne', () => {
    const proposal: PortalEventProposal = {
      proposalId: '22222222-2222-4222-8222-222222222222',
      kind: 'event',
      sourceId: 'src',
      originalSourceType: 'text',
      confidence: 0.9,
      event: {
        date: '2026-06-12',
        personId: 'child-1',
        title: 'Vårcupen 2026',
        start: '00:00',
        end: '23:59',
        notes: '',
        location: '',
        metadata: {
          endDate: '2026-06-13',
          isAllDay: true,
          multiDayAllDay: true,
          embeddedSchedule: [
            { date: '2026-06-12', title: 'Trening' },
            { date: '2026-06-13', title: 'Kamp' },
          ],
        },
      },
    }
    const existingFriday: Event = {
      id: 'evt-fri',
      personId: 'child-1',
      title: 'Vårcupen – fredag',
      start: '17:00',
      end: '20:00',
      notes: '',
      metadata: {},
    }
    const r = findConservativeExistingEventMatch(
      proposal,
      proposal.event.title,
      '2026-06-12',
      '2026-06-13',
      'child-1',
      [{ event: existingFriday, anchorDate: '2026-06-12' }]
    )
    expect(r.rejected).toBe(false)
    expect(r.candidate?.event.id).toBe('evt-fri')
    expect(arrangementTitleCoreForMatch(proposal.event.title)).toBe(
      arrangementTitleCoreForMatch(existingFriday.title)
    )
  })

  it('matcher på arrangementStableKey før container/tittel (score 100)', () => {
    const stable = 'cup|vårcupen-2026|child-1|2026-06-12'
    const proposal: PortalEventProposal = {
      proposalId: '33333333-3333-4333-8333-333333333333',
      kind: 'event',
      sourceId: 'src',
      originalSourceType: 'text',
      confidence: 0.9,
      event: {
        date: '2026-06-12',
        personId: 'child-1',
        title: 'Vårcupen — detalj',
        start: '10:00',
        end: '11:00',
        notes: '',
        location: '',
        metadata: { arrangementStableKey: stable },
      },
    }
    const existing: Event = {
      id: 'evt-stable',
      personId: 'child-1',
      title: 'Vårcupen – fredag',
      start: '09:00',
      end: '12:00',
      notes: '',
      metadata: { arrangementStableKey: stable },
    }
    const r = findConservativeExistingEventMatch(
      proposal,
      proposal.event.title,
      '2026-06-12',
      '2026-06-12',
      'child-1',
      [{ event: existing, anchorDate: '2026-06-12' }]
    )
    expect(r.rejected).toBe(false)
    expect(r.score).toBe(100)
    expect(r.candidate?.event.id).toBe('evt-stable')
    expect(r.learnedStableKey).toBeUndefined()
    expect(r.matchStatus).toBe('exact')
    expect(r.defaultAction).toBe('update')
  })

  it('matcher svak enkeldagsrad mot flerdagers program + stableKey + likelyFollowup (Vårcupen-regresjon)', () => {
    const stable = 'tg-arr-vaarcupen-ola-2026-05-cup'
    const proposal: PortalEventProposal = {
      proposalId: '44444444-4444-4444-8444-444444444444',
      kind: 'event',
      sourceId: 'src',
      originalSourceType: 'text',
      confidence: 0.9,
      event: {
        date: '2026-05-08',
        personId: 'ola',
        title: 'Vårcupen - oppdatert program fredag og lørdag',
        start: '18:40',
        end: '12:00',
        notes: '',
        location: '',
        metadata: {
          endDate: '2026-05-09',
          arrangementStableKey: stable,
          updateIntent: {
            likelyFollowup: true,
            confidence: 'high',
            signals: ['more_info_or_program_update'],
          },
          embeddedSchedule: [
            { date: '2026-05-08', title: 'Fredag', start: '18:40', end: '20:00' },
            { date: '2026-05-09', title: 'Lørdag', start: '10:00', end: '12:00' },
          ],
        },
      },
    }
    const existing: Event = {
      id: 'event-1',
      personId: 'ola',
      title: 'Vårcupen',
      start: '18:40',
      end: '19:40',
      notes: '',
      metadata: {},
    }
    const r = findBestArrangementMatch(
      proposal,
      proposal.event.title,
      '2026-05-08',
      '2026-05-09',
      'ola',
      [{ event: existing, anchorDate: '2026-05-08' }]
    )
    expect(r.rejected).toBe(false)
    expect(r.candidate?.event.id).toBe('event-1')
    expect(['learned', 'probable']).toContain(r.matchStatus)
    expect(r.defaultAction).toBe('update')
    expect(r.learnedStableKey).toBe(true)
  })

  it('avviser import som ikke er container-lik (ingen flerdagers/endDate-skille, ikke programforelder)', () => {
    const proposal: PortalEventProposal = {
      proposalId: '11111111-1111-4111-8111-111111111111',
      kind: 'event',
      sourceId: 'src',
      originalSourceType: 'text',
      confidence: 0.9,
      event: {
        date: '2026-06-01',
        personId: 'child-1',
        title: 'Håndballcup',
        start: '10:00',
        end: '11:00',
        notes: '',
        location: 'Haugenhallen',
        metadata: {},
      },
    }
    const existing: Event = {
      id: 'evt-existing',
      personId: 'child-1',
      title: 'Håndballcup',
      start: '00:00',
      end: '23:59',
      metadata: { isAllDay: true, endDate: '2026-06-02' },
    }
    const r = findConservativeExistingEventMatch(
      proposal,
      proposal.event.title,
      '2026-06-01',
      '2026-06-01',
      'child-1',
      [{ event: existing, anchorDate: '2026-06-01' }]
    )
    expect(r.rejectReason).toBe('import_not_container')
  })
})

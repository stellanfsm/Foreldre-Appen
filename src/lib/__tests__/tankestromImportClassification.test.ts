import { describe, expect, it } from 'vitest'
import type { PortalEventProposal } from '../../features/tankestrom/types'
import {
  buildImportClassificationContext,
  proposalItemQualifiesSecondaryZone,
  shouldPromoteEventItemToPrimary,
} from '../tankestromSecondaryCandidates'

/** Typisk kort innlimt tekst: «Vårcupen fredag og lørdag 12.–13. juni 2026» */
const VAARCUPEN_PASTE_LENGTH = 'Vårcupen fredag og lørdag 12.–13. juni 2026'.length

function vaarcupenLikeEvent(confidence: number): PortalEventProposal {
  return {
    proposalId: 'p1',
    kind: 'event',
    sourceId: 's1',
    originalSourceType: 'text',
    confidence,
    event: {
      date: '2026-06-12',
      personId: 'c1',
      title: 'Vårcupen',
      start: '09:00',
      end: '10:00',
      notes: '',
      metadata: { endDate: '2026-06-13' },
    },
  }
}

describe('Tankestrom import classification (primary vs «Kanskje også relevant»)', () => {
  it('kort innlimt tekst: tydelig hendelse med middels confidence er i hovedlisten, ikke sekundær sone', () => {
    const item = vaarcupenLikeEvent(0.45)
    const ctx = buildImportClassificationContext({
      inputMode: 'text',
      provenanceSourceType: 'pasted_text',
      sourceLength: VAARCUPEN_PASTE_LENGTH,
      calendarItemCount: 1,
      secondaryCandidateCount: 0,
    })
    expect(ctx.isLongDocumentMode).toBe(false)
    expect(shouldPromoteEventItemToPrimary(item, ctx)).toBe(true)
    expect(proposalItemQualifiesSecondaryZone(item, ctx)).toBe(false)
  })

  it('langt dokument + eksplisitt import: middels confidence uten arrangement-signaler kan fortsatt være sekundær', () => {
    const item = vaarcupenLikeEvent(0.45)
    const ctx = buildImportClassificationContext({
      inputMode: 'text',
      provenanceSourceType: 'pasted_text',
      sourceLength: 7000,
      calendarItemCount: 1,
      secondaryCandidateCount: 0,
    })
    expect(ctx.isLongDocumentMode).toBe(true)
    expect(shouldPromoteEventItemToPrimary(item, ctx)).toBe(false)
    expect(proposalItemQualifiesSecondaryZone(item, ctx)).toBe(true)
  })

  it('langt dokument: hendelse med arrangementStableKey promoteres fortsatt til hovedlisten', () => {
    const item = vaarcupenLikeEvent(0.45)
    item.event.metadata = {
      ...item.event.metadata,
      arrangementStableKey: 'tg-arr-vaarcupen-2026',
    }
    const ctx = buildImportClassificationContext({
      inputMode: 'text',
      provenanceSourceType: 'pasted_text',
      sourceLength: 7000,
      calendarItemCount: 1,
      secondaryCandidateCount: 0,
    })
    expect(shouldPromoteEventItemToPrimary(item, ctx)).toBe(true)
    expect(proposalItemQualifiesSecondaryZone(item, ctx)).toBe(false)
  })

  it('mange kandidater utløser lang-modus; embeddedSchedule holder hendelsen i hovedlisten', () => {
    const item = vaarcupenLikeEvent(0.45)
    item.event.metadata = {
      embeddedSchedule: [{ date: '2026-06-12', title: 'Dag 1' }],
    }
    const ctx = buildImportClassificationContext({
      inputMode: 'file',
      provenanceSourceType: 'uploaded_file',
      sourceLength: 100,
      calendarItemCount: 8,
      secondaryCandidateCount: 0,
    })
    expect(ctx.isLongDocumentMode).toBe(true)
    expect(shouldPromoteEventItemToPrimary(item, ctx)).toBe(true)
    expect(proposalItemQualifiesSecondaryZone(item, ctx)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import type { Person } from '../../types'
import type { PortalEventProposal } from '../../features/tankestrom/types'
import {
  findKnownPersonByName,
  readExtractedDocumentPersonNameFromMetadata,
  resolvePersonForImport,
} from '../tankestromImportPersonResolve'

const family: Person[] = [
  { id: '1', name: 'trym', memberKind: 'parent', colorTint: '', colorAccent: '' },
  { id: '2', name: 'stellan', memberKind: 'child', colorTint: '', colorAccent: '' },
  { id: '3', name: 'Ida', memberKind: 'child', colorTint: '', colorAccent: '' },
]

function boardingPassProposal(passengerName: string): PortalEventProposal {
  return {
    proposalId: 'bp-1',
    kind: 'event',
    sourceId: 'src',
    originalSourceType: 'pdf',
    confidence: 0.95,
    event: {
      date: '2026-08-01',
      personId: '3',
      title: 'Flight',
      start: '14:00',
      end: '16:00',
      metadata: {
        travel: { passengerName },
      },
    },
  }
}

describe('resolvePersonForImport', () => {
  it('boarding pass John Doe matcher ikke trym/stellan/Ida — personId null og extractedName bevares', () => {
    const item = boardingPassProposal('John Doe')
    const r = resolvePersonForImport(item, family)
    expect(r.personId).toBeNull()
    expect(r.status).toBe('unmatched_document_name')
    expect(r.label).toBe('Person ikke oppgitt')
    expect('extractedName' in r && r.extractedName).toBe('John Doe')
    expect(readExtractedDocumentPersonNameFromMetadata(item.event.metadata)).toBe('John Doe')
  })

  it('fullt navn-match mot kjent person gir høy confidence', () => {
    const item = boardingPassProposal('Ida')
    const r = resolvePersonForImport(item, family)
    expect(r.status).toBe('matched')
    expect(r.personId).toBe('3')
  })

  it('uten dokumentnavn: not_specified', () => {
    const item: PortalEventProposal = {
      proposalId: 'bp-2',
      kind: 'event',
      sourceId: 'src',
      originalSourceType: 'pdf',
      confidence: 0.95,
      event: {
        date: '2026-08-01',
        personId: '3',
        title: 'Flight',
        start: '14:00',
        end: '16:00',
        metadata: {},
      },
    }
    const r = resolvePersonForImport(item, family)
    expect(r.status).toBe('not_specified')
    expect(r.personId).toBeNull()
  })
})

describe('findKnownPersonByName', () => {
  it('fornavn Ida er entydig', () => {
    const m = findKnownPersonByName('Ida', family)
    expect(m?.id).toBe('3')
    expect(m?.confidence).toBeGreaterThanOrEqual(0.9)
  })
})

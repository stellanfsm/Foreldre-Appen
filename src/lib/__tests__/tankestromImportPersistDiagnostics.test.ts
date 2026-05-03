import { describe, expect, it } from 'vitest'
import {
  buildTankestromImportFailureUserMessage,
  classifyTankestromPersistThrownError,
} from '../tankestromImportPersistDiagnostics'

describe('tankestromImportPersistDiagnostics', () => {
  it('klassifiserer nettverksfeil', () => {
    const r = classifyTankestromPersistThrownError(new Error('Failed to fetch'), 'createEvent')
    expect(r.kind).toBe('network')
  })

  it('bygger brukermelding med treff på flere feiltyper', () => {
    const msg = buildTankestromImportFailureUserMessage(
      [
        {
          proposalId: 'a',
          proposalSurfaceType: 'event',
          operation: 'createEvent',
          kind: 'network',
          message: 'fetch',
        },
        {
          proposalId: 'b',
          proposalSurfaceType: 'task',
          operation: 'createTask',
          kind: 'task_create_failed',
          message: 'x',
        },
      ],
      8
    )
    expect(msg).toContain('2 av 8')
    expect(msg.toLowerCase()).toMatch(/nettverk|tilkobling/)
    expect(msg.toLowerCase()).toMatch(/oppgav/)
  })

  it('nevner manglende mål ved oppdatering', () => {
    const msg = buildTankestromImportFailureUserMessage(
      [
        {
          proposalId: 'c',
          proposalSurfaceType: 'event',
          operation: 'editEventPrecheck',
          kind: 'event_update_target_missing',
          message: 'missing',
        },
      ],
      4
    )
    expect(msg).toContain('1 av 4')
    expect(msg.toLowerCase()).toMatch(/ikke funnet/)
  })
})

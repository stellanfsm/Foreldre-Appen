// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChildSchoolProfile } from '../../types'

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }))
vi.mock('../supabaseClient', () => ({
  supabase: { auth: { getSession: getSessionMock } },
}))

import {
  buildOutgoingRelevanceContext,
  analyzeDocumentWithTankestrom,
  analyzeTextWithTankestrom,
} from '../tankestromApi'

const SCHOOL: ChildSchoolProfile = {
  gradeBand: '5-7',
  weekdays: {
    0: { useSimpleDay: false, lessons: [{ subjectKey: 'matematikk', start: '08:15', end: '09:00' }] },
  },
}

describe('buildOutgoingRelevanceContext', () => {
  it('returnerer undefined når ingenting er satt', () => {
    expect(buildOutgoingRelevanceContext(undefined)).toBeUndefined()
    expect(buildOutgoingRelevanceContext({})).toBeUndefined()
    expect(buildOutgoingRelevanceContext({ classCode: '   ' })).toBeUndefined()
  })

  it('trimmer classCode', () => {
    expect(buildOutgoingRelevanceContext({ classCode: '  2STC ' })).toEqual({ classCode: '2STC' })
  })

  it('BÆRER schoolProfile videre (dropper det IKKE) — også uten classCode', () => {
    // Dette er chokepunkt-regresjonen: tidligere ble alt utenom classCode forkastet her.
    expect(buildOutgoingRelevanceContext({ schoolProfile: SCHOOL })).toEqual({ schoolProfile: SCHOOL })
  })

  it('bærer både classCode og schoolProfile', () => {
    expect(buildOutgoingRelevanceContext({ classCode: '2STC', schoolProfile: SCHOOL })).toEqual({
      classCode: '2STC',
      schoolProfile: SCHOOL,
    })
  })

  it('BÆRER children-lista videre', () => {
    const children = [{ personId: 'c1', classCode: '2STC', schoolProfile: SCHOOL }]
    expect(buildOutgoingRelevanceContext({ children })).toEqual({ children })
  })

  it('children-only overlever guarden (ingen classCode/schoolProfile) — chokepunkt-regresjonen', () => {
    const children = [{ personId: 'c1' }, { personId: 'c2', classCode: '8B' }]
    expect(buildOutgoingRelevanceContext({ children })).toEqual({ children })
  })

  it('tom children-liste teller ikke (returnerer undefined når alt er tomt)', () => {
    expect(buildOutgoingRelevanceContext({ children: [] })).toBeUndefined()
  })

  it('bærer classCode + schoolProfile + children samtidig', () => {
    const children = [{ personId: 'c1', schoolProfile: SCHOOL }]
    expect(buildOutgoingRelevanceContext({ classCode: '2STC', schoolProfile: SCHOOL, children })).toEqual({
      classCode: '2STC',
      schoolProfile: SCHOOL,
      children,
    })
  })
})

describe('analyze* sender schoolProfile på wire-en', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv('VITE_TANKESTROM_ANALYZE_URL', 'https://example.test/api/analyze')
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    // Minimalt svar: requesten er allerede sendt (og fanget) før analyzeWithTankestrom kaster på parsing.
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '{}',
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('FIL (multipart): schoolProfile havner i relevanceContext-feltet (JSON-streng)', async () => {
    const file = new File(['x'], 'ukeplan.pdf', { type: 'application/pdf' })
    await expect(
      analyzeDocumentWithTankestrom(file, { classCode: '2STC', schoolProfile: SCHOOL })
    ).rejects.toBeTruthy()

    const body = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(body).toBeInstanceOf(FormData)
    const rc = JSON.parse(body.get('relevanceContext') as string)
    expect(rc).toEqual({ classCode: '2STC', schoolProfile: SCHOOL })
  })

  it('TEKST (JSON-body): schoolProfile havner i relevanceContext', async () => {
    await expect(
      analyzeTextWithTankestrom('en ukeplan', { schoolProfile: SCHOOL })
    ).rejects.toBeTruthy()

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.text).toBe('en ukeplan')
    expect(body.relevanceContext).toEqual({ schoolProfile: SCHOOL })
  })

  // ---- Vei 1: documentKind på wire-en (gate: kun eksplisitt valg sendes) ----
  it('FIL: documentKind=event_doc → nøkkel i FormData', async () => {
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' })
    await expect(analyzeDocumentWithTankestrom(file, undefined, 'event_doc')).rejects.toBeTruthy()
    const body = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(body.get('documentKind')).toBe('event_doc')
  })

  it('TEKST: documentKind=activity_plan → nøkkel i JSON-body', async () => {
    await expect(analyzeTextWithTankestrom('en plan', undefined, 'activity_plan')).rejects.toBeTruthy()
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.documentKind).toBe('activity_plan')
  })

  it('FIL: documentKind=school → nøkkel i FormData', async () => {
    const file = new File(['x'], 'skoleplan.pdf', { type: 'application/pdf' })
    await expect(analyzeDocumentWithTankestrom(file, undefined, 'school')).rejects.toBeTruthy()
    const body = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(body.get('documentKind')).toBe('school')
  })

  it('TEKST: documentKind=school → nøkkel i JSON-body', async () => {
    await expect(analyzeTextWithTankestrom('en skoleplan', undefined, 'school')).rejects.toBeTruthy()
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body).toEqual({ text: 'en skoleplan', documentKind: 'school' })
  })

  it('BYTE-IDENTISK: undefined documentKind → INGEN nøkkel (fil OG tekst)', async () => {
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' })
    await expect(analyzeDocumentWithTankestrom(file, undefined)).rejects.toBeTruthy()
    const fileBody = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(fileBody.has('documentKind')).toBe(false)

    fetchMock.mockClear()
    await expect(analyzeTextWithTankestrom('en plan')).rejects.toBeTruthy()
    const textBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect('documentKind' in textBody).toBe(false)
    // Tekst-body byte-identisk med dagens kall (kun {text}):
    expect(textBody).toEqual({ text: 'en plan' })
  })

  it('documentKind + relevanceContext sameksisterer på wire-en', async () => {
    await expect(
      analyzeTextWithTankestrom('en plan', { classCode: '2STC' }, 'event_doc')
    ).rejects.toBeTruthy()
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body).toEqual({ text: 'en plan', relevanceContext: { classCode: '2STC' }, documentKind: 'event_doc' })
  })
})

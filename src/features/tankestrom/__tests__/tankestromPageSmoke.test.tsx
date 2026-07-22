// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parsePortalImportProposalBundle } from '../../../lib/tankestromApi'
import { TankestrømPage } from '../TankestrømPage'
import { useTankestromImport } from '../useTankestromImport'
import type { Person } from '../../../types'

/**
 * Kjørbar smoke for dagens primærflyt (Mer → Tankestrøm → TankestrømPage).
 * Speiler det browser-E2E-en gjør, men kan kjøres lokalt uten login/Supabase,
 * og verifiserer de samme selektorene/CTA-ene E2E-en bruker.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const HOSTCUP_ANALYZE_JSON_PATH = join(__dirname, '../../../../e2e/fixtures/hostcup-analyze-response.json')

const hostcupBundle = parsePortalImportProposalBundle(
  JSON.parse(readFileSync(HOSTCUP_ANALYZE_JSON_PATH, 'utf8'))
)

const people = [
  {
    id: 'person-a',
    name: 'Test',
    memberKind: 'child' as const,
    colorTint: 'bg-slate-200',
    colorAccent: 'border-slate-400',
  },
]

vi.mock('../../../lib/tankestromApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tankestromApi')>()
  return {
    ...actual,
    analyzeTextWithTankestrom: vi.fn(),
    analyzeDocumentWithTankestrom: vi.fn(),
  }
})

import { analyzeTextWithTankestrom, analyzeDocumentWithTankestrom } from '../../../lib/tankestromApi'

/** Enkelthendelse-bundle (ikke cup/embedded) for rich-single-event-tester. */
function makeSingleEventBundle(event: Record<string, unknown>) {
  return parsePortalImportProposalBundle({
    schemaVersion: '1.0.0',
    provenance: {
      sourceSystem: 'tankestrom',
      sourceType: 'e2e_fixture',
      generatorVersion: 'test',
      generatedAt: '2026-05-08T20:00:00.000Z',
      importRunId: 'single-1',
    },
    items: [
      {
        proposalId: 'a1b2c3d4-1111-4abc-9def-000000000001',
        kind: 'event',
        sourceId: 'e2e',
        originalSourceType: 'pasted_text',
        confidence: 0.95,
        event: {
          date: '2026-09-10',
          personId: '',
          title: 'Samling ved Sognsvann i morgen',
          start: '18:00',
          end: '',
          metadata: {},
          ...event,
        },
      },
    ],
  })
}

/** Enkelt-task-bundle (bare ett gjøremål, ingen events) — Vei 1 task-person-match. */
function makeSingleTaskBundle(task: Record<string, unknown>) {
  return parsePortalImportProposalBundle({
    schemaVersion: '1.0.0',
    provenance: {
      sourceSystem: 'tankestrom',
      sourceType: 'e2e_fixture',
      generatorVersion: 'test',
      generatedAt: '2026-05-08T20:00:00.000Z',
      importRunId: 'single-task-1',
    },
    items: [
      {
        proposalId: 'a1b2c3d4-2222-4abc-9def-000000000001',
        kind: 'task',
        sourceId: 'e2e',
        originalSourceType: 'pasted_text',
        confidence: 0.9,
        task: {
          date: '2026-09-10',
          title: 'Lekse i matematikk',
          ...task,
        },
      },
    ],
  })
}

/** Skole-uke som SEPARATE dag-hendelser (riktig sti) med server-satt schoolContext + schoolDayOverride. */
function makeSchoolWeekBundle() {
  const day = (id: string, date: string, overrideKind: string, start = '', end = '') => ({
    proposalId: id,
    kind: 'event',
    sourceId: 'e2e',
    originalSourceType: 'pasted_text',
    confidence: 0.9,
    event: {
      date,
      personId: '',
      title: 'Ukeplan for eksamen og avslutning',
      start,
      end,
      metadata: {
        schoolContext: { itemType: 'general' },
        schoolDayOverride: { overrideKind, reason: 'detalj' },
      },
    },
  })
  return {
    schemaVersion: '1.0.0',
    provenance: {
      sourceSystem: 'tankestrom',
      sourceType: 'e2e_fixture',
      generatorVersion: 'test',
      generatedAt: '2026-05-08T20:00:00.000Z',
      importRunId: 'school-1',
    },
    items: [
      day('aaaa1111-1111-4abc-9def-000000000001', '2026-06-15', 'exam_day', '09:00', '14:00'),
      day('aaaa1111-1111-4abc-9def-000000000002', '2026-06-17', 'free_day'),
    ],
  } as unknown as Awaited<ReturnType<typeof analyzeTextWithTankestrom>>
}

/** Ren timeplan (school_profile) — slik runAnalyze klassifiserer en gjentakende ukeplan per barn. */
function makeSchoolProfileBundle() {
  return parsePortalImportProposalBundle({
    schemaVersion: '1.0.0',
    provenance: {
      sourceSystem: 'tankestrom',
      sourceType: 'pasted_text',
      generatorVersion: 'test',
      generatedAt: '2026-05-08T20:00:00.000Z',
      importRunId: 'school-profile-1',
    },
    items: [
      {
        proposalId: 'bbbb2222-2222-4abc-9def-000000000001',
        kind: 'school_profile',
        sourceId: 'e2e',
        originalSourceType: 'school_timetable',
        confidence: 0.9,
        schoolProfile: {
          gradeBand: '5-7',
          weekdays: {
            0: { useSimpleDay: false, lessons: [{ subjectKey: 'matematikk', start: '08:15', end: '09:00' }] },
          },
        },
      },
    ],
  })
}

function renderPage() {
  return render(
    <TankestrømPage
      onBack={() => undefined}
      people={people}
      createEvent={vi.fn()}
      createTask={vi.fn()}
    />
  )
}

/** A-plan-bundle: overlay (classLabel «10B») + én task — for Fiks 1 (overlay-lagring). */
function makeOverlayBundle() {
  return {
    schemaVersion: '1.0.0',
    provenance: {
      sourceSystem: 'tankestrom',
      sourceType: 'e2e_fixture',
      generatorVersion: 'test',
      generatedAt: '2026-05-08T20:00:00.000Z',
      importRunId: 'overlay-1',
    },
    items: [
      {
        proposalId: 'a1b2c3d4-3333-4abc-9def-000000000001',
        kind: 'task',
        sourceId: 'e2e',
        originalSourceType: 'pasted_text',
        confidence: 0.9,
        task: { date: '2026-03-25', title: 'Tysk prøve' },
      },
    ],
    schoolWeekOverlayProposal: {
      proposalId: 'overlay-1',
      kind: 'school_week_overlay',
      schemaVersion: '1.0.0',
      confidence: 0.9,
      originalSourceType: 'pasted_text',
      weeklySummary: ['Uke 13'],
      classLabel: '10B',
      dailyActions: {
        2: {
          action: 'enrich_existing_school_block',
          reason: 'r',
          summary: 's',
          subjectUpdates: [{ subjectKey: 'matematikk' }],
        },
      },
    },
  } as unknown as Awaited<ReturnType<typeof analyzeTextWithTankestrom>>
}

// Flerbarns: Stellan (2STC) er childIds[0], Ida (10B) matcher overlayens classLabel.
const stellanOgIda: Person[] = [
  {
    id: 'stellan',
    name: 'Stellan',
    memberKind: 'child',
    colorTint: 'bg-slate-200',
    colorAccent: 'border-slate-400',
    school: { gradeBand: 'vg2', weekdays: {} },
    relevanceProfile: { school: { classCode: '2STC' } },
  },
  {
    id: 'ida',
    name: 'Ida',
    memberKind: 'child',
    colorTint: 'bg-slate-200',
    colorAccent: 'border-slate-400',
    school: { gradeBand: '8-10', weekdays: {} },
    relevanceProfile: { school: { classCode: '10B' } },
  },
]

describe('TankestrømPage primærflyt-smoke', () => {
  beforeEach(() => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(hostcupBundle)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('Fiks 1: import lagrer uke-overlay på classLabel-matchet barn (Ida 10B), ikke childIds[0] (Stellan)', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(makeOverlayBundle())
    const updatePerson = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={stellanOgIda}
        createEvent={vi.fn()}
        createTask={vi.fn().mockResolvedValue(undefined)}
        updatePerson={updatePerson}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'A-plan uke 13')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    const importBtn = await screen.findByRole('button', { name: /Legg til \d+ hendelse/i })
    await user.click(importBtn)

    await waitFor(() => expect(updatePerson).toHaveBeenCalled())
    // Overlayen lagres — og på RIKTIG barn (classLabel «10B» → Ida), ikke blindt childIds[0] (Stellan).
    const overlayCall = updatePerson.mock.calls.find((c) => c[1]?.school?.weekOverlays)
    expect(overlayCall).toBeTruthy()
    expect(overlayCall![0]).toBe('ida')
    expect(overlayCall![1].school.weekOverlays).toHaveLength(1)
  })

  it('Preview: viser fag-plassert overlay-preview når bundlen har en uke-overlay', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(makeOverlayBundle())
    const user = userEvent.setup()
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={stellanOgIda}
        createEvent={vi.fn()}
        createTask={vi.fn()}
        updatePerson={vi.fn()}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'A-plan uke 13')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
  })

  it('Preview: skjules for vanlig dokument uten overlay', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(
      makeSingleEventBundle({ personId: 'person-a', end: '19:00' })
    )
    const user = userEvent.setup()
    render(
      <TankestrømPage onBack={() => undefined} people={people} createEvent={vi.fn()} createTask={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'vanlig dokument')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await screen.findByText('Foreslåtte hendelser')
    expect(screen.queryByText('Slik blir skole-uken')).toBeNull()
  })

  it('classLocations: per-klasse «Sted» vises i forslags-preview (familiens klasse uthevet)', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(
      makeSingleEventBundle({
        personId: 'stellan',
        end: '19:00',
        metadata: {
          classLocations: [
            { classCode: '2STA', room: '332-40', teacher: 'Andreas Vågen' },
            { classCode: '2STC', room: '332-50', teacher: 'Marte Hermanrud' },
          ],
        },
      })
    )
    const user = userEvent.setup()
    render(
      <TankestrømPage onBack={() => undefined} people={stellanOgIda} createEvent={vi.fn()} createTask={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'eksamensoppsett')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Per-klasse-lista rendres fra metadata.classLocations (location er null på tekst-stien):
    expect(await screen.findByText('Rom 332-50 · Lærer Marte Hermanrud')).toBeTruthy()
    // Stellans klasse (2STC) uthevet som full blokk; 2STA (ingen familie-match) komprimert
    // til én dempet inline-enhet i den lille flyt-blokken:
    expect(screen.getByText('2STC').className).toContain('font-semibold')
    const unitA = screen.getByText('2STA · Rom 332-40 · Lærer Andreas Vågen')
    expect(unitA.parentElement?.className).toContain('opacity-60')
    expect(unitA.parentElement?.className).toContain('text-[10px]')
  })

  it('classLocations fraværende → flat «Sted»-fallback uendret', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(
      makeSingleEventBundle({ personId: 'person-a', end: '19:00', location: 'Gymsalen' })
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'vanlig dokument')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await screen.findByText('Foreslåtte hendelser')
    expect(screen.getByText('Gymsalen')).toBeTruthy()
  })

  it('Fiks 1 ikke-regresjon: dokument uten overlay → ingen overlay-lagring (updatePerson ikke kalt)', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(
      makeSingleEventBundle({ personId: 'person-a', end: '19:00' })
    )
    const updatePerson = vi.fn().mockResolvedValue(undefined)
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={people}
        createEvent={createEvent}
        createTask={vi.fn()}
        updatePerson={updatePerson}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'vanlig dokument')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    const importBtn = await screen.findByRole('button', { name: /Legg til \d+ hendelse/i })
    await user.click(importBtn)

    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    // Ingen overlay i bundlen → ingen skoleprofil-skriving (approveSelected uendret).
    expect(updatePerson).not.toHaveBeenCalled()
  })

  it('lim inn tekst → Analyser tekst → viser forslag og import-CTA', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await waitFor(() => {
      expect(analyzeTextWithTankestrom).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('Foreslåtte hendelser')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Legg til \d+ hendelse/i })).toBeTruthy()
  })

  it('Vei 1: dokumenttype-raden vises i input-fasen (Automatisk default) og forsvinner etter analyse', async () => {
    const user = userEvent.setup()
    renderPage()

    // Input-fasen: raden finnes med tre valg (Automatisk / Skole / Arrangement); «Automatisk» valgt.
    expect(screen.getByText('Dokumenttype')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Automatisk/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Skole/ }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /Arrangement/ }).getAttribute('aria-pressed')).toBe('false')
    // «Ukeplan» er erstattet av «Skole» som synlig chip.
    expect(screen.queryByRole('button', { name: /Ukeplan/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Etter analyse (bundle finnes) → raden borte.
    await screen.findByText('Foreslåtte hendelser')
    expect(screen.queryByText('Dokumenttype')).toBeNull()
  })

  it('Vei 1: «Skole» sender documentKind=school; «Arrangement» sender event_doc; Automatisk sender undefined', async () => {
    const user = userEvent.setup()

    // «Skole» → 'school'
    const { unmount } = renderPage()
    await user.click(screen.getByRole('button', { name: /Skole/ }))
    expect(screen.getByRole('button', { name: /Skole/ }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'En skoleplan')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))
    await waitFor(() => expect(analyzeTextWithTankestrom).toHaveBeenCalledTimes(1))
    expect(vi.mocked(analyzeTextWithTankestrom).mock.calls[0]![2]).toBe('school')
    unmount()
    vi.mocked(analyzeTextWithTankestrom).mockClear()

    // «Arrangement» → 'event_doc'
    renderPage()
    await user.click(screen.getByRole('button', { name: /Arrangement/ }))
    expect(screen.getByRole('button', { name: /Arrangement/ }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Et arrangement')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))
    await waitFor(() => expect(analyzeTextWithTankestrom).toHaveBeenCalledTimes(1))
    expect(vi.mocked(analyzeTextWithTankestrom).mock.calls[0]![2]).toBe('event_doc')
  })

  it('Vei 1: Automatisk (default) sender undefined documentKind', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Et dokument')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await waitFor(() => expect(analyzeTextWithTankestrom).toHaveBeenCalledTimes(1))
    expect(vi.mocked(analyzeTextWithTankestrom).mock.calls[0]![2]).toBeUndefined()
  })

  it('skole-uke (separate hendelser): dag-kort viser per-dag-overskrift + uke-tittel som gruppe-header én gang', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(makeSchoolWeekBundle())
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'skoleuke til analyse')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await screen.findByText('Foreslåtte hendelser')
    // Per-dag-overskrift fra overrideKind (ikke gjentatt dokument-tittel):
    expect(screen.getByText('Eksamen')).toBeTruthy()
    expect(screen.getByText('Fri')).toBeTruthy()
    // Uke-tittelen vises som gruppe-header ÉN gang (ikke per kort):
    expect(screen.getAllByText('Ukeplan for eksamen og avslutning')).toHaveLength(1)
  })

  it('timeplan (school_profile): viser «legg på barnet»-melding med snarvei, ikke blank og ikke hendelser', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(makeSchoolProfileBundle())
    const onNavigateFamilie = vi.fn()
    const user = userEvent.setup()
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={people}
        createEvent={vi.fn()}
        createTask={vi.fn()}
        onNavigateFamilie={onNavigateFamilie}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'timeplan til analyse')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    expect(await screen.findByText(/Dette ser ut som en timeplan/i)).toBeTruthy()
    // Ikke hendelser, ikke tomtilstand.
    expect(screen.queryByText('Foreslåtte hendelser')).toBeNull()
    expect(screen.queryByText(/Vi fant ingen kalenderhendelser eller gjøremål/)).toBeNull()
    // Snarvei navigerer til Familie (der barnet velges) — ingen barn-velger på hovedsiden.
    await user.click(screen.getByRole('button', { name: /Gå til Familie/i }))
    expect(onNavigateFamilie).toHaveBeenCalledTimes(1)
  })

  it('Del A beskyttet: ukeplan/skole-uke trigger IKKE timeplan-meldingen (vises som hendelser)', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(makeSchoolWeekBundle())
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'skoleuke til analyse')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    expect(await screen.findByText('Foreslåtte hendelser')).toBeTruthy()
    expect(screen.queryByText(/Dette ser ut som en timeplan/i)).toBeNull()
  })

  it('oppgave 9 (ett barn): sender classCode + schoolProfile (timeplan, uten weekOverlays) i relevanceContext', async () => {
    const oneChild: Person[] = [
      {
        id: 'person-a',
        name: 'Test',
        memberKind: 'child',
        colorTint: 'bg-slate-200',
        colorAccent: 'border-slate-400',
        relevanceProfile: { school: { classCode: '2STC' } },
        school: {
          gradeBand: '5-7',
          weekdays: { 0: { useSimpleDay: true, schoolStart: '08:15', schoolEnd: '14:00' } },
          weekOverlays: [],
        },
      },
    ]
    const user = userEvent.setup()
    render(<TankestrømPage onBack={() => undefined} people={oneChild} createEvent={vi.fn()} createTask={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await waitFor(() => expect(analyzeTextWithTankestrom).toHaveBeenCalledTimes(1))
    const rc = vi.mocked(analyzeTextWithTankestrom).mock.calls[0]![1]
    expect(rc?.classCode).toBe('2STC')
    expect(rc?.schoolProfile?.gradeBand).toBe('5-7')
    expect(rc?.schoolProfile?.weekdays[0]).toEqual({ useSimpleDay: true, schoolStart: '08:15', schoolEnd: '14:00' })
    // weekOverlays droppes for å holde payloaden liten — kun gradeBand + weekdays sendes.
    expect(rc?.schoolProfile).toBeDefined()
    expect(Object.keys(rc!.schoolProfile!).sort()).toEqual(['gradeBand', 'weekdays'])
    // Vei 1 lag 3: children-lista sendes OGSÅ (additivt) — ett barn = én entry; topnivå beholdt.
    expect(rc?.children).toHaveLength(1)
    expect(rc?.children?.[0]?.personId).toBe('person-a')
    expect(rc?.children?.[0]?.classCode).toBe('2STC')
  })

  it('Vei 1 lag 3 (to barn): sender children-lista med alle barn (FORVENTET kontraktendring — var INGEN før)', async () => {
    const twoChildren: Person[] = [
      {
        id: 'child-a',
        name: 'Ada',
        memberKind: 'child',
        colorTint: 'bg-slate-200',
        colorAccent: 'border-slate-400',
        relevanceProfile: { school: { classCode: '2STC' } },
        school: { gradeBand: '5-7', weekdays: {} },
      },
      {
        id: 'child-b',
        name: 'Bo',
        memberKind: 'child',
        colorTint: 'bg-slate-200',
        colorAccent: 'border-slate-400',
      },
    ]
    const user = userEvent.setup()
    render(<TankestrømPage onBack={() => undefined} people={twoChildren} createEvent={vi.fn()} createTask={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await waitFor(() => expect(analyzeTextWithTankestrom).toHaveBeenCalledTimes(1))
    const rc = vi.mocked(analyzeTextWithTankestrom).mock.calls[0]![1]
    // FORVENTET KONTRAKTENDRING (Vei 1 lag 3): 2 barn sender nå children-lista (var undefined før).
    expect(rc?.children).toHaveLength(2)
    expect(rc?.children?.map((c) => c.personId).sort()).toEqual(['child-a', 'child-b'])
    expect(rc?.children?.find((c) => c.personId === 'child-a')?.classCode).toBe('2STC')
    expect(rc?.children?.find((c) => c.personId === 'child-a')?.schoolProfile?.gradeBand).toBe('5-7')
    // Topnivå er undefined for 2 barn (kun ett-barn-tilfellet fyller topnivå — bevisst beholdt).
    expect(rc?.classCode).toBeUndefined()
    expect(rc?.schoolProfile).toBeUndefined()
  })

  it('Vei 1 lag 3 (seed): server-matched personId forhåndsutfyller velgeren OG holder den synlig', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(
      makeSingleEventBundle({ personId: 'child-a', end: '19:00' })
    )
    const twoChildren: Person[] = [
      { id: 'child-a', name: 'Ada', memberKind: 'child', colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child', colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    const user = userEvent.setup()
    render(<TankestrømPage onBack={() => undefined} people={twoChildren} createEvent={vi.fn()} createTask={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'noe tekst')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Velgeren holdes synlig (chosenPersonIds.size>0-armen) selv om eventet er matchet:
    expect(await screen.findByText('Hvem gjelder dette?')).toBeTruthy()
    // Ada (matchet av serveren) er forhåndsvalgt, Bo er ikke:
    expect(screen.getByRole('button', { name: 'Ada' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Bo' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('Vei 1 lag 3 (child_unresolved): server-usikker → velger vises tom (ingen pill forhåndsvalgt)', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(
      makeSingleEventBundle({ personMatchStatus: 'child_unresolved', end: '19:00' })
    )
    const twoChildren: Person[] = [
      { id: 'child-a', name: 'Ada', memberKind: 'child', colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child', colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    const user = userEvent.setup()
    render(<TankestrømPage onBack={() => undefined} people={twoChildren} createEvent={vi.fn()} createTask={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'noe tekst')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Eventet mangler person (serveren var usikker) → velgeren vises, men ingen pill er forhåndsvalgt:
    expect(await screen.findByText('Hvem gjelder dette?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ada' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Bo' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('Vei 1 (bare-task, matched): server-matched gjøremål forhåndsutfyller velgeren', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(
      makeSingleTaskBundle({ personMatchStatus: 'matched', personId: 'child-a' })
    )
    const twoChildren: Person[] = [
      { id: 'child-a', name: 'Ada', memberKind: 'child', colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child', colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    const user = userEvent.setup()
    render(<TankestrømPage onBack={() => undefined} people={twoChildren} createEvent={vi.fn()} createTask={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'noe tekst')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Bare-task-bundle (ingen events): serverens matchede barn seedes inn → velger synlig + Ada forhåndsvalgt.
    expect(await screen.findByText('Hvem gjelder dette?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ada' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Bo' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('Vei 1 (bare-task, child_unresolved): velger vises tom for bare-task-bundle', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(
      makeSingleTaskBundle({ personMatchStatus: 'child_unresolved' })
    )
    const twoChildren: Person[] = [
      { id: 'child-a', name: 'Ada', memberKind: 'child', colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child', colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    const user = userEvent.setup()
    render(<TankestrømPage onBack={() => undefined} people={twoChildren} createEvent={vi.fn()} createTask={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'noe tekst')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Serveren vet det gjelder et barn men er usikker (child_unresolved) → velgeren vises (utvidet
    // selectedEventLacksPerson dekker tasks), men ingen pill er forhåndsvalgt.
    expect(await screen.findByText('Hvem gjelder dette?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ada' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Bo' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('viser rik forhåndsvisning: hovedarrangement + dagsblokker med høydepunkter og foreløpig-markering', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Fredag: dagsblokk med tittel, høydepunkter og «husk / ta med».
    const friday = await screen.findByTestId('tankestrom-day-2026-09-18')
    expect(friday.textContent).toContain('Høstcupen – fredag')
    expect(friday.textContent).toContain('17:30')
    expect(friday.textContent).toContain('Oppmøte')
    expect(friday.textContent).toMatch(/drikkeflaske/i)

    expect(screen.getByTestId('tankestrom-day-2026-09-19').textContent).toContain('Høstcupen – lørdag')

    // Søndag er tentativ → tydelig «Foreløpig»-markering.
    const sunday = screen.getByTestId('tankestrom-day-2026-09-20')
    expect(sunday.textContent).toContain('Høstcupen – søndag')
    expect(sunday.textContent).toContain('Foreløpig')

    // Import-knappen teller faktiske dagshendelser (fre + lør), ikke parent-kortet.
    const importBtn = screen.getByRole('button', { name: /Legg til \d+ hendelse/i })
    expect(importBtn.textContent).toContain('Legg til 2 hendelser')
    expect(importBtn.textContent).not.toContain('Legg til 1 hendelse')
  })

  it('viser tydelig feilmelding når importen ikke lagrer (ingen stille feil)', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockRejectedValue(new Error('persist boom'))
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={people}
        createEvent={createEvent}
        createTask={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    const importBtn = await screen.findByRole('button', { name: /Legg til \d+ hendelse/i })
    await user.click(importBtn)

    // Persist ble forsøkt, og brukeren får en synlig feilmelding (ikke bare «laster»).
    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts.some((a) => (a.textContent ?? '').trim().length > 0)).toBe(true)
  })

  it('viser gjøremål-forslag i preview når analysen returnerer en (primær) task', async () => {
    const taskBundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'e2e_fixture',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: 'task-1',
      },
      items: [
        {
          proposalId: 'b1e2c3d4-5678-4abc-9def-0123456789ab',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.95,
          task: { title: 'Betal turneringsavgift', date: '2026-09-10' },
        },
      ],
    })
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(taskBundle)

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Betal avgift innen fredag')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Gjøremål vises i egen «Foreslåtte gjøremål»-seksjon, ikke blandet med hendelser/dagsblokker.
    expect(await screen.findByText('Foreslåtte gjøremål')).toBeTruthy()
    expect(screen.getByText('Betal turneringsavgift')).toBeTruthy()
  })

  it('må-gjøre-gjøremål: viser «Må gjøre»-merke og frist (Spond med klokkeslett)', async () => {
    const taskBundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'e2e_fixture',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: 'task-mustdo',
      },
      items: [
        {
          proposalId: 'c1e2c3d4-5678-4abc-9def-0123456789ab',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.95,
          task: {
            title: 'Svar i Spond',
            date: '2026-09-08',
            dueTime: '20:00',
            taskIntent: 'must_do',
          },
        },
      ],
    })
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(taskBundle)

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Svar i Spond innen tirsdag kl. 20:00')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    expect(await screen.findByText('Foreslåtte gjøremål')).toBeTruthy()
    expect(screen.getByText('Svar i Spond')).toBeTruthy()
    expect(screen.getByText('Må gjøre')).toBeTruthy()
    // Frist/dueTime vises i sublabelen.
    expect(screen.getByText(/· 20:00/)).toBeTruthy()
  })

  // ── Tomtilstand når analyse er ferdig uten brukbare forslag ──────────────────
  // Realistisk «stille» tilfelle: API-svar passerer parser med forslag, men frontend-normalisering/
  // dedupe reduserer til 0 brukbare items før setBundle. Parseren avviser tomme bundles, så her
  // bygges et rå (post-normalisert tomt) bundle direkte — slik hook-en faktisk kan motta det.
  function emptyBundle(runId: string): Awaited<ReturnType<typeof analyzeTextWithTankestrom>> {
    return {
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'pasted_text',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: runId,
      },
      items: [],
    } as unknown as Awaited<ReturnType<typeof analyzeTextWithTankestrom>>
  }

  async function analyzeText(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), text)
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))
  }

  it('tomtilstand: vises ikke før analyse er forsøkt', () => {
    renderPage()
    expect(screen.queryByText(/Vi fant ingen kalenderhendelser eller gjøremål/)).toBeNull()
  })

  it('tomtilstand: vises når analyse er ferdig med 0 forslag (tekst)', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(emptyBundle('empty-text'))
    const user = userEvent.setup()
    renderPage()
    await analyzeText(user, 'bare litt løs tekst uten hendelse')

    expect(await screen.findByText(/Vi fant ingen kalenderhendelser eller gjøremål/)).toBeTruthy()
    // Tekst-variant av tipsene (ikke bilde).
    expect(screen.getByText(/Lim inn mer av meldingen/)).toBeTruthy()
    expect(screen.queryByText('Tips for bilder:')).toBeNull()
    // Bruker kan fortsatt prøve igjen (opplasting fremdeles tilgjengelig).
    expect(screen.getByText('Last opp dokument eller bilde')).toBeTruthy()
  })

  it('tomtilstand: vises ikke mens analyse pågår', async () => {
    let resolveAnalyze!: (b: ReturnType<typeof emptyBundle>) => void
    vi.mocked(analyzeTextWithTankestrom).mockReturnValueOnce(
      new Promise((res) => {
        resolveAnalyze = res
      })
    )
    const user = userEvent.setup()
    renderPage()
    await analyzeText(user, 'noe tekst')

    // Mens analyse pågår: ingen tomtilstand (bundle ikke satt ennå).
    expect(screen.getAllByText('Analyserer…').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Vi fant ingen kalenderhendelser eller gjøremål/)).toBeNull()

    // Når ferdig med 0 forslag → tomtilstand.
    resolveAnalyze(emptyBundle('empty-after-loading'))
    expect(await screen.findByText(/Vi fant ingen kalenderhendelser eller gjøremål/)).toBeTruthy()
  })

  it('tomtilstand: vises ikke når det finnes event-forslag', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(makeSingleEventBundle({ title: 'Tur', end: '10:00' }))
    const user = userEvent.setup()
    renderPage()
    await analyzeText(user, 'Tur i morgen')

    expect(await screen.findByText('Foreslåtte hendelser')).toBeTruthy()
    expect(screen.queryByText(/Vi fant ingen kalenderhendelser eller gjøremål/)).toBeNull()
  })

  it('tomtilstand: vises ikke når det finnes task-forslag', async () => {
    const taskBundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'pasted_text',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: 'task-nonempty',
      },
      items: [
        {
          proposalId: 'f1e2c3d4-5678-4abc-9def-0123456789ab',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.95,
          task: { title: 'Betal avgift', date: '2026-09-08' },
        },
      ],
    })
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(taskBundle)
    const user = userEvent.setup()
    renderPage()
    await analyzeText(user, 'Betal avgift')

    expect(await screen.findByText('Foreslåtte gjøremål')).toBeTruthy()
    expect(screen.queryByText(/Vi fant ingen kalenderhendelser eller gjøremål/)).toBeNull()
  })

  it('tomtilstand: API-feil vises foran tomtilstand', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockRejectedValueOnce(new Error('Serveren svarte ikke'))
    const user = userEvent.setup()
    renderPage()
    await analyzeText(user, 'noe tekst')

    expect(await screen.findByText('Serveren svarte ikke')).toBeTruthy()
    expect(screen.queryByText(/Vi fant ingen kalenderhendelser eller gjøremål/)).toBeNull()
  })

  it('gjøremål: kan toggle mellom «Må gjøre» og «Valgfritt» før import', async () => {
    const taskBundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'e2e_fixture',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: 'task-toggle',
      },
      items: [
        {
          proposalId: 'd2e2c3d4-5678-4abc-9def-0123456789ab',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.95,
          task: { title: 'Kjøp drakt', date: '2026-09-08', taskIntent: 'must_do' },
        },
      ],
    })
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(taskBundle)

    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Kjøp drakt')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))
    await screen.findByText('Foreslåtte gjøremål')

    expect(screen.getByRole('button', { name: 'Må gjøre' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Valgfritt' }).getAttribute('aria-pressed')).toBe('false')

    await user.click(screen.getByRole('button', { name: 'Valgfritt' }))
    expect(screen.getByRole('button', { name: 'Valgfritt' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Må gjøre' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('gjøremål: valgt intent (Valgfritt) brukes når task importeres', async () => {
    const createTask = vi.fn().mockResolvedValue(undefined)
    const taskBundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'e2e_fixture',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: 'task-intent-import',
      },
      items: [
        {
          proposalId: 'd3e2c3d4-5678-4abc-9def-0123456789ab',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.95,
          task: { title: 'Kjøp drakt', date: '2026-09-08', childPersonId: 'person-a', taskIntent: 'must_do' },
        },
      ],
    })
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(taskBundle)

    const user = userEvent.setup()
    render(
      <TankestrømPage onBack={() => undefined} people={people} createEvent={vi.fn()} createTask={createTask} />
    )
    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Kjøp drakt')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))
    await screen.findByText('Foreslåtte gjøremål')

    await user.click(screen.getByRole('button', { name: 'Valgfritt' }))
    await user.click(await screen.findByRole('button', { name: /Legg til \d+ hendelse/i }))

    await waitFor(() => expect(createTask).toHaveBeenCalled())
    const arg = createTask.mock.calls[0]![0] as { taskIntent?: string }
    expect(arg.taskIntent).toBe('can_help')
  })

  it('valgfritt gjøremål: viser «Valgfritt»-merke (can_help)', async () => {
    const taskBundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'e2e_fixture',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: 'task-canhelp',
      },
      items: [
        {
          proposalId: 'd1e2c3d4-5678-4abc-9def-0123456789ab',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.95,
          task: {
            title: 'Ta med frukt',
            date: '2026-09-08',
            taskIntent: 'can_help',
          },
        },
      ],
    })
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(taskBundle)

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Kan noen ta med frukt?')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    expect(await screen.findByText('Foreslåtte gjøremål')).toBeTruthy()
    expect(screen.getByText('Ta med frukt')).toBeTruthy()
    expect(screen.getByText('Valgfritt')).toBeTruthy()
  })

  it('sekundært gjøremål (middels sikkerhet) er synlig i siden og kan legges til', async () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'pasted_text',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: 'task-secondary',
      },
      items: [
        {
          proposalId: 'e1e2c3d4-5678-4abc-9def-0123456789ab',
          kind: 'event',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.95,
          event: { title: 'Lørdagscup', date: '2026-06-13', start: '09:20', end: '10:50' },
        },
        {
          // Middels konfidens [0.37, 0.56) → rutes til sekundærsonen.
          proposalId: 'f1e2c3d4-5678-4abc-9def-0123456789ab',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.45,
          task: {
            title: 'Vi trenger noen som kan ta med frukt',
            date: '2026-06-13',
            taskIntent: 'can_help',
          },
        },
      ],
    })
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(bundle)

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Lørdagscup. Kan noen ta med frukt?')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Det sekundære gjøremålet er SYNLIG (ikke usynlig), i egen «Kanskje også relevant»-seksjon.
    expect(await screen.findByText('Kanskje også relevant')).toBeTruthy()
    expect(screen.getByText('Vi trenger noen som kan ta med frukt')).toBeTruthy()
    // Event vises fortsatt som hendelse.
    expect(screen.getByText('Lørdagscup')).toBeTruthy()
    // Ikke i hovedlista for gjøremål ennå (krever bekreftelse, ingen auto-import).
    expect(screen.queryByText('Foreslåtte gjøremål')).toBeNull()

    // «Gjør til gjøremål» → flyttes til hovedlista med «Valgfritt»-merke.
    await user.click(screen.getByRole('button', { name: 'Gjør til gjøremål' }))
    expect(await screen.findByText('Foreslåtte gjøremål')).toBeTruthy()
    expect(screen.getByText('Valgfritt')).toBeTruthy()
  })

  it('gir embedded cup-dager gyldig person_id ved import (eneste barn som default)', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockResolvedValue(undefined)
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={people}
        createEvent={createEvent}
        createTask={vi.fn()}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    const importBtn = await screen.findByRole('button', { name: /Legg til \d+ hendelse/i })
    await user.click(importBtn)

    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    // Hver dags-hendelse settes inn med barnets person_id – aldri null.
    for (const call of createEvent.mock.calls) {
      const input = call[1] as { personId?: string | null }
      expect(input.personId).toBe('person-a')
    }
  })

  it('blokkerer import med forståelig melding (ikke rå DB-feil) når flere barn finnes og ingen er valgt', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const twoChildren = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={twoChildren}
        createEvent={createEvent}
        createTask={vi.fn()}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    const importBtn = await screen.findByRole('button', { name: /Legg til \d+ hendelse/i })
    await user.click(importBtn)

    expect(await screen.findByText(/Vi vet ikke hvem hendelsene gjelder/i)).toBeTruthy()
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('viser personvelger i TankestrømPage når familien har flere barn', async () => {
    const user = userEvent.setup()
    const twoChildren = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage onBack={() => undefined} people={twoChildren} createEvent={vi.fn()} createTask={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    expect(await screen.findByText('Hvem gjelder dette?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ada' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bo' })).toBeTruthy()
  })

  it('etter valg av barn importeres embedded cup-dager med valgt person_id', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const twoChildren = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={twoChildren}
        createEvent={createEvent}
        createTask={vi.fn()}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Velg Bo, så importer.
    await user.click(await screen.findByRole('button', { name: 'Bo' }))
    await user.click(await screen.findByRole('button', { name: /Legg til \d+ hendelse/i }))

    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    for (const call of createEvent.mock.calls) {
      const input = call[1] as { personId?: string | null }
      expect(input.personId).toBe('child-b')
    }
  })

  it('viser ikke personvelger for familie med ett barn (auto-default)', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await screen.findByRole('button', { name: /Legg til \d+ hendelse/i })
    expect(screen.queryByText('Hvem gjelder dette?')).toBeNull()
  })

  it('personvelger viser både barn og voksne/familiemedlemmer', async () => {
    const user = userEvent.setup()
    const family = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'parent-a', name: 'Mor', memberKind: 'parent' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage onBack={() => undefined} people={family} createEvent={vi.fn()} createTask={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    expect(await screen.findByText('Hvem gjelder dette?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ada' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mor' })).toBeTruthy()
  })

  it('multi-valg: hver cup-dag lagres som én hendelse med begge valgte personer som deltakere', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const twoChildren = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={twoChildren}
        createEvent={createEvent}
        createTask={vi.fn()}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await user.click(await screen.findByRole('button', { name: 'Ada' }))
    await user.click(screen.getByRole('button', { name: 'Bo' }))
    await user.click(await screen.findByRole('button', { name: /Legg til \d+ hendelse/i }))

    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    // Deltakerliste-modell: 2 valgte dager = 2 inserts (ikke 4), hver med begge som deltakere.
    expect(createEvent.mock.calls.length).toBe(2)
    for (const call of createEvent.mock.calls) {
      const input = call[1] as { personId?: string | null; metadata?: { participants?: string[] } }
      expect(input.personId).toBeTruthy()
      expect(input.metadata?.participants).toEqual(expect.arrayContaining(['child-a', 'child-b']))
    }
  })

  it('CTA teller faktiske hendelser (dager), ikke antall × personer', async () => {
    const user = userEvent.setup()
    const twoChildren = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage onBack={() => undefined} people={twoChildren} createEvent={vi.fn()} createTask={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await user.click(await screen.findByRole('button', { name: 'Ada' }))
    await user.click(screen.getByRole('button', { name: 'Bo' }))

    const importBtn = screen.getByRole('button', { name: /Legg til \d+ hendelse/i })
    expect(importBtn.textContent).toContain('Legg til 2 hendelser')
  })

  it('bruker kan avvelge en person igjen', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const twoChildren = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={twoChildren}
        createEvent={createEvent}
        createTask={vi.fn()}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await user.click(await screen.findByRole('button', { name: 'Ada' }))
    await user.click(screen.getByRole('button', { name: 'Bo' }))
    await user.click(screen.getByRole('button', { name: 'Bo' })) // avvelg Bo igjen

    await user.click(await screen.findByRole('button', { name: /Legg til \d+ hendelse/i }))
    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    // Kun Ada gjelder nå – ingen deltakerliste.
    for (const call of createEvent.mock.calls) {
      const input = call[1] as { personId?: string | null; metadata?: { participants?: string[] } }
      expect(input.personId).toBe('child-a')
      expect(input.metadata?.participants).toBeUndefined()
    }
  })

  it('avvelg alle: import blokkeres med rolig melding og createEvent kalles ikke (ikke forrige valg)', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const twoChildren = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={twoChildren}
        createEvent={createEvent}
        createTask={vi.fn()}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await user.click(await screen.findByRole('button', { name: 'Ada' }))
    await user.click(screen.getByRole('button', { name: 'Bo' }))
    await user.click(screen.getByRole('button', { name: 'Ada' })) // avvelg
    await user.click(screen.getByRole('button', { name: 'Bo' })) // avvelg → ingen valgt

    await user.click(await screen.findByRole('button', { name: /Legg til \d+ hendelse/i }))

    expect(await screen.findByText(/Vi vet ikke hvem hendelsene gjelder/i)).toBeTruthy()
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('velg én → avvelg → velg en annen → import bruker den nye personen, ikke den gamle', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const twoChildren = [
      { id: 'child-a', name: 'Ada', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
      { id: 'child-b', name: 'Bo', memberKind: 'child' as const, colorTint: 'bg-slate-200', colorAccent: 'border-slate-400' },
    ]
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={twoChildren}
        createEvent={createEvent}
        createTask={vi.fn()}
        onImportFinished={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Høstcupen 2026 test')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    await user.click(await screen.findByRole('button', { name: 'Ada' })) // velg Ada
    await user.click(screen.getByRole('button', { name: 'Ada' })) // avvelg Ada
    await user.click(screen.getByRole('button', { name: 'Bo' })) // velg Bo

    await user.click(await screen.findByRole('button', { name: /Legg til \d+ hendelse/i }))
    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    for (const call of createEvent.mock.calls) {
      const input = call[1] as { personId?: string | null }
      expect(input.personId).toBe('child-b')
    }
  })

  it('viser både opplasting og lim-inn-tekst', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Last opp fil' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Eller lim inn tekst/i })).toBeTruthy()
  })

  it('filopplasting kaller dokument-analyse (ikke tekst) og ender i rich preview + viser filnavn', async () => {
    const user = userEvent.setup()
    vi.mocked(analyzeDocumentWithTankestrom).mockResolvedValueOnce(hostcupBundle)
    renderPage()

    const file = new File(['dummy'], 'cup.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Velg filer til analyse'), file)

    // Analyse starter ikke automatisk lenger — trykk «Analyser».
    await user.click(screen.getByRole('button', { name: 'Analyser' }))

    // Riktig analyse-handler kalles for fil — ikke tekst-grenen.
    await waitFor(() => expect(analyzeDocumentWithTankestrom).toHaveBeenCalledTimes(1))
    expect(analyzeTextWithTankestrom).not.toHaveBeenCalled()

    // Valgt fil vises med navn, og rich preview kommer opp.
    expect(screen.getByText('cup.pdf')).toBeTruthy()
    expect(await screen.findByText('Foreslåtte hendelser')).toBeTruthy()
  })

  it('viser forståelig feilmelding når filanalyse feiler (ikke rå feil)', async () => {
    const user = userEvent.setup()
    vi.mocked(analyzeDocumentWithTankestrom).mockRejectedValueOnce(new Error('Filtypen støttes ikke'))
    renderPage()

    // Støttet filtype (passerer input-accept), men selve analysen feiler.
    const file = new File(['dummy'], 'cup.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Velg filer til analyse'), file)

    await user.click(screen.getByRole('button', { name: 'Analyser' }))

    await waitFor(() => expect(analyzeDocumentWithTankestrom).toHaveBeenCalled())
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((a) => (a.textContent ?? '').trim().length > 0)).toBe(true)
  })

  async function analyzeSingleEvent(
    user: ReturnType<typeof userEvent.setup>,
    event: Record<string, unknown>
  ) {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValueOnce(makeSingleEventBundle(event))
    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Samling i morgen 18:00')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))
    await screen.findByText('Foreslåtte hendelser')
  }

  it('enkelthendelse: viser tidspunkt, notat/beskrivelse og sted når data finnes', async () => {
    const user = userEvent.setup()
    renderPage()
    await analyzeSingleEvent(user, {
      location: 'Sognsvann',
      notes: 'Ta med drikke. Vi møtes ved bommen.',
    })

    // Tittel er kalendertrygg: relativt datoord («i morgen») er strippet, ikke i overskriften.
    expect(screen.getByText('Samling ved Sognsvann')).toBeTruthy()
    // Tidspunkt vises i kort-sublabelen selv uten sluttid (ikke forveksle med tekstfeltet).
    expect(screen.getByText(/· 18:00/)).toBeTruthy()
    // Notat/beskrivelse vises.
    expect(screen.getByText(/Ta med drikke\. Vi møtes ved bommen\./)).toBeTruthy()
    // Sted vises som egen seksjon (label «Sted» + verdi).
    expect(screen.getByText('Sted')).toBeTruthy()
    expect(screen.getByText('Sognsvann')).toBeTruthy()
  })

  it('oppdateringskandidat: «Vis eksisterende» kaller onOpenExistingEvent med riktig id', async () => {
    const user = userEvent.setup()
    const onOpenExistingEvent = vi.fn()
    const existing = [
      {
        event: {
          id: 'cal-1',
          personId: null,
          title: 'Vårcuppen',
          start: '09:00',
          end: '10:00',
          metadata: {},
        },
        anchorDate: '2026-09-10',
      },
    ]
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={people}
        createEvent={vi.fn()}
        createTask={vi.fn()}
        getAnchoredForegroundEventsForMatching={() => existing}
        onOpenExistingEvent={onOpenExistingEvent}
      />
    )

    await analyzeSingleEvent(user, { title: 'Vårcuppen', end: '10:00' })

    expect(screen.getByText('Dette ser ut som en oppdatering til:')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Vis eksisterende' }))
    expect(onOpenExistingEvent).toHaveBeenCalledWith('cal-1')
  })

  it('oppdateringskandidat: telles ikke som ny import før «Importer som ny likevel»', async () => {
    const user = userEvent.setup()
    const existing = [
      {
        event: {
          id: 'cal-1',
          personId: null,
          title: 'Vårcuppen',
          start: '09:00',
          end: '10:00',
          metadata: {},
        },
        anchorDate: '2026-09-10',
      },
    ]
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={people}
        createEvent={vi.fn()}
        createTask={vi.fn()}
        getAnchoredForegroundEventsForMatching={() => existing}
      />
    )

    await analyzeSingleEvent(user, { title: 'Vårcuppen', end: '10:00' })

    // Behandles som mulig oppdatering → ekskludert fra standardimport (ikke telt).
    expect(await screen.findByText(/Å oppdatere eksisterende kommer i neste steg/)).toBeTruthy()
    expect(screen.getByText('Dette ser ut som en oppdatering til:')).toBeTruthy()
    expect(screen.queryByText(/Legg til 1 hendelse/)).toBeNull()

    // Eksplisitt «Importer som ny likevel» → eligible igjen, telles på nytt.
    await user.click(screen.getByRole('button', { name: 'Importer som ny likevel' }))
    expect(await screen.findByText(/Legg til 1 hendelse/)).toBeTruthy()
  })

  it('enkelthendelse: viser ta-med-info fra metadata (bringItems)', async () => {
    const user = userEvent.setup()
    renderPage()
    await analyzeSingleEvent(user, {
      notes: '',
      metadata: { bringItems: ['drikkeflaske', 'matpakke'] },
    })

    expect(screen.getByText('Husk / ta med')).toBeTruthy()
    expect(screen.getByText(/drikkeflaske/)).toBeTruthy()
  })

  it('enkelthendelse: møtested, gruppekode og praktisk info vises som egne seksjoner (ikke rå wrapper)', async () => {
    const user = userEvent.setup()
    renderPage()
    await analyzeSingleEvent(user, {
      title: 'Tur til Sognsvann',
      date: '2026-06-22',
      start: '',
      end: '',
      notes:
        'Viktig for hele perioden: Møtested: kiosken nedenfor parkeringsplassen på Sognsvann; NYT-TK-2STC',
    })

    expect(screen.getByText('Tur til Sognsvann')).toBeTruthy()
    // Møtested vises tydelig som egen seksjon.
    expect(screen.getByText('Møtested')).toBeTruthy()
    expect(screen.getByText('kiosken nedenfor parkeringsplassen på Sognsvann')).toBeTruthy()
    // Gruppe-/klassekode vises som «Gjelder», ikke blandet inn i møtested-linja.
    expect(screen.getByText('Gjelder')).toBeTruthy()
    expect(screen.getByText('NYT-TK-2STC')).toBeTruthy()
    // Den tekniske wrapper-frasen vises ikke ordrett for én enkelthendelse.
    expect(screen.queryByText(/Viktig for hele perioden/)).toBeNull()
  })

  it('enkelthendelse: «… i morgen kl 18» → tittel uten dato/tid, tid i tidsfeltet', async () => {
    const user = userEvent.setup()
    renderPage()
    await analyzeSingleEvent(user, {
      title: 'Samling ved Sognsvann i morgen kl 18',
      end: '19:00',
    })

    // Tittel er ren; klokkeslett og «i morgen» ligger ikke i overskriften.
    expect(screen.getByText('Samling ved Sognsvann')).toBeTruthy()
    expect(screen.queryByText('Samling ved Sognsvann i morgen kl 18')).toBeNull()
    // Tiden vises i kort-sublabelen.
    expect(screen.getByText(/· 18:00/)).toBeTruthy()
  })

  it('enkelthendelse uten ekstra detaljer: ren visning, ingen tomme seksjoner', async () => {
    const user = userEvent.setup()
    renderPage()
    await analyzeSingleEvent(user, { notes: '', location: '', end: '19:00', metadata: {} })

    expect(screen.getByText('Samling ved Sognsvann')).toBeTruthy()
    expect(screen.queryByText('Sted')).toBeNull()
    expect(screen.queryByText('Møtested')).toBeNull()
    expect(screen.queryByText('Notater')).toBeNull()
    expect(screen.queryByText('Husk / ta med')).toBeNull()
  })

  it('enkelthendelse: import beholder notat/beskrivelse i createEvent-payload', async () => {
    const user = userEvent.setup()
    const createEvent = vi.fn().mockResolvedValue(undefined)
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={people}
        createEvent={createEvent}
        createTask={vi.fn()}
        onImportFinished={() => undefined}
      />
    )
    // Komplett tidsrom her — manglende sluttid er ortogonalt og utenfor denne PR-en.
    await analyzeSingleEvent(user, {
      title: 'Samling ved Sognsvann i morgen kl 18',
      end: '19:00',
      location: 'Sognsvann',
      notes: 'Ta med drikke. Vi møtes ved bommen.',
    })

    await user.click(await screen.findByRole('button', { name: /Legg til \d+ hendelse/i }))
    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    const input = createEvent.mock.calls[0]![1] as { title?: string; notes?: string; location?: string }
    // Importert kalender-tittel = preview-tittel (kalendertrygg, uten dato/tid).
    expect(input.title).toBe('Samling ved Sognsvann')
    expect(input.notes ?? '').toContain('Ta med drikke')
    expect(input.location).toBe('Sognsvann')
  })

  // ---- Eksplisitt skoleimport-routing (documentKind === 'school') ----
  // Mock omgår parseren → bundelen brukes direkte; schoolBlockProposal kan være en stub.
  function makeSchoolResponse(opts: { overlay?: boolean; block?: boolean; events?: number; tasks?: number } = {}) {
    const { overlay = true, block = true, events = 2, tasks = 0 } = opts
    const eventItems = Array.from({ length: events }, (_, i) => ({
      proposalId: `bbbb1111-1111-4abc-9def-00000000000${i + 1}`,
      kind: 'event',
      sourceId: 'e2e',
      originalSourceType: 'pasted_text',
      confidence: 0.9,
      event: {
        date: '2026-06-15',
        personId: '',
        title: 'Ukeplan for eksamen og avslutning',
        start: '09:00',
        end: '14:00',
        metadata: { schoolContext: { itemType: 'general' } },
      },
    }))
    const taskItems = Array.from({ length: tasks }, (_, i) => ({
      proposalId: `cccc2222-2222-4abc-9def-00000000000${i + 1}`,
      kind: 'task',
      sourceId: 'e2e',
      originalSourceType: 'pasted_text',
      confidence: 0.9,
      task: { date: '2026-06-16', title: 'Lekse i matematikk' },
    }))
    const b: Record<string, unknown> = {
      schemaVersion: '1.0.0',
      provenance: { sourceSystem: 'tankestrom', sourceType: 'e2e', generatedAt: '2026-05-08T20:00:00.000Z', importRunId: 'sb-1' },
      items: [...eventItems, ...taskItems],
    }
    if (overlay) {
      b.schoolWeekOverlayProposal = {
        proposalId: 'overlay-sb-1',
        kind: 'school_week_overlay',
        schemaVersion: '1.0.0',
        confidence: 0.9,
        originalSourceType: 'pasted_text',
        weeklySummary: ['Uke 25'],
        classLabel: '2STC',
        dailyActions: { 3: { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'matematikk' }] } },
      }
    }
    if (block) b.schoolBlockProposal = { kind: 'school_block', proposalId: 'sb-block-1' }
    return b as unknown as Awaited<ReturnType<typeof analyzeTextWithTankestrom>>
  }

  async function analyzeAsSchool(user: ReturnType<typeof userEvent.setup>, text = 'Skoleuke 25') {
    await user.click(screen.getByRole('button', { name: /Skole/ }))
    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), text)
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))
  }

  function renderSchoolPage() {
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const createTask = vi.fn().mockResolvedValue(undefined)
    const updatePerson = vi.fn().mockResolvedValue(undefined)
    render(
      <TankestrømPage
        onBack={() => undefined}
        people={stellanOgIda}
        createEvent={createEvent}
        createTask={createTask}
        updatePerson={updatePerson}
        onImportFinished={() => undefined}
      />
    )
    return { createEvent, createTask, updatePerson }
  }

  it('eksplisitt skole + overlay + event- OG task-items: begge seksjoner skjules, knapp «Importer skoleinformasjon», klikk persisterer KUN overlay (0 createEvent/createTask)', async () => {
    // Fixturen inneholder BÅDE event- og task-items → 0 createTask er meningsfullt (task-gate persistmessig sikker).
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(makeSchoolResponse({ overlay: true, block: true, events: 5, tasks: 1 }))
    const user = userEvent.setup()
    const { createEvent, createTask, updatePerson } = renderSchoolPage()

    await analyzeAsSchool(user)

    // Overlay-preview vises; ingen generiske event-/task-kort / «Legg til N hendelser».
    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
    expect(screen.queryByText('Foreslåtte hendelser')).toBeNull()
    expect(screen.queryByText('Foreslåtte gjøremål')).toBeNull()
    expect(screen.queryByRole('button', { name: /Legg til \d+ hendelse/i })).toBeNull()

    const importBtn = screen.getByRole('button', { name: 'Importer skoleinformasjon' })
    expect(importBtn).toBeTruthy()
    await user.click(importBtn)

    await waitFor(() => expect(updatePerson).toHaveBeenCalledTimes(1)) // overlay persistert ÉN gang
    expect(createEvent).toHaveBeenCalledTimes(0)
    expect(createTask).toHaveBeenCalledTimes(0)
  })

  it('eksplisitt skole + overlay UTEN schoolBlock: overlay-fallback fungerer, ingen event-fallback, overlay-only persist', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(makeSchoolResponse({ overlay: true, block: false, events: 3 }))
    const user = userEvent.setup()
    const { createEvent, createTask, updatePerson } = renderSchoolPage()

    await analyzeAsSchool(user)

    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
    expect(screen.queryByText('Foreslåtte hendelser')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Importer skoleinformasjon' }))
    await waitFor(() => expect(updatePerson).toHaveBeenCalled())
    expect(createEvent).toHaveBeenCalledTimes(0)
    expect(createTask).toHaveBeenCalledTimes(0)
  })

  it('eksplisitt skole + schoolBlock UTEN overlay: event-kort skjult, blokkeringstekst + undermelding, knapp deaktivert, ingen persist', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(makeSchoolResponse({ overlay: false, block: true, events: 5 }))
    const user = userEvent.setup()
    const { createEvent, createTask, updatePerson } = renderSchoolPage()

    await analyzeAsSchool(user)

    expect(await screen.findByText('Analysen ga ingen importerbar skoleblokk')).toBeTruthy()
    expect(screen.getByText(/kan ikke lagres i skoleblokken med dagens importformat/)).toBeTruthy()
    expect(screen.queryByText('Foreslåtte hendelser')).toBeNull()
    const btn = screen.getByRole('button', { name: 'Ingen gyldig skoleblokk' })
    expect(btn.hasAttribute('disabled')).toBe(true)
    expect(createEvent).toHaveBeenCalledTimes(0)
    expect(createTask).toHaveBeenCalledTimes(0)
    expect(updatePerson).toHaveBeenCalledTimes(0)
  })

  it('eksplisitt skole UTEN skoleproposal (kun events): blokkering m/ re-analyse-undermelding, event-kort skjult, ingen persist', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(makeSchoolResponse({ overlay: false, block: false, events: 5 }))
    const user = userEvent.setup()
    const { createEvent, updatePerson } = renderSchoolPage()

    await analyzeAsSchool(user)

    expect(await screen.findByText('Analysen ga ingen importerbar skoleblokk')).toBeTruthy()
    expect(screen.getByText(/analysere dokumentet på nytt/)).toBeTruthy()
    expect(screen.queryByText('Foreslåtte hendelser')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ingen gyldig skoleblokk' }).hasAttribute('disabled')).toBe(true)
    expect(createEvent).toHaveBeenCalledTimes(0)
    expect(updatePerson).toHaveBeenCalledTimes(0)
  })

  it('event_doc (regresjon): eksisterende hendelsesflyt uendret — event-kort + «Legg til N hendelser»', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(makeSchoolResponse({ overlay: false, block: false, events: 2 }))
    const user = userEvent.setup()
    renderSchoolPage()

    await user.click(screen.getByRole('button', { name: /Arrangement/ })) // event_doc
    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Et arrangement')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    expect(await screen.findByText('Foreslåtte hendelser')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Legg til \d+ hendelse/i })).toBeTruthy()
    expect(screen.queryByText('Analysen ga ingen importerbar skoleblokk')).toBeNull()
  })

  it('auto (regresjon): overlay + event-items → BÅDE overlay- og event-preview vises, «Legg til N hendelser», ikke skoleknapp/blokkering (fiksen gjelder KUN school)', async () => {
    // Ingen doktype-valg → documentKind='auto'. Skolefiksen (skjuling/blokkering) skal IKKE gjelde her.
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(makeSchoolResponse({ overlay: true, block: false, events: 2, tasks: 0 }))
    const user = userEvent.setup()
    renderSchoolPage()

    await user.click(screen.getByRole('button', { name: /Eller lim inn tekst/i }))
    await user.type(screen.getByPlaceholderText(/Lim inn ukeplan/i), 'Auto-dokument')
    await user.click(screen.getByRole('button', { name: 'Analyser tekst' }))

    // Auto: overlay-preview OG event-preview vises samtidig; eksisterende event-knappetekst.
    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
    expect(screen.getByText('Foreslåtte hendelser')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Legg til \d+ hendelse/i })).toBeTruthy()
    // Ingen av skolemodus-elementene:
    expect(screen.queryByRole('button', { name: 'Importer skoleinformasjon' })).toBeNull()
    expect(screen.queryByText('Analysen ga ingen importerbar skoleblokk')).toBeNull()
    // (Kombinert overlay+event-persist for auto er dekket av eksisterende enkelt-event- og Fiks 1-tester.)
  })

  // ---- schoolBlockProposal som autoritativ dagskilde i preview (day operations) ----
  function schoolBlockWithDays() {
    return {
      kind: 'school_block',
      proposalId: 'sb-block-1',
      schemaVersion: '1.0.0',
      personId: 'stellan',
      days: [
        {
          dayId: 'd0',
          weekdayIndex: '0',
          dayOperation: { op: 'none' },
          contentItems: [{ itemId: 'c0', sourceText: 'Bokinnlevering 2STC', title: '' }],
        },
        {
          dayId: 'd4',
          weekdayIndex: '4',
          dayOperation: {
            op: 'replace_day',
            activityKind: 'other',
            effectiveStart: '09:00',
            effectiveEnd: '12:00',
            reason: 'Siste skoledag med opplegg',
          },
          contentItems: [],
        },
      ],
    }
  }

  it('eksplisitt skole + schoolBlock MED gyldige dager UTEN overlay: preview vises (replace_day), blokkering undertrykt, ingen event-fallback', async () => {
    const resp = makeSchoolResponse({ overlay: false, block: false, events: 4 })
    ;(resp as unknown as Record<string, unknown>).schoolBlockProposal = schoolBlockWithDays()
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(resp)
    const user = userEvent.setup()
    const { createEvent, updatePerson } = renderSchoolPage()

    await analyzeAsSchool(user)

    // schoolBlock-preview er autoritativ: heading + replace_day-opplegget vises.
    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
    expect(screen.getByText('Siste skoledag med opplegg')).toBeTruthy()
    expect(screen.getByText('09:00–12:00')).toBeTruthy()
    expect(screen.getByText('Bokinnlevering 2STC')).toBeTruthy()
    // Blokkeringsmeldingen er undertrykt (gyldig preview finnes); event-kort skjult.
    expect(screen.queryByText('Analysen ga ingen importerbar skoleblokk')).toBeNull()
    expect(screen.queryByText('Foreslåtte hendelser')).toBeNull()
    // Persist/import uendret i denne fasen — ingen event-fallback.
    expect(createEvent).toHaveBeenCalledTimes(0)
    expect(updatePerson).toHaveBeenCalledTimes(0)
  })

  it('schoolBlock med løst child-audience vinner over overlay-tekst; legacy-komponent ikke rendret', async () => {
    // A-tilfellet: schoolBlock-dagen har resolvedChildAudience → schoolBlock-tekst er autoritativ,
    // overlay ignoreres som tekstkilde, og legacy-komponenten (med seksjonsoverskrift) rendres ikke.
    const resp = makeSchoolResponse({ overlay: true, block: false, events: 0 })
    const b = resp as unknown as Record<string, unknown>
    ;(b.schoolWeekOverlayProposal as Record<string, unknown>).dailyActions = {
      0: { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'matematikk', sections: { lekse: ['LEGACY-OVERLAY-TEKST'] } }] },
    }
    b.schoolBlockProposal = {
      kind: 'school_block',
      proposalId: 'sb-block-1',
      schemaVersion: '1.0.0',
      personId: 'stellan',
      days: [
        {
          dayId: 'd0',
          weekdayIndex: '0',
          dayOperation: { op: 'none' },
          contentItems: [
            { itemId: 'c0', title: 'Bokinnlevering', resolvedChildAudience: { audienceEntryId: 'x', start: '10:30', end: '11:00', room: null, teacher: null } },
          ],
        },
      ],
    }
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(resp)
    const user = userEvent.setup()
    renderSchoolPage()

    await analyzeAsSchool(user)

    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
    expect(screen.getByText('Bokinnlevering · 10:30–11:00')).toBeTruthy() // schoolBlock A vinner
    expect(screen.queryByText('LEGACY-OVERLAY-TEKST')).toBeNull() // overlay ignorert
    expect(screen.queryByText('Lekse')).toBeNull() // ingen legacy seksjonsoverskrift
  })

  it('schoolBlock uten løst audience + overlay → overlay-tekst vises flat (uten seksjonsoverskrift)', async () => {
    // B-tilfellet: schoolBlock-dagen mangler løst audience → overlayets barnerelevante tekst brukes,
    // men flatet ut (ingen «Lekse»-overskrift, ingen subjectKey), og bred common-tekst vises ikke.
    const resp = makeSchoolResponse({ overlay: true, block: false, events: 0 })
    const b = resp as unknown as Record<string, unknown>
    ;(b.schoolWeekOverlayProposal as Record<string, unknown>).dailyActions = {
      0: { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'matematikk', sections: { lekse: ['Les kapittel 3'] } }] },
    }
    b.schoolBlockProposal = {
      kind: 'school_block',
      proposalId: 'sb-block-1',
      schemaVersion: '1.0.0',
      personId: 'stellan',
      days: [
        {
          dayId: 'd0',
          weekdayIndex: '0',
          dayOperation: { op: 'none' },
          contentItems: [{ itemId: 'c0', sourceText: '2STA, 2STB, 2STC leverer alle bok' }],
        },
      ],
    }
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(resp)
    const user = userEvent.setup()
    renderSchoolPage()

    await analyzeAsSchool(user)

    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
    expect(screen.getByText('Les kapittel 3')).toBeTruthy() // overlay-fallback (flat)
    expect(screen.queryByText('Lekse')).toBeNull() // ingen seksjonsoverskrift
    expect(screen.queryByText(/2STA, 2STB, 2STC leverer alle bok/)).toBeNull() // bred common ikke vist
  })

  // ---- canonicalSchoolContentDraft som autoritativ kilde ----
  function canonicalDraftWithDays() {
    return {
      schemaVersion: '1.0.0',
      sourceTitle: 'Ukeplan uke 25',
      originalSourceType: 'school_activity_plan',
      personId: 'stellan',
      personMatchStatus: 'matched',
      classCode: '2STC',
      structureStatus: 'complete',
      reviewFlags: [],
      days: [
        {
          dayId: 'd1',
          date: '2026-06-16',
          weekdayIndex: '1',
          dayLabel: null,
          dayOperation: { op: 'none' },
          dayResolution: 'enrich_only',
          subjectItems: [
            { sourceId: 's1', itemId: 'c1', sourceRef: null, placement: 'subject', contentType: 'lesson', action: 'enrich', subject: 'Matematikk', subjectKey: 'matematikk', customLabel: null, start: null, end: null, audienceEntries: [], sections: null, sourceText: 'Forberedelsesdag til heldagsprøve', evidence: null, confidence: 0.9, reviewFlags: [] },
          ],
          audienceItems: [],
          generalDayMessages: [
            { sourceId: 's2', itemId: 'c2', sourceRef: null, placement: 'day', contentType: 'message', action: 'enrich', subject: null, subjectKey: null, customLabel: null, start: null, end: null, audienceEntries: [], sections: null, sourceText: 'Husk skolebøker', evidence: null, confidence: 0.9, reviewFlags: [] },
          ],
          confidence: 0.9,
          evidence: null,
          reviewFlags: [],
        },
      ],
    }
  }

  it('canonicalSchoolContentDraft er autoritativ: canonical-preview vises, blokkering undertrykt, ingen event-fallback', async () => {
    const resp = makeSchoolResponse({ overlay: true, block: true, events: 3 })
    const b = resp as unknown as Record<string, unknown>
    // Overlay har distinkt tekst som IKKE skal vises når canonical er autoritativ.
    ;(b.schoolWeekOverlayProposal as Record<string, unknown>).dailyActions = {
      1: { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'matematikk', sections: { lekse: ['LEGACY-OVERLAY-TEKST'] } }] },
    }
    b.canonicalSchoolContentDraft = canonicalDraftWithDays()
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(resp)
    const user = userEvent.setup()
    const { createEvent, updatePerson } = renderSchoolPage()

    await analyzeAsSchool(user)

    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
    expect(screen.getByText('Forberedelsesdag til heldagsprøve')).toBeTruthy() // canonical subject-item
    expect(screen.getByText('Husk skolebøker')).toBeTruthy() // canonical general message
    expect(screen.queryByText('LEGACY-OVERLAY-TEKST')).toBeNull() // schoolBlock/overlay ikke rendret parallelt
    expect(screen.queryByText('Analysen ga ingen importerbar skoleblokk')).toBeNull()
    expect(screen.queryByText('Foreslåtte hendelser')).toBeNull()
    expect(createEvent).toHaveBeenCalledTimes(0)
    expect(updatePerson).toHaveBeenCalledTimes(0) // persist fra canonical ikke koblet ennå
  })

  it('canonical persist: importknapp lagrer canonical-snapshot additivt på SchoolWeekOverlay (ingen legacy-oversettelse)', async () => {
    const resp = makeSchoolResponse({ overlay: false, block: false, events: 0 })
    ;(resp as unknown as Record<string, unknown>).canonicalSchoolContentDraft = canonicalDraftWithDays()
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(resp)
    const user = userEvent.setup()
    const { createEvent, createTask, updatePerson } = renderSchoolPage()

    await analyzeAsSchool(user)

    const importBtn = await screen.findByRole('button', { name: 'Importer skoleinformasjon' })
    expect(importBtn.hasAttribute('disabled')).toBe(false)
    await user.click(importBtn)

    await waitFor(() => expect(updatePerson).toHaveBeenCalledTimes(1))
    expect(createEvent).toHaveBeenCalledTimes(0)
    expect(createTask).toHaveBeenCalledTimes(0)
    const [cid, patch] = updatePerson.mock.calls[0]! as [string, { school: { weekOverlays: Array<Record<string, unknown>> } }]
    expect(cid).toBe('stellan')
    const overlays = patch.school.weekOverlays
    expect(overlays).toHaveLength(1) // replace-by-week: én post for uken
    const stored = overlays[0]!
    expect(stored.canonicalSchoolContentDraft).toBeTruthy() // snapshot lagret additivt
    expect(stored.dailyActions).toEqual({}) // ingen legacy-oversettelse
    const draft = stored.canonicalSchoolContentDraft as { days: Array<{ subjectItems: unknown[] }> }
    expect(draft.days[0]!.subjectItems).toHaveLength(1) // fag-plassering bevart i snapshotet
  })

  it('K. legacy fallback: uten canonical draft brukes schoolBlock/overlay-previewen (uendret)', async () => {
    // Ingen canonicalSchoolContentDraft → overlay-previewen (legacy) vises som før.
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(makeSchoolResponse({ overlay: true, block: false, events: 3 }))
    const user = userEvent.setup()
    const { createEvent } = renderSchoolPage()

    await analyzeAsSchool(user)

    expect(await screen.findByText('Slik blir skole-uken')).toBeTruthy()
    expect(screen.queryByText('Foreslåtte hendelser')).toBeNull()
    expect(createEvent).toHaveBeenCalledTimes(0)
  })

})

describe('parse: task personMatchStatus (tolerant — Vei 1)', () => {
  function taskOf(task: Record<string, unknown>) {
    const b = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance: {
        sourceSystem: 'tankestrom',
        sourceType: 'e2e_fixture',
        generatorVersion: 'test',
        generatedAt: '2026-05-08T20:00:00.000Z',
        importRunId: 'parse-task-1',
      },
      items: [
        {
          proposalId: 'c0ffee00-1111-4abc-9def-000000000001',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.9,
          task: { date: '2026-09-10', title: 'Lekse', ...task },
        },
      ],
    })
    const item = b.items[0]
    if (!item || item.kind !== 'task') throw new Error('forventet task-item')
    return item.task
  }

  it('leser personMatchStatus + personId når serveren sender dem', () => {
    const t = taskOf({ personMatchStatus: 'matched', personId: 'p-ida' })
    expect(t.personMatchStatus).toBe('matched')
    expect(t.personId).toBe('p-ida')
  })

  it('manglende personMatchStatus (gammel server) → not_specified, personId undefined', () => {
    const t = taskOf({ childPersonId: 'p-ida' })
    expect(t.personMatchStatus).toBe('not_specified')
    expect(t.personId).toBeUndefined()
  })

  it('ukjent personMatchStatus → not_specified (tolerant)', () => {
    const t = taskOf({ personMatchStatus: 'noe-rart' })
    expect(t.personMatchStatus).toBe('not_specified')
  })

  it('child_unresolved bevares', () => {
    const t = taskOf({ personMatchStatus: 'child_unresolved' })
    expect(t.personMatchStatus).toBe('child_unresolved')
  })
})

describe('eksplisitt skole: defense-in-depth (approveSelected-barriere i hooken)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function hookBundle() {
    return {
      schemaVersion: '1.0.0',
      provenance: { sourceSystem: 'tankestrom', sourceType: 'e2e', generatedAt: '2026-05-08T20:00:00.000Z', importRunId: 'hk-1' },
      items: [
        {
          proposalId: 'dddd1111-1111-4abc-9def-000000000001',
          kind: 'event',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.9,
          event: { date: '2026-06-15', personId: 'stellan', title: 'Skole-event', start: '09:00', end: '10:00', metadata: {} },
        },
        {
          proposalId: 'dddd2222-2222-4abc-9def-000000000001',
          kind: 'task',
          sourceId: 'e2e',
          originalSourceType: 'pasted_text',
          confidence: 0.9,
          task: { date: '2026-06-16', title: 'Skole-task', childPersonId: 'stellan' },
        },
      ],
      schoolWeekOverlayProposal: {
        proposalId: 'ov-hk',
        kind: 'school_week_overlay',
        schemaVersion: '1.0.0',
        confidence: 0.9,
        originalSourceType: 'pasted_text',
        weeklySummary: [],
        dailyActions: {},
      },
    } as unknown as Awaited<ReturnType<typeof analyzeTextWithTankestrom>>
  }

  function renderImportHook() {
    const createEvent = vi.fn().mockResolvedValue(undefined)
    const createTask = vi.fn().mockResolvedValue(undefined)
    const editEvent = vi.fn().mockResolvedValue(undefined)
    const updatePerson = vi.fn().mockResolvedValue(undefined)
    const view = renderHook(() =>
      useTankestromImport({ open: true, people: stellanOgIda, createEvent, createTask, editEvent, updatePerson })
    )
    return { ...view, createEvent, createTask, editEvent, updatePerson }
  }

  it('approveSelected DIREKTE i skolemodus (event+task valgt) → ok=false, 0 createEvent/createTask/editEvent (avvist FØR persist)', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(hookBundle())
    const { result, createEvent, createTask, editEvent } = renderImportHook()

    // Last inn bundle (auto), velg event+task, bytt til skole.
    act(() => { result.current.setTextInput('doc til analyse') })
    await act(async () => { await result.current.runAnalyze() })
    // Velg alle importerbare items → persist VILLE skjedd uten barrieren (meningsfull 0-assert).
    act(() => {
      for (const item of result.current.primaryCalendarProposalItems) result.current.toggleProposal(item.proposalId)
    })
    act(() => { result.current.setDocumentKind('school') })

    // Kall den GENERISKE handleren direkte (ikke sidehandleren) — sekundær sikkerhetsbarriere.
    let res: Awaited<ReturnType<typeof result.current.approveSelected>> | undefined
    await act(async () => { res = await result.current.approveSelected() })

    expect(res?.ok).toBe(false)
    expect(createEvent).toHaveBeenCalledTimes(0)
    expect(createTask).toHaveBeenCalledTimes(0)
    expect(editEvent).toHaveBeenCalledTimes(0)
  })

  it('re-analyse: documentKind=school beholdes over to runAnalyze — begge API-kall sender «school», overlay bevart', async () => {
    vi.mocked(analyzeTextWithTankestrom).mockResolvedValue(hookBundle())
    const { result } = renderImportHook()

    act(() => { result.current.setDocumentKind('school') })
    act(() => { result.current.setTextInput('Skoleuke A') })
    await act(async () => { await result.current.runAnalyze() }) // kall 1
    await act(async () => { await result.current.runAnalyze() }) // kall 2 (re-analyse, samme doktype)

    expect(result.current.documentKind).toBe('school')
    const calls = vi.mocked(analyzeTextWithTankestrom).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls[0]![2]).toBe('school')
    expect(calls[1]![2]).toBe('school')
    expect(result.current.bundle?.schoolWeekOverlayProposal).toBeTruthy()
  })
})

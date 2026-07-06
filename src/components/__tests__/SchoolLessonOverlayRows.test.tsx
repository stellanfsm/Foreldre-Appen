// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SchoolLessonSlot, SchoolWeekOverlayDayAction } from '../../types'
import { LessonOverlayBoxReadOnly, OverlayUpdateReadOnly } from '../SchoolLessonOverlayRows'

afterEach(cleanup)

const naturfag: SchoolLessonSlot = { subjectKey: 'naturfag', start: '08:00', end: '09:00' }

function enrich(subjectUpdates: SchoolWeekOverlayDayAction['subjectUpdates']): SchoolWeekOverlayDayAction {
  return { action: 'enrich_existing_school_block', subjectUpdates }
}

describe('LessonOverlayBoxReadOnly (import-preview, Opsjon A)', () => {
  it('matcher RÅ overlay-subjectKey «Naturfag» mot NORMALISERT lesson «naturfag» og viser innhold', () => {
    render(
      <LessonOverlayBoxReadOnly
        lesson={naturfag}
        overlayDayAction={enrich([{ subjectKey: 'Naturfag', sections: { lekse: ['Les s.10'] } }])}
      />
    )
    expect(screen.getByText('Naturfag')).toBeTruthy()
    expect(screen.getByText('Lekse')).toBeTruthy()
    expect(screen.getByText('Les s.10')).toBeTruthy()
  })

  it('umatchet fag (Spansk) → INGEN boks i det hele tatt (Punkt 5: renere enn tom-tilstands-tekst)', () => {
    const { container } = render(
      <LessonOverlayBoxReadOnly
        lesson={naturfag}
        overlayDayAction={enrich([{ subjectKey: 'Spansk', sections: { lekse: ['Gloser'] } }])}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('replace-dag viser alle linjer flatt — uten «Uke-overlay»-header (Punkt 5)', () => {
    render(
      <LessonOverlayBoxReadOnly
        lesson={undefined}
        overlayDayAction={{ action: 'replace_school_block', subjectUpdates: [{ subjectKey: 'Heldagsprøve' }] }}
        isReplaceDay
      />
    )
    expect(screen.getByText('Heldagsprøve')).toBeTruthy()
    expect(screen.queryByText(/Uke-overlay/)).toBeNull()
  })

  it('matchet rad viser innhold uten header (Punkt 5)', () => {
    render(
      <LessonOverlayBoxReadOnly
        lesson={naturfag}
        overlayDayAction={enrich([{ subjectKey: 'Naturfag', sections: { lekse: ['Les s.10'] } }])}
      />
    )
    expect(screen.getByText('Les s.10')).toBeTruthy()
    expect(screen.queryByText(/Uke-overlay/)).toBeNull()
  })
})

describe('OverlayUpdateReadOnly (read-only linje)', () => {
  it('viser fag + seksjoner, men INGEN Rediger-knapp', () => {
    render(
      <ul>
        <OverlayUpdateReadOnly update={{ subjectKey: 'Norsk', sections: { iTimen: ['Kap 3'] } }} />
      </ul>
    )
    expect(screen.getByText('Norsk')).toBeTruthy()
    expect(screen.getByText('I timen')).toBeTruthy()
    expect(screen.getByText('Kap 3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Rediger' })).toBeNull()
  })
})

describe('klassekode-utheving på overlay-seksjonslinjer (fiks a — mode="spans")', () => {
  const LINJE = 'Bokinnlevering: 2STA 13.10-13.40, 2STC 10.30-11.00'
  const update = { subjectKey: 'other', sections: { ekstraBeskjed: [LINJE] } }

  it('med childClassCode: 2STC-segmentet fremhevet (strong), 2STA-segmentet (m/ tidsrom) dempet, felles-tekst plain', () => {
    render(
      <ul>
        <OverlayUpdateReadOnly update={update} childClassCode="2STC" />
      </ul>
    )
    const own = screen.getByText('2STC 10.30-11.00')
    expect(own.tagName).toBe('STRONG')
    expect(own.className).toContain('font-semibold')
    expect(screen.getByText('2STA 13.10-13.40,').className).toContain('opacity-60')
    // Felles-prefikset «Bokinnlevering: » forblir uuthevet (ren tekst-node, verken strong eller dempet):
    const li = own.closest('li')!
    expect(li.textContent).toContain('Bokinnlevering:')
  })

  it('segment-demping: HELE «2STA Anette og Andreas»-segmentet dempes (kode + navn)', () => {
    render(
      <ul>
        <OverlayUpdateReadOnly
          update={{ subjectKey: 'other', sections: { ekstraBeskjed: ['Avslutning: 2STA Anette og Andreas, 2STC Marte og Agnes'] } }}
          childClassCode="2STC"
        />
      </ul>
    )
    expect(screen.getByText('2STA Anette og Andreas,').className).toContain('opacity-60')
    expect(screen.getByText('2STC Marte og Agnes').tagName).toBe('STRONG')
  })

  it('UTEN childClassCode → no-op: rå tekst, ingen strong/demping', () => {
    const { container } = render(
      <ul>
        <OverlayUpdateReadOnly update={update} />
      </ul>
    )
    expect(screen.getByText(LINJE)).toBeTruthy()
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('.opacity-60')).toBeNull()
  })

  it('linje UTEN klassekoder → uendret (no-op), også med childClassCode satt', () => {
    const { container } = render(
      <ul>
        <OverlayUpdateReadOnly
          update={{ subjectKey: 'other', sections: { lekse: ['Husk gymtøy til fredag'] } }}
          childClassCode="2STC"
        />
      </ul>
    )
    expect(screen.getByText('Husk gymtøy til fredag')).toBeTruthy()
    expect(container.querySelector('strong')).toBeNull()
  })

  it('childClassCode tres gjennom LessonOverlayBoxReadOnly (fag-plasserte linjer får samme utheving)', () => {
    render(
      <LessonOverlayBoxReadOnly
        lesson={naturfag}
        overlayDayAction={{
          action: 'enrich_existing_school_block',
          subjectUpdates: [{ subjectKey: 'Naturfag', sections: { lekse: [LINJE] } }],
        }}
        childClassCode="2STC"
      />
    )
    expect(screen.getByText('2STC 10.30-11.00').tagName).toBe('STRONG')
    expect(screen.getByText('2STA 13.10-13.40,').className).toContain('opacity-60')
  })
})

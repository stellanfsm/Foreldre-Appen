import { describe, expect, it } from 'vitest'
import { getTankestromAnalyzeErrorMessage } from '../tankestromApi'

describe('getTankestromAnalyzeErrorMessage', () => {
  it('bruker strukturert fileErrors ved 500, ikke «kunne ikke lese svar»', () => {
    const responseText = JSON.stringify({
      ok: false,
      items: [],
      fileErrors: [
        {
          fileName: 'boardingpass.webp',
          errorCode: 'ANALYZE_INTERNAL_ERROR',
          message: 'Kunne ikke analysere dokumentet.',
          debugMessage: 'TypeError: passengerName.trim is not a function',
          stage: 'toPortalBundle',
        },
      ],
    })
    const payload = JSON.parse(responseText) as unknown
    const msg = getTankestromAnalyzeErrorMessage(500, responseText, payload)

    expect(msg).toContain('Kunne ikke analysere dokumentet')
    expect(msg).toContain('TypeError: passengerName.trim is not a function')
    expect(msg.toLowerCase()).not.toContain('kunne ikke lese svar')
  })

  it('bruker Fase: stage når debugMessage mangler', () => {
    const payload = {
      ok: false,
      fileErrors: [{ message: 'Noe gikk galt', stage: 'parseUpload' }],
    }
    const msg = getTankestromAnalyzeErrorMessage(500, '{}', payload)
    expect(msg).toContain('Noe gikk galt')
    expect(msg).toContain('Fase: parseUpload')
  })

  it('legger ved kort råtekst når JSON ikke kan tolkes som struktur', () => {
    const raw = '<html>Internal Server Error</html>'
    const msg = getTankestromAnalyzeErrorMessage(500, raw, null)
    expect(msg).toContain('Serverfeil (500)')
    expect(msg).toContain('Detalj:')
    expect(msg).toContain('<html>')
  })

  it('oppsummerer flere fileErrors i detalj', () => {
    const payload = {
      fileErrors: [
        { fileName: 'a.pdf', message: 'Feil A' },
        { fileName: 'b.pdf', message: 'Feil B' },
      ],
    }
    const msg = getTankestromAnalyzeErrorMessage(500, '', payload)
    expect(msg).toContain('Feil A')
    expect(msg).toMatch(/b\.pdf.*Feil B|Feil B.*b\.pdf/)
  })
})

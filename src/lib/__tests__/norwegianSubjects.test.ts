import { describe, expect, it } from 'vitest'
import { inferSubjectKeyFromText, matchSubjectFromText, subjectLabelForKey } from '../../data/norwegianSubjects'

describe('subjectLabelForKey', () => {
  it('viser katalognavn når customLabel mangler', () => {
    expect(subjectLabelForKey('5-7', 'norsk', undefined)).toBe('Norsk')
  })

  it('setter sammen katalog + kort tillegg (f.eks. utenom)', () => {
    expect(subjectLabelForKey('5-7', 'norsk', 'Utenom')).toBe('Norsk · Utenom')
  })

  it('bevarer full importert streng når den allerede inneholder fagnavnet', () => {
    expect(subjectLabelForKey('5-7', 'norsk', 'Norsk utenom')).toBe('Norsk utenom')
  })

  it('viser bare fritekst for generiske fag (fremmedspråk)', () => {
    expect(subjectLabelForKey('8-10', 'fremmedspråk', 'Spansk')).toBe('Spansk')
  })

  it('viser bare fritekst for valgfag', () => {
    expect(subjectLabelForKey('5-7', 'valgfag', 'Programmering')).toBe('Programmering')
  })

  it('prioriterer lessonSubcategory over customLabel for generiske fag', () => {
    expect(subjectLabelForKey('8-10', 'fremmedspråk', 'Spansk', 'Tysk')).toBe('Tysk')
  })
})

describe('inferSubjectKeyFromText', () => {
  it('gjenkjenner vanlige fag fra ren tekst', () => {
    expect(inferSubjectKeyFromText('5-7', 'Samfunnsfag')).toBe('samfunnsfag')
    expect(inferSubjectKeyFromText('5-7', 'Naturfag')).toBe('naturfag')
    expect(inferSubjectKeyFromText('5-7', 'Engelsk')).toBe('engelsk')
    expect(inferSubjectKeyFromText('5-7', 'KRLE')).toBe('krle')
    expect(inferSubjectKeyFromText('5-7', 'Valgfag')).toBe('valgfag')
    expect(inferSubjectKeyFromText('5-7', 'Kroppsøving')).toBe('kroppsøving')
  })

  it('finner key fra label', () => {
    expect(inferSubjectKeyFromText('5-7', 'Valgfag')).toBe('valgfag')
  })

  it('finner key fra variant av label', () => {
    expect(inferSubjectKeyFromText('5-7', 'kunst og håndverk')).toBe('kunst_håndverk')
  })

  it('gjenkjenner prefiks med fag + tillegg', () => {
    expect(inferSubjectKeyFromText('5-7', 'Norsk utenom')).toBe('norsk')
  })

  it('returnerer null når teksten ikke starter med et katalogfag', () => {
    expect(inferSubjectKeyFromText('5-7', 'Ekstra samfunnsfag')).toBeNull()
  })
})

describe('matchSubjectFromText', () => {
  it('klassifiserer prefiks som fagnavn + tillegg', () => {
    expect(matchSubjectFromText('5-7', 'Samfunnsfag D2')).toEqual({
      subjectKey: 'samfunnsfag',
      matchType: 'prefix',
    })
  })
})

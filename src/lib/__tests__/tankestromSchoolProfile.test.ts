import { describe, expect, it } from 'vitest'
import { parseChildSchoolProfile, parsePortalImportProposalBundle } from '../tankestromApi'

const provenance = {
  sourceSystem: 'tankestrom' as const,
  sourceType: 'test',
  generatedAt: '2026-01-01T12:00:00Z',
  importRunId: '00000000-0000-4000-8000-000000000001',
}

describe('parseChildSchoolProfile', () => {
  it('parser gyldig profil med én dag og timer', () => {
    const p = parseChildSchoolProfile(
      {
        gradeBand: '5-7',
        weekdays: {
          0: {
            useSimpleDay: false,
            lessons: [
              { subjectKey: 'matematikk', start: '08:15', end: '09:00' },
              { subjectKey: 'norsk', start: '09:15', end: '10:00' },
            ],
          },
        },
      },
      'test'
    )
    expect(p.gradeBand).toBe('5-7')
    expect(p.weekdays[0]?.lessons).toHaveLength(2)
    expect(p.weekdays[0]?.lessons?.[0]?.subjectKey).toBe('matematikk')
  })

  it('normaliserer subjectKey som finnes i alias (f.eks. kroppsoving → kroppsøving)', () => {
    const p = parseChildSchoolProfile(
      {
        gradeBand: '5-7',
        weekdays: {
          0: {
            useSimpleDay: false,
            lessons: [
              {
                subjectKey: 'kroppsoving',
                start: '08:15',
                end: '09:45',
                customLabel: 'Kroppsøving',
              },
            ],
          },
        },
      },
      'test'
    )
    expect(p.weekdays[0]?.lessons?.[0]?.subjectKey).toBe('kroppsøving')
    expect(p.weekdays[0]?.lessons?.[0]?.customLabel).toBe('Kroppsøving')
  })

  it('mapper label/displayLabel/subjectLabel til customLabel når customLabel mangler', () => {
    const p = parseChildSchoolProfile(
      {
        gradeBand: '5-7',
        weekdays: {
          0: {
            useSimpleDay: false,
            lessons: [{ subjectKey: 'norsk', start: '09:00', end: '10:00', label: 'Norsk utenom' }],
          },
        },
      },
      'test'
    )
    expect(p.weekdays[0]?.lessons?.[0]?.customLabel).toBe('Norsk utenom')
  })

  it('bevarer ukjente subjectKey som ikke har alias (f.eks. k_og_h)', () => {
    const p = parseChildSchoolProfile(
      {
        gradeBand: '5-7',
        weekdays: {
          4: {
            useSimpleDay: false,
            lessons: [
              { subjectKey: 'k_og_h', start: '10:00', end: '11:00', customLabel: 'K&H' },
              { subjectKey: 'utv', start: '12:00', end: '13:00', customLabel: 'UTV' },
            ],
          },
        },
      },
      'test'
    )
    expect(p.weekdays[4]?.lessons?.[0]?.subjectKey).toBe('k_og_h')
    expect(p.weekdays[4]?.lessons?.[1]?.subjectKey).toBe('utv')
  })

  it('avviser ugyldig gradeBand', () => {
    expect(() =>
      parseChildSchoolProfile({ gradeBand: 'vg99', weekdays: {} }, 'x')
    ).toThrow(/gradeBand/)
  })

  it('avviser ukedag utenfor 0–4', () => {
    expect(() =>
      parseChildSchoolProfile(
        { gradeBand: '1-4', weekdays: { 5: { useSimpleDay: true, schoolStart: '08:30', schoolEnd: '14:00' } } },
        'x'
      )
    ).toThrow(/ukedag/)
  })
})

describe('parsePortalImportProposalBundle — school_profile', () => {
  it('aksepterer items med kind school_profile', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [
        {
          proposalId: 'c3d4e5f6-a7b8-4901-8234-567890abcdef',
          kind: 'school_profile',
          sourceId: 'src-1',
          originalSourceType: 'weekly_timetable',
          confidence: 0.9,
          suggestedPersonId: 'child-1',
          schoolProfile: {
            gradeBand: '8-10',
            weekdays: {
              1: { useSimpleDay: true, schoolStart: '08:15', schoolEnd: '15:00' },
            },
          },
        },
      ],
    })
    expect(bundle.items).toHaveLength(1)
    expect(bundle.items[0]!.kind).toBe('school_profile')
    if (bundle.items[0]!.kind === 'school_profile') {
      expect(bundle.items[0].schoolProfile.gradeBand).toBe('8-10')
      expect(bundle.items[0].suggestedPersonId).toBe('child-1')
    }
  })

  it('støtter alias profile på item', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [
        {
          proposalId: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
          kind: 'school_profile',
          sourceId: 'src-1',
          originalSourceType: 'timetable',
          confidence: 1,
          profile: {
            gradeBand: 'vg1',
            weekdays: {},
          },
        },
      ],
    })
    expect(bundle.items[0]!.kind).toBe('school_profile')
  })

  it('støtter toppnivå schoolProfile når items er tom', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [],
      schoolProfile: {
        gradeBand: '5-7',
        weekdays: {
          0: { useSimpleDay: false, lessons: [{ subjectKey: 'norsk', start: '09:00', end: '10:00' }] },
        },
      },
    })
    expect(bundle.items).toHaveLength(1)
    expect(bundle.items[0]!.kind).toBe('school_profile')
  })

  it('støtter toppnivå schoolProfileProposal (Tankestrøm) når items er tom', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [],
      schoolProfileProposal: {
        profile: {
          gradeBand: '1-4',
          weekdays: {
            2: { useSimpleDay: true, schoolStart: '08:30', schoolEnd: '13:30' },
          },
        },
        suggestedPersonId: 'child-x',
      },
    })
    expect(bundle.items).toHaveLength(1)
    expect(bundle.items[0]!.kind).toBe('school_profile')
    if (bundle.items[0]!.kind === 'school_profile') {
      expect(bundle.items[0].schoolProfile.gradeBand).toBe('1-4')
      expect(bundle.items[0].suggestedPersonId).toBe('child-x')
    }
  })

  it('prioriterer schoolProfile over schoolProfileProposal hvis begge er satt', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [],
      schoolProfile: { gradeBand: '8-10', weekdays: {} },
      schoolProfileProposal: { gradeBand: 'vg1', weekdays: {} },
    })
    expect(bundle.items[0]!.kind).toBe('school_profile')
    if (bundle.items[0]!.kind === 'school_profile') {
      expect(bundle.items[0].schoolProfile.gradeBand).toBe('8-10')
    }
  })

  it('avviser blanding av school_profile og event', () => {
    expect(() =>
      parsePortalImportProposalBundle({
        schemaVersion: '1.0.0',
        provenance,
        items: [
          {
            proposalId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            kind: 'school_profile',
            sourceId: 's',
            originalSourceType: 't',
            confidence: 1,
            schoolProfile: { gradeBand: '1-4', weekdays: {} },
          },
          {
            proposalId: 'b2c3d4e5-f6a7-4890-b123-456789abcdef',
            kind: 'event',
            sourceId: 'e',
            originalSourceType: 'e',
            confidence: 1,
            event: {
              date: '2026-04-20',
              personId: 'p1',
              title: 'X',
              start: '10:00',
              end: '11:00',
            },
          },
        ],
      })
    ).toThrow(/kan ikke kombineres/)
  })
})

describe('parsePortalImportProposalBundle — task notes / detaljtekst', () => {
  const taskItemBase = {
    proposalId: '11111111-1111-4111-8111-111111111111',
    kind: 'task' as const,
    sourceId: 'src-task',
    originalSourceType: 'docx',
    confidence: 0.9,
    task: {
      date: '2026-04-20',
      title: 'Fransk lekse',
    },
  }

  it('samler tekst fra task.metadata.sourceExcerpt til notes', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [
        {
          ...taskItemBase,
          task: {
            ...taskItemBase.task,
            metadata: {
              sourceExcerpt: 'Lær å bøye pouvoir på side 148.',
            },
          },
        },
      ],
    })
    const item = bundle.items[0]
    expect(item?.kind).toBe('task')
    if (item?.kind === 'task') {
      expect(item.task.notes).toContain('pouvoir')
    }
  })

  it('løfter homework fra item-nivå inn i task når task mangler notes', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [
        {
          ...taskItemBase,
          homework: 'Gjør oppgave 3a–3c.',
          task: taskItemBase.task,
        },
      ],
    })
    const item = bundle.items[0]
    expect(item?.kind).toBe('task')
    if (item?.kind === 'task') {
      expect(item.task.notes).toContain('oppgave 3')
    }
  })

  it('støtter notes som liste av strenger', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [
        {
          ...taskItemBase,
          task: {
            ...taskItemBase.task,
            notes: ['Linje 1', 'Linje 2'],
          },
        },
      ],
    })
    const item = bundle.items[0]
    expect(item?.kind).toBe('task')
    if (item?.kind === 'task') {
      expect(item.task.notes).toContain('Linje 1')
      expect(item.task.notes).toContain('Linje 2')
    }
  })
})

describe('parsePortalImportProposalBundle — schoolWeekOverlayProposal', () => {
  it('parser toppnivå schoolWeekOverlayProposal additivt med items[]', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [
        {
          proposalId: '11111111-1111-4111-8111-111111111111',
          kind: 'event',
          sourceId: 'src-event-1',
          originalSourceType: 'pdf',
          confidence: 0.81,
          event: {
            date: '2026-04-08',
            personId: 'child-1',
            title: 'Matte',
            start: '08:15',
            end: '09:15',
          },
        },
      ],
      schoolWeekOverlayProposal: {
        proposalId: '22222222-2222-4222-8222-222222222222',
        kind: 'school_week_overlay',
        schemaVersion: '1.0.0',
        confidence: 0.71,
        sourceTitle: 'A-plan uke 14 10B',
        originalSourceType: 'pdf',
        weekNumber: 14,
        classLabel: '10B',
        weeklySummary: ['Heldagsprøve torsdag', 'Fri fredag'],
        dailyActions: {
          3: {
            action: 'replace_school_block',
            reason: 'Heldagsprøve i matematikk',
            summary: 'Heldagsprøve i matematikk',
            subjectUpdates: [
              {
                subjectKey: 'matematikk',
                customLabel: null,
                sections: {
                  proveVurdering: ['Heldagsprøve i matematikk'],
                },
              },
            ],
          },
          4: {
            action: 'remove_school_block',
            reason: 'Fri',
            summary: 'Fri',
            subjectUpdates: [],
          },
        },
      },
    })

    expect(bundle.items).toHaveLength(1)
    expect(bundle.schoolWeekOverlayProposal).toBeTruthy()
    expect(bundle.schoolWeekOverlayProposal?.kind).toBe('school_week_overlay')
    expect(bundle.schoolWeekOverlayProposal?.weekNumber).toBe(14)
    expect(bundle.schoolWeekOverlayProposal?.dailyActions[3]?.action).toBe('replace_school_block')
    expect(bundle.schoolWeekOverlayProposal?.dailyActions[4]?.action).toBe('remove_school_block')
  })

  it('aksepterer overlay uten items', () => {
    const bundle = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      items: [],
      schoolWeekOverlayProposal: {
        proposalId: '33333333-3333-4333-8333-333333333333',
        kind: 'school_week_overlay',
        schemaVersion: '1.0.0',
        confidence: 0.6,
        originalSourceType: 'pdf',
        weeklySummary: [],
        dailyActions: {},
      },
    })

    expect(bundle.items).toHaveLength(0)
    expect(bundle.schoolWeekOverlayProposal?.proposalId).toBe('33333333-3333-4333-8333-333333333333')
  })
})

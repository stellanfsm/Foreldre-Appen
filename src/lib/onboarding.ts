/** Lightweight onboarding state — stored in localStorage, no external deps. */

export interface TourStep {
  id: string
  title: string
  body: string
  /** DOM element ID to ring-highlight; null = no spotlight */
  targetId: string | null
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'nav',
    title: 'Naviger i kalenderen',
    body: 'Trykk på en dag i ukeremsnen øverst for å se den dagen. Bruk pilknappene for å bytte uke, eller trykk «Gå til i dag».',
    targetId: 'onb-week-strip',
  },
  {
    id: 'add-event',
    title: 'Legg til en aktivitet',
    body: '«+ Aktivitet» oppretter noe med fast tid – fotball, trening, møter. Trykk «Mer detaljer» i skjemaet for å legge til gjentak, påminnelse og transport.',
    targetId: 'onb-add-event',
  },
  {
    id: 'add-task',
    title: 'Legg til en oppgave',
    body: '«+ Oppgave» er for ting som skal gjøres uten fast starttid – f.eks. ringe legen, kjøpe melk eller sende et skjema.',
    targetId: 'onb-add-task',
  },
  {
    id: 'tasks-tab',
    title: 'Alle oppgaver samlet',
    body: '«Oppgaver»-fanen viser alle åpne oppgaver på tvers av alle dager, sortert etter dato. Merk dem ferdige direkte der.',
    targetId: 'onb-tasks-tab',
  },
  {
    id: 'transport',
    title: 'Levering og henting',
    body: 'En fargestripe øverst på en aktivitetsblokk (↑) viser hvem som leverer; en stripe nederst (↓) viser hvem som henter. Fargen er personens farge.',
    targetId: null,
  },
]

export interface OnboardingState {
  tourCompleted: boolean
  tourStep: number
  /** IDs of one-time contextual hints already shown */
  seenHints: string[]
}

const STORAGE_KEY = 'foreldre_onboarding_v1'

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as OnboardingState
  } catch {}
  return { tourCompleted: false, tourStep: 0, seenHints: [] }
}

export function saveOnboarding(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function hasSeenHint(hintId: string): boolean {
  return loadOnboarding().seenHints.includes(hintId)
}

export function markHintSeen(hintId: string): void {
  const state = loadOnboarding()
  if (!state.seenHints.includes(hintId)) {
    state.seenHints.push(hintId)
    saveOnboarding(state)
  }
}

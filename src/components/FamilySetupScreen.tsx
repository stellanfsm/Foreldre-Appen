import { useState } from 'react'
import { useFamily } from '../context/FamilyContext'
import { useAuth } from '../context/AuthContext'
import { inputBase, btnPrimary } from '../lib/ui'
import { logEvent } from '../lib/appLogger'

const SKIP_KEY_PREFIX = 'foreldre_family_setup_skipped_v1'
const skipKey = (userId: string) => `${SKIP_KEY_PREFIX}_${userId}`

export function isFamilySetupSkipped(userId: string): boolean {
  try { return localStorage.getItem(skipKey(userId)) === '1' } catch { return false }
}

const COLOR_PRESETS: { tint: string; accent: string }[] = [
  { tint: '#dcfce7', accent: '#22c55e' },
  { tint: '#dbeafe', accent: '#3b82f6' },
  { tint: '#ede9fe', accent: '#8b5cf6' },
  { tint: '#ffedd5', accent: '#f97316' },
  { tint: '#fce7f3', accent: '#ec4899' },
  { tint: '#cffafe', accent: '#0891b2' },
  { tint: '#fef9c3', accent: '#eab308' },
  { tint: '#e0e7ff', accent: '#6366f1' },
]

interface FamilySetupScreenProps {
  onSkip: () => void
}

/**
 * First-run screen shown to new users who have no children in their family yet.
 * School schedule detail is intentionally deferred — users can set it in Settings.
 * Success is handled automatically: once addPerson resolves, App.tsx detects
 * hasChildren = true and dismisses this screen without any explicit callback.
 */
export function FamilySetupScreen({ onSkip }: FamilySetupScreenProps) {
  const { user } = useAuth()
  const { addPerson } = useFamily()
  const [name, setName] = useState('')
  const [colorTint, setColorTint] = useState(COLOR_PRESETS[0].tint)
  const [colorAccent, setColorAccent] = useState(COLOR_PRESETS[0].accent)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Skriv inn barnets navn.')
      return
    }
    setSaving(true)
    try {
      await addPerson({ name: trimmed, colorTint, colorAccent, memberKind: 'child' })
      logEvent('family_setup_child_added', { name: trimmed })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt. Prøv igjen.')
      setSaving(false)
    }
  }

  function handleSkip() {
    if (user?.id) {
      try { localStorage.setItem(skipKey(user.id), '1') } catch {}
    }
    logEvent('family_setup_skipped', {})
    onSkip()
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-auto">
      <div className="flex flex-1 flex-col px-5 pb-12 pt-14">

        <div className="mb-8">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-primary-600">Kom i gang</p>
          <h1 className="mt-1 text-[22px] font-bold text-neutral-600">Legg til første barn</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-500">
            ForeldrePortalen er bygd rundt barna. Legg til minst ett barn for å få skolerute i
            bakgrunnen, filtrering per person og familiekoordinering.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-[13px] font-medium text-neutral-500">Navn</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1.5 ${inputBase}`}
              placeholder="f.eks. Emma"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[13px] font-medium text-neutral-500">Farge i kalenderen</label>
            <div className="mt-2.5 flex flex-wrap gap-3">
              {COLOR_PRESETS.map(({ tint, accent }) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => { setColorTint(tint); setColorAccent(accent) }}
                  className="h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: tint,
                    borderColor: colorAccent === accent ? accent : 'transparent',
                    boxShadow: colorAccent === accent ? `0 0 0 2px ${accent}` : undefined,
                  }}
                  aria-pressed={colorAccent === accent}
                />
              ))}
            </div>
          </div>

          <p className="rounded-lg bg-neutral-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-neutral-400">
            Skolerute og timeplan settes opp fra{' '}
            <span className="font-medium text-neutral-500">Innstillinger → Familie</span> etterpå — du
            kan hoppe over det nå.
          </p>

          {error && <p className="text-[13px] text-semantic-red-600">{error}</p>}

          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? 'Lagrer…' : 'Legg til barn og fortsett →'}
          </button>
        </form>

        <div className="mt-8 flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={handleSkip}
            className="text-[13px] text-neutral-400 transition hover:text-neutral-600"
          >
            Hopp over for nå
          </button>
          <p className="text-[11px] text-neutral-400">
            Du kan legge til barn fra Innstillinger når som helst.
          </p>
        </div>
      </div>
    </div>
  )
}

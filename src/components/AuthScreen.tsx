import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { SynkaLogoIcon, SynkaWordmark } from './ui/SynkaLogo'

const MIN_PASSWORD_LENGTH = 6
const INVITE_MEMBER_KIND_KEY = 'invite-member-kind'

export function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteMemberKind, setInviteMemberKind] = useState<'parent' | 'child'>('parent')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  const inviteParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('invite') : null
  const inviteKindFromStorage =
    typeof window !== 'undefined'
      ? (window.localStorage.getItem(INVITE_MEMBER_KIND_KEY) as 'parent' | 'child' | null)
      : null
  const effectiveInviteMemberKind = inviteKindFromStorage === 'child' ? 'child' : inviteMemberKind
  const switchMode = useCallback((newMode: 'signin' | 'signup') => {
    setMode(newMode)
    setError(null)
    setSuccess(null)
    setConfirmPassword('')
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setError('Skriv inn e-postadressen din.')
      return
    }
    if (!password) {
      setError(mode === 'signin' ? 'Skriv inn passord.' : 'Velg et passord.')
      return
    }
    if (mode === 'signup') {
      const trimmedName = name.trim()
      if (!trimmedName) {
        setError('Skriv inn ditt navn (hvem du er i familien).')
        return
      }
      if (!inviteParam) {
        const trimmedFamily = familyName.trim()
        if (!trimmedFamily) {
          setError('Gi familien et navn (f.eks. Olsen eller Hansen).')
          return
        }
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Passordet må være minst ${MIN_PASSWORD_LENGTH} tegn.`)
        return
      }
      if (password !== confirmPassword) {
        setError('Passordene stemmer ikke overens.')
        return
      }
    }

    setLoading(true)
    try {
      if (inviteParam && typeof window !== 'undefined') {
        window.localStorage.setItem(INVITE_MEMBER_KIND_KEY, effectiveInviteMemberKind)
      }
      if (mode === 'signin') {
        await signIn(trimmedEmail, password)
      } else {
        await signUp(trimmedEmail, password, {
          displayName: name.trim(),
          familyName: inviteParam ? null : familyName.trim() || null,
        })
        setSuccess('Konto opprettet. Sjekk e-posten din for bekreftelseslenke – deretter kan du logge inn her.')
        setPassword('')
        setConfirmPassword('')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      {inviteParam && (
        <div className="mx-3 mt-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-[12px] text-neutral-600" role="status">
          Du har blitt invitert til en familie. Logg inn eller opprett konto for å akseptere invitasjonen.
        </div>
      )}
      <header className="flex flex-col px-4 pt-3 pb-4 bg-neutral-100 rounded-b-[32px] border-b border-neutral-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <SynkaWordmark variant="green" width={100} />
            <p className="mt-1 text-[12px] text-neutral-400">
              {mode === 'signin'
                ? 'Logg inn for å se familiens ukeplan.'
                : 'Opprett konto for å dele kalender med andre foreldre.'}
            </p>
          </div>
          <div className="relative h-14 w-14 overflow-hidden rounded-[24px] bg-neutral-100 border border-neutral-300 shadow-card flex items-center justify-center">
            <SynkaLogoIcon size="lg" />
          </div>
        </div>
      </header>

      <div className="mt-3 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden px-3 pb-4">
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden rounded-2xl border-2 border-primary-700/15 bg-neutral-100 px-6 pb-4 pt-6 shadow-card">
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            {inviteParam && (
              <fieldset className="space-y-2">
                <legend className="text-[12px] font-medium text-neutral-500">Når du blir med i familien, er du:</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex cursor-pointer items-center justify-center rounded-full border px-3 py-2 text-[13px] font-medium transition ${
                      effectiveInviteMemberKind === 'parent'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 text-neutral-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="invite-member-kind"
                      value="parent"
                      checked={effectiveInviteMemberKind === 'parent'}
                      onChange={() => {
                        setInviteMemberKind('parent')
                        clearMessages()
                      }}
                      className="sr-only"
                    />
                    Voksen
                  </label>
                  <label
                    className={`flex cursor-pointer items-center justify-center rounded-full border px-3 py-2 text-[13px] font-medium transition ${
                      effectiveInviteMemberKind === 'child'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 text-neutral-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="invite-member-kind"
                      value="child"
                      checked={effectiveInviteMemberKind === 'child'}
                      onChange={() => {
                        setInviteMemberKind('child')
                        clearMessages()
                      }}
                      className="sr-only"
                    />
                    Barn
                  </label>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Dette styrer hvilken type profil som opprettes i den delte familien.
                </p>
              </fieldset>
            )}
            {mode === 'signup' && (
              <>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-neutral-500" htmlFor="auth-name">
                    Ditt navn
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    required
                    placeholder="F.eks. Anne eller Ola"
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      clearMessages()
                    }}
                  />
                  <p className="text-[11px] text-neutral-400">
                    Hvem du er i familien – vises i appen
                  </p>
                </div>
                {!inviteParam && (
                  <div className="space-y-1">
                    <label className="text-[12px] font-medium text-neutral-500" htmlFor="auth-family-name">
                      Familienavn
                    </label>
                    <input
                      id="auth-family-name"
                      type="text"
                      autoComplete="off"
                      required
                      placeholder="F.eks. Olsen eller Hansen"
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                      value={familyName}
                      onChange={(e) => {
                        setFamilyName(e.target.value)
                        clearMessages()
                      }}
                    />
                    <p className="text-[11px] text-neutral-400">
                      Navnet på familien – vises øverst i appen
                    </p>
                  </div>
                )}
              </>
            )}
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-neutral-500" htmlFor="auth-email">
                E-post
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20 aria-[invalid]:border-semantic-red-500"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearMessages()
                }}
                aria-invalid={!!error}
                aria-describedby={error ? 'auth-error' : undefined}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-neutral-500" htmlFor="auth-password">
                Passord
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20 aria-[invalid]:border-semantic-red-500"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearMessages()
                }}
                aria-invalid={!!error}
              />
              {mode === 'signup' && (
                <p className="text-[11px] text-neutral-400">
                  Minst {MIN_PASSWORD_LENGTH} tegn
                </p>
              )}
            </div>
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-neutral-500" htmlFor="auth-confirm-password">
                  Gjenta passord
                </label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20 aria-[invalid]:border-semantic-red-500"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    clearMessages()
                  }}
                  aria-invalid={!!(error && error.includes('Passordene'))}
                />
              </div>
            )}

            {error && (
              <p id="auth-error" className="text-[12px] text-semantic-red-600" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="text-[12px] text-neutral-600" role="status">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-md bg-primary-600 py-2.5 text-[15px] font-semibold text-neutral-100 shadow-card transition hover:bg-primary-700 disabled:bg-[#b9cdc1] disabled:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 active:bg-primary-800 active:shadow-press"
            >
              {loading ? 'Vennligst vent…' : mode === 'signin' ? 'Logg inn' : 'Opprett konto'}
            </button>
          </form>

        </div>

        <div className="mt-4 border border-neutral-200 bg-neutral-50 rounded-xl px-4 py-3 text-center text-[12px] text-neutral-600">
          {mode === 'signin' ? (
            <button
              type="button"
              className="font-semibold underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-neutral-300 rounded"
              onClick={() => switchMode('signup')}
            >
              Ny bruker? Opprett konto
            </button>
          ) : (
            <button
              type="button"
              className="font-semibold underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-neutral-300 rounded"
              onClick={() => switchMode('signin')}
            >
              Har du allerede en konto? Logg inn
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

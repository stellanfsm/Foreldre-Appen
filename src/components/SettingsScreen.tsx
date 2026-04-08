import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useFamily } from '../context/FamilyContext'
import { useEffectiveUserId } from '../context/EffectiveUserIdContext'
import { usePermissions } from '../hooks/usePermissions'
import { FamilyEditor } from './FamilyEditor'
import { requestNotificationPermission } from '../hooks/useReminders'
import { createInvite, buildInviteUrl, fetchLatestPendingInvite } from '../lib/inviteApi'

interface SettingsScreenProps {
  onPersonRemoved?: (personId: string) => void
  onClearAllEvents?: () => Promise<void>
  onRestartOnboarding?: () => void
}

export function SettingsScreen({ onPersonRemoved, onClearAllEvents, onRestartOnboarding }: SettingsScreenProps) {
  const { user, signOut } = useAuth()
  const { hapticsEnabled, setHapticsEnabled } = useUserPreferences()
  const { people: _people } = useFamily()
  const { effectiveUserId, isLinked, unlink } = useEffectiveUserId()
  const { canClearAllEvents, isCalendarOwner } = usePermissions()
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteLookupMessage, setInviteLookupMessage] = useState<string | null>(null)

  async function handleCreateInvite() {
    if (!effectiveUserId) return
    setInviteLookupMessage(null)
    const result = await createInvite(effectiveUserId)
    if (result) setInviteLink(buildInviteUrl(result.token))
  }

  async function handleShowExistingInvite() {
    if (!effectiveUserId) return
    setInviteLookupMessage(null)
    const row = await fetchLatestPendingInvite(effectiveUserId)
    if (row) {
      setInviteLink(buildInviteUrl(row.token))
    } else {
      setInviteLookupMessage('Ingen aktiv invitasjonslenke funnet. Opprett en ny, eller legg til forelder under Familie for en lenke som kobles til den profilen.')
    }
  }

  async function handleCopyInviteLink() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  async function handleUnlink() {
    if (!window.confirm('Forlate delt familie og gå tilbake til din egen kalender?')) return
    await unlink()
    window.location.reload()
  }

  async function handleClearAllEvents() {
    if (!onClearAllEvents) return
    if (!window.confirm('Slette alle aktiviteter for denne familien? Dette kan ikke angres.')) return
    await onClearAllEvents()
    // Optional feedback; keep simple to avoid dependency on toasts.
    alert('Alle aktiviteter er slettet.')
  }

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission()
    setNotifStatus(result)
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col px-3 pt-6 pb-8">
      <h2 className="text-lg font-semibold text-zinc-900">Innstillinger</h2>
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Pålogget som
        </p>
        <p className="mt-1 text-sm text-zinc-800 break-all">{user?.email ?? '—'}</p>
        <p className="mt-2 text-[12px] text-zinc-600">
          {isCalendarOwner ? (
            <>
              Du er <span className="font-medium text-zinc-800">eier</span> av denne kalenderen.
            </>
          ) : (
            <>
              Du er <span className="font-medium text-zinc-800">invitert forelder</span> og bruker en annens familiekalender.
            </>
          )}
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Rettigheter</p>
        <ul className="mt-2 list-disc space-y-2 pl-4 text-[13px] text-zinc-700">
          <li>
            <span className="font-medium text-zinc-900">Eier</span> kan invitere, legge til eller fjerne familiemedlemmer,
            og slette alle aktiviteter samlet.
          </li>
          <li>
            <span className="font-medium text-zinc-900">Invitert forelder</span> ser samme kalender og kan legge til,
            endre og slette aktiviteter (også serier og transport), men kan ikke administrere andres familiemedlemmer eller
            sende nye invitasjoner. Du kan endre navn og farge på deg selv under Familie.
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600" aria-hidden>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Personvern</p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-700">
              Kalenderen kan inneholde <span className="font-medium text-zinc-900">navn på barn</span>,{' '}
              <span className="font-medium text-zinc-900">skole og aktiviteter</span>, tider og steder. Tenk deg om før du
              skriver inn noe du ikke vil at andre skal se.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-zinc-700">
              Data lagres hos vår databasetjeneste (Supabase) og knyttes til kontoen din. Det du legger inn er synlig for
              deg og for andre du deler familien med (f.eks. invitert forelder). Vi bruker ikke innholdet i kalenderen til
              reklame og selger det ikke videre.
            </p>
            <p className="mt-3 text-[12px] text-zinc-500">
              Ved å bruke appen godtar du at du er ansvarlig for opplysningene du registrerer. Ta kontakt med den som
              administrerer familien hvis du vil slette konto eller data.
            </p>
          </div>
        </div>
      </div>

      {isLinked && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-700">
            Delt familie
          </p>
          <p className="mt-2 text-[13px] text-zinc-800">
            Du ser på og redigerer en familie du ble invitert til. Aktiviteter kan du endre som vanlig; familien og
            invitasjoner håndteres av eieren. For å gå tilbake til din egen kalender, forlat familien.
          </p>
          <button
            type="button"
            onClick={handleUnlink}
            className="mt-3 rounded-full border border-zinc-300 bg-white px-4 py-2 text-[13px] font-medium text-zinc-800 hover:bg-zinc-100"
          >
            Forlat familie
          </button>
        </div>
      )}

      {!isLinked && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Inviter til familien
          </p>
          <p className="mt-2 text-[13px] text-zinc-600">
            La den andre <span className="font-medium">forelderen</span> få tilgang til samme kalender. Du kan også opprette
            lenke rett etter at du har lagt til en forelder under Familie.
          </p>
          {!inviteLink ? (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateInvite}
                  className="rounded-full bg-brandTeal px-4 py-2 text-[13px] font-medium text-white shadow-planner transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-brandTeal focus:ring-offset-2"
                >
                  Opprett ny invitasjonslenke
                </button>
                <button
                  type="button"
                  onClick={handleShowExistingInvite}
                  className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Vis aktiv invitasjonslenke
                </button>
              </div>
              {inviteLookupMessage && (
                <p className="text-[12px] leading-relaxed text-zinc-600">{inviteLookupMessage}</p>
              )}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="min-w-0 w-full break-all rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-800"
                aria-label="Invitasjonslenke"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="rounded-full bg-brandTeal px-4 py-2 text-[13px] font-medium text-white shadow-planner transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-brandTeal focus:ring-offset-2"
                >
                  {inviteCopied ? 'Kopiert!' : 'Kopier lenke'}
                </button>
                <button
                  type="button"
                  onClick={() => setInviteLink(null)}
                  className="rounded-full border border-zinc-200 px-4 py-2 text-[13px] font-medium text-zinc-800"
                >
                  Skjul
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">
                Lenken utløper om 7 dager. Den som åpner den må logge inn eller opprette konto. Trykk «Vis aktiv
                invitasjonslenke» for å vise den igjen etter at du har skjult den.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Varsler
        </p>
        {notifStatus === 'granted' ? (
          <p className="mt-2 text-[13px] text-zinc-700">
            Varsler er skrudd på. Påminnelser dukker opp før aktiviteter.
          </p>
        ) : notifStatus === 'denied' ? (
          <p className="mt-2 text-[13px] text-red-600">
            Varsler er blokkert. Skru dem på i nettleserens innstillinger.
          </p>
        ) : notifStatus === 'unsupported' ? (
          <p className="mt-2 text-[13px] text-zinc-600">
            Nettleservarsler er ikke støttet her.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleEnableNotifications}
            className="mt-2 rounded-full bg-brandTeal px-4 py-2 text-[13px] font-medium text-white shadow-planner transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-brandTeal focus:ring-offset-2"
          >
            Skru på påminnelser
          </button>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Tilbakemelding
        </p>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-zinc-900">Lett vibrasjon ved lagring</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">
              Kort vibrasjon når du legger til eller lagrer en aktivitet. Fungerer på mange Android-telefoner med
              touch-skjerm; iOS støtter ofte ikke vibrasjon fra nettleser.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hapticsEnabled}
            onClick={() => setHapticsEnabled(!hapticsEnabled)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              hapticsEnabled ? 'bg-brandTeal' : 'bg-zinc-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                hapticsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-8">
        <FamilyEditor onPersonRemoved={onPersonRemoved} />
      </div>

      <div className="mt-8 rounded-xl border border-red-100 bg-red-50/60 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-red-600">
          Fareområde
        </p>
        <p className="mt-1 text-[13px] text-red-700">
          {canClearAllEvents
            ? 'Sletter alle aktiviteter for familien fra databasen. Alle som deler kalenderen mister dem i appen. Kan ikke angres.'
            : 'Kun eieren av kalenderen kan slette alle aktiviteter samlet. Du kan fortsatt slette enkeltaktiviteter i uke- og dagvisning.'}
        </p>
        {canClearAllEvents && (
          <button
            type="button"
            onClick={handleClearAllEvents}
            className="mt-3 rounded-full bg-red-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-red-700"
          >
            Slett alle aktiviteter
          </button>
        )}
      </div>

      {onRestartOnboarding && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Hjelp</p>
          <p className="mt-2 text-[13px] text-zinc-600">
            Vil du se gjennomgangen av appen på nytt?
          </p>
          <button
            type="button"
            onClick={onRestartOnboarding}
            className="mt-3 rounded-full border border-zinc-300 bg-white px-4 py-2 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Vis gjennomgang på nytt
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => signOut()}
        className="mt-8 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100"
      >
        Logg ut
      </button>
    </div>
  )
}

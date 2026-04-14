import { useState } from 'react'
import { cardSection, typSectionCap, btnSecondary, btnDanger, btnPrimaryPill } from '../lib/ui'
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
  onOpenTankestromImport?: () => void
}

export function SettingsScreen({
  onPersonRemoved,
  onClearAllEvents,
  onRestartOnboarding,
  onOpenTankestromImport,
}: SettingsScreenProps) {
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
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearDone, setClearDone] = useState(false)

  async function handleCreateInvite() {
    if (!effectiveUserId || isLinked) return
    setInviteLookupMessage(null)
    const result = await createInvite(effectiveUserId)
    if (result) setInviteLink(buildInviteUrl(result.token))
  }

  async function handleShowExistingInvite() {
    if (!effectiveUserId || isLinked) return
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
    await unlink()
    window.location.reload()
  }

  async function handleClearAllEvents() {
    if (!onClearAllEvents) return
    await onClearAllEvents()
    setClearDone(true)
    setConfirmClear(false)
  }

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission()
    setNotifStatus(result)
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col px-4 pt-5 pb-10">
      <h2 className="text-[20px] font-semibold text-zinc-900">Innstillinger</h2>
      <div className={`mt-5 ${cardSection} p-4`}>
        <p className={typSectionCap}>Konto</p>
        <p className="mt-1.5 text-[13px] text-zinc-800 break-all">{user?.email ?? '—'}</p>
        <p className="mt-1.5 text-[12px] text-zinc-500">
          {isCalendarOwner ? (
            <>Du er <span className="font-medium text-zinc-700">eier</span> av denne kalenderen.</>
          ) : (
            <>Du er <span className="font-medium text-zinc-700">invitert forelder</span> og bruker en annens familiekalender.</>
          )}
        </p>
      </div>

      <div className={`mt-4 ${cardSection} p-4`}>
        <p className={typSectionCap}>Rettigheter</p>
        <ul className="mt-2.5 space-y-2 text-[13px] text-zinc-600">
          <li className="flex gap-2">
            <span className="mt-px shrink-0 text-zinc-300">·</span>
            <span><span className="font-medium text-zinc-800">Eier</span> kan invitere, legge til eller fjerne familiemedlemmer, og slette alle hendelser samlet.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-px shrink-0 text-zinc-300">·</span>
            <span><span className="font-medium text-zinc-800">Invitert forelder</span> ser samme kalender og kan legge til, endre og slette hendelser, men kan ikke administrere familiemedlemmer eller sende invitasjoner. Du kan endre navn og farge på deg selv under Familie.</span>
          </li>
        </ul>
      </div>

      <div className={`mt-4 ${cardSection} p-4`}>
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500" aria-hidden>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className={typSectionCap}>Personvern</p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">
              Kalenderen kan inneholde <span className="font-medium text-zinc-800">navn på barn</span>,{' '}
              <span className="font-medium text-zinc-800">skole og hendelser</span>, tider og steder. Tenk deg om før du
              skriver inn noe du ikke vil at andre skal se.
            </p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-600">
              Data lagres hos vår databasetjeneste (Supabase) og knyttes til kontoen din. Det du legger inn er synlig for
              deg og for andre du deler familien med. Vi bruker ikke innholdet til reklame og selger det ikke videre.
            </p>
            <p className="mt-2.5 text-[12px] text-zinc-400">
              Ved å bruke appen godtar du at du er ansvarlig for opplysningene du registrerer. Ta kontakt med den som
              administrerer familien hvis du vil slette konto eller data.
            </p>
          </div>
        </div>
      </div>

      {isLinked && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className={typSectionCap}>Delt familie</p>
          <p className="mt-2 text-[13px] text-zinc-600">
            Du ser på og redigerer en familie du ble invitert til. Hendelser kan du endre som vanlig; familien og
            invitasjoner håndteres av eieren. For å gå tilbake til din egen kalender, forlat familien.
          </p>
          {confirmUnlink ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 space-y-3">
              <p className="text-[13px] font-medium text-amber-900">Forlate delt familie og gå tilbake til din egen kalender?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmUnlink(false)} className={`flex-1 ${btnSecondary}`}>Avbryt</button>
                <button type="button" onClick={handleUnlink} className="flex-1 rounded-2xl bg-amber-600 py-3 text-body font-semibold text-white hover:bg-amber-700">Forlat</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmUnlink(true)}
              className="mt-3 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Forlat familie
            </button>
          )}
        </div>
      )}

      {!isLinked && (
        <div className={`mt-4 ${cardSection} p-4`}>
          <p className={typSectionCap}>Inviter til familien</p>
          <p className="mt-2 text-[13px] text-zinc-600">
            La den andre <span className="font-medium text-zinc-700">forelderen</span> få tilgang til samme kalender. Du kan også opprette
            lenke rett etter at du har lagt til en forelder under Familie.
          </p>
          {!inviteLink ? (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleCreateInvite} className={btnPrimaryPill}>
                  Opprett ny lenke
                </button>
                <button
                  type="button"
                  onClick={handleShowExistingInvite}
                  className="rounded-pill border border-zinc-300 bg-white px-4 py-1.5 text-body-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Vis aktiv lenke
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
                <button type="button" onClick={handleCopyInviteLink} className={btnPrimaryPill}>
                  {inviteCopied ? 'Kopiert!' : 'Kopier lenke'}
                </button>
                <button
                  type="button"
                  onClick={() => setInviteLink(null)}
                  className="rounded-pill border border-zinc-200 bg-white px-4 py-1.5 text-body-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Skjul
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">
                Lenken utløper om 7 dager. Trykk «Vis aktiv lenke» for å vise den igjen etter at du har skjult den.
              </p>
            </div>
          )}
        </div>
      )}

      {onOpenTankestromImport && (
        <div className={`mt-4 ${cardSection} p-4`}>
          <p className={typSectionCap}>Tankestrøm</p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">
            Last opp dokument eller bilde og få forslag til kalenderhendelser. Du godkjenner før noe lagres.
          </p>
          <button
            type="button"
            onClick={onOpenTankestromImport}
            className="mt-3 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Importer fra Tankestrøm…
          </button>
        </div>
      )}

      <div className={`mt-4 ${cardSection} p-4`}>
        <p className={typSectionCap}>Varsler</p>
        {notifStatus === 'granted' ? (
          <p className="mt-2 text-[13px] text-zinc-600">
            Varsler er skrudd på. Påminnelser dukker opp før hendelser.
          </p>
        ) : notifStatus === 'denied' ? (
          <p className="mt-2 text-[13px] text-rose-600">
            Varsler er blokkert. Skru dem på i nettleserens innstillinger.
          </p>
        ) : notifStatus === 'unsupported' ? (
          <p className="mt-2 text-[13px] text-zinc-500">
            Nettleservarsler er ikke støttet her.
          </p>
        ) : (
          <button type="button" onClick={handleEnableNotifications} className={`mt-2 ${btnPrimaryPill}`}>
            Skru på påminnelser
          </button>
        )}
      </div>

      <div className={`mt-4 ${cardSection} p-4`}>
        <p className={typSectionCap}>Tilbakemelding</p>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-zinc-800">Lett vibrasjon ved lagring</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">
              Kort vibrasjon når du legger til eller lagrer en hendelse. Fungerer på mange Android-telefoner; iOS støtter
              ofte ikke vibrasjon fra nettleser.
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

      <div className="mt-6">
        <FamilyEditor onPersonRemoved={onPersonRemoved} />
      </div>

      <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">Fareområde</p>
        <p className="mt-2 text-[13px] text-zinc-600">
          {canClearAllEvents
            ? 'Sletter alle hendelser for familien fra databasen. Alle som deler kalenderen mister dem i appen. Kan ikke angres.'
            : 'Kun eieren av kalenderen kan slette alle hendelser samlet. Du kan fortsatt slette enkelthendelser i uke- og dagvisning.'}
        </p>
        {canClearAllEvents && (
          clearDone ? (
            <p className="mt-3 text-[13px] font-medium text-emerald-700">Alle hendelser er slettet.</p>
          ) : confirmClear ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3.5 space-y-3">
              <p className="text-[13px] font-medium text-rose-800">Slette alle hendelser? Dette kan ikke angres.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmClear(false)} className={`flex-1 ${btnSecondary}`}>Avbryt</button>
                <button type="button" onClick={handleClearAllEvents} className={`flex-1 ${btnDanger}`}>Slett alt</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="mt-3 rounded-xl border border-rose-200 bg-white px-4 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50"
            >
              Slett alle hendelser
            </button>
          )
        )}
      </div>

      {onRestartOnboarding && (
        <div className={`mt-4 ${cardSection} p-4`}>
          <p className={typSectionCap}>Hjelp</p>
          <p className="mt-2 text-[13px] text-zinc-600">Vil du se gjennomgangen av appen på nytt?</p>
          <button
            type="button"
            onClick={onRestartOnboarding}
            className="mt-3 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Vis gjennomgang på nytt
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => signOut()}
        className="mt-8 w-full rounded-2xl border border-zinc-200 bg-white py-3 text-[14px] font-medium text-zinc-600 hover:bg-zinc-50 active:bg-zinc-100"
      >
        Logg ut
      </button>
    </div>
  )
}

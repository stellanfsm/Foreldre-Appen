import { useState } from 'react'
import { inputBase, btnPrimary, btnSecondary, btnRowAction, btnPrimaryPill, cardInset } from '../lib/ui'
import type { ChildSchoolProfile, MemberKind, ParentWorkProfile, Person } from '../types'
import { useFamily } from '../context/FamilyContext'
import { usePermissions } from '../hooks/usePermissions'
import { useAuth } from '../context/AuthContext'
import { useEffectiveUserId } from '../context/EffectiveUserIdContext'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useResolvedMePersonId } from '../hooks/useResolvedMePersonId'
import { buildInviteUrl, getOrCreateInviteForTarget } from '../lib/inviteApi'
import { SchoolProfileFields } from './SchoolProfileFields'
import { WorkProfileFields } from './WorkProfileFields'

const COLOR_PRESETS: { tint: string; accent: string }[] = [
  { tint: '#dcfce7', accent: '#22c55e' },
  { tint: '#dbeafe', accent: '#3b82f6' },
  { tint: '#ede9fe', accent: '#8b5cf6' },
  { tint: '#ffedd5', accent: '#f97316' },
  { tint: '#fef9c3', accent: '#eab308' },
  { tint: '#fce7f3', accent: '#ec4899' },
  { tint: '#e0e7ff', accent: '#6366f1' },
  { tint: '#ccfbf1', accent: '#14b8a6' },
  { tint: '#d1fae5', accent: '#059669' },
  { tint: '#a7f3d0', accent: '#16a34a' },
  { tint: '#cffafe', accent: '#0891b2' },
  { tint: '#e0f2fe', accent: '#0284c7' },
  { tint: '#e2e8f0', accent: '#475569' },
]

const defaultChildSchool = (): ChildSchoolProfile => ({
  gradeBand: '1-4',
  weekdays: {},
})

interface PersonFormProps {
  mode: 'add' | 'edit'
  initial?: Person
  onSave: (data: {
    name: string
    colorTint: string
    colorAccent: string
    memberKind: MemberKind
    school?: ChildSchoolProfile
    work?: ParentWorkProfile
  }) => void | Promise<void>
  onCancel: () => void
  title: string
  saveLabel: string
}

function PersonForm({
  mode,
  initial,
  onSave,
  onCancel,
  title,
  saveLabel,
}: PersonFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [colorTint, setColorTint] = useState(initial?.colorTint ?? COLOR_PRESETS[0].tint)
  const [colorAccent, setColorAccent] = useState(initial?.colorAccent ?? COLOR_PRESETS[0].accent)
  const [memberKind, setMemberKind] = useState<MemberKind>(initial?.memberKind ?? 'child')
  const [school, setSchool] = useState<ChildSchoolProfile>(initial?.school ?? defaultChildSchool())
  const [work, setWork] = useState<ParentWorkProfile | undefined>(initial?.work)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Skriv inn et navn.')
      return
    }
    setSaving(true)
    try {
      await Promise.resolve(
        onSave({
          name: trimmed,
          colorTint,
          colorAccent,
          memberKind,
          school: memberKind === 'child' ? school : undefined,
          work: memberKind === 'parent' ? work : undefined,
        })
      )
      onCancel()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-[16px] font-semibold text-zinc-900">{title}</h3>

      {mode === 'add' && (
        <div>
          <p className="text-[12px] font-medium text-zinc-600">Type</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setMemberKind('parent')}
              className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left text-[13px] font-medium transition ${
                memberKind === 'parent'
                  ? 'border-brandNavy bg-brandSky/40 text-brandNavy'
                  : 'border-zinc-200 bg-white text-zinc-700'
              }`}
            >
              Forelder
              <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                Kan invitere annen forelder med lenke etter lagring
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMemberKind('child')}
              className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left text-[13px] font-medium transition ${
                memberKind === 'child'
                  ? 'border-brandNavy bg-brandSky/40 text-brandNavy'
                  : 'border-zinc-200 bg-white text-zinc-700'
              }`}
            >
              Barn
              <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                Skolerute som bakgrunn i kalenderen
              </span>
            </button>
          </div>
        </div>
      )}

      {mode === 'edit' && initial && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-[12px] text-zinc-700">
          Type: <span className="font-semibold">{initial.memberKind === 'parent' ? 'Forelder' : 'Barn'}</span>
        </p>
      )}

      <div>
        <label className="text-[12px] font-medium text-zinc-600">Navn</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`mt-1 ${inputBase}`}
          placeholder={memberKind === 'child' ? 'f.eks. Emma' : 'f.eks. Anne'}
          autoFocus
        />
      </div>
      <div>
        <label className="text-[12px] font-medium text-zinc-600">Farge</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLOR_PRESETS.map(({ tint, accent }) => (
            <button
              key={accent}
              type="button"
              onClick={() => {
                setColorTint(tint)
                setColorAccent(accent)
              }}
              className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: tint,
                borderColor: colorAccent === accent ? accent : 'transparent',
                boxShadow: colorAccent === accent ? `0 0 0 2px ${accent}` : undefined,
              }}
              title={`${tint} / ${accent}`}
              aria-pressed={colorAccent === accent}
            />
          ))}
        </div>
      </div>

      {memberKind === 'child' && (
        <SchoolProfileFields
          value={school}
          onChange={setSchool}
        />
      )}

      {memberKind === 'parent' && (
        <WorkProfileFields value={work} onChange={setWork} />
      )}

      {error && <p className="text-[12px] text-red-500">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 ${btnSecondary}`}
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={saving}
          className={`flex-1 ${btnPrimary}`}
        >
          {saving ? 'Lagrer…' : saveLabel}
        </button>
      </div>
    </form>
  )
}

interface FamilyEditorProps {
  onPersonRemoved?: (personId: string) => void
}

export function FamilyEditor({ onPersonRemoved }: FamilyEditorProps) {
  const { user } = useAuth()
  const { effectiveUserId } = useEffectiveUserId()
  const { currentPersonId } = useUserPreferences()
  const { people, updatePerson, addPerson, removePerson } = useFamily()
  const { canManageFamilyMembers, canEditFamilyMember, isInvitedParent } = usePermissions()
  const mePersonId = useResolvedMePersonId(people, currentPersonId, user?.id)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [inviteUrlByPersonId, setInviteUrlByPersonId] = useState<Record<string, string>>({})
  const [expandedInviteForId, setExpandedInviteForId] = useState<string | null>(null)
  const [inviteLoadingForId, setInviteLoadingForId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const editingPerson = editingId ? people.find((p) => p.id === editingId) : null

  async function showInviteForParent(memberId: string) {
    if (!user || !effectiveUserId) return
    if (inviteUrlByPersonId[memberId]) {
      setExpandedInviteForId((prev) => (prev === memberId ? null : memberId))
      return
    }
    setInviteLoadingForId(memberId)
    try {
      const inv = await getOrCreateInviteForTarget(effectiveUserId, memberId)
      if (inv) {
        const url = buildInviteUrl(inv.token)
        setInviteUrlByPersonId((prev) => ({ ...prev, [memberId]: url }))
        setExpandedInviteForId(memberId)
      }
    } finally {
      setInviteLoadingForId(null)
    }
  }

  return (
    <div className="space-y-4">
      {isInvitedParent && (
        <div className={`${cardInset} p-3.5 text-[13px] leading-relaxed`}>
          <p className="font-medium text-zinc-800">Invitert forelder</p>
          <p className="mt-1 text-zinc-600">
            Du kan legge til og endre hendelser i kalenderen. Familiemedlemmer administreres av{' '}
            <span className="font-medium text-zinc-700">eieren av kalenderen</span>. Du kan redigere navn og farge på{' '}
            <span className="font-medium text-zinc-700">deg selv</span> med «Rediger» på din rad.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-zinc-900">Familie</h2>
        {canManageFamilyMembers && !adding && !editingId && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={btnPrimaryPill}
          >
            Legg til person
          </button>
        )}
      </div>


      {adding && (
        <div className={`${cardInset} p-4`}>
          <PersonForm
            mode="add"
            title="Nytt familiemedlem"
            saveLabel="Legg til"
            onSave={async (data) => {
              const created = await addPerson(data)
              if (data.memberKind === 'parent' && created && user && effectiveUserId) {
                const inv = await getOrCreateInviteForTarget(
                  effectiveUserId,
                  created.id
                )
                if (inv) {
                  const url = buildInviteUrl(inv.token)
                  setInviteUrlByPersonId((prev) => ({ ...prev, [created.id]: url }))
                  setExpandedInviteForId(created.id)
                }
              }
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {editingPerson && (
        <div className={`${cardInset} p-4`}>
          <PersonForm
            mode="edit"
            initial={editingPerson}
            title="Rediger familiemedlem"
            saveLabel="Lagre"
            onSave={async (data) => {
              await updatePerson(editingPerson.id, {
                name: data.name,
                colorTint: data.colorTint,
                colorAccent: data.colorAccent,
                school: data.school,
                work: data.work,
              })
              setEditingId(null)
            }}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      <ul className="space-y-2">
        {people.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-zinc-200 bg-white shadow-soft"
          >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-8 w-8 shrink-0 rounded-full"
                style={{ backgroundColor: p.colorTint, border: `2px solid ${p.colorAccent}` }}
                aria-hidden
              />
              <div className="min-w-0">
                <span className="block text-[15px] font-medium text-zinc-900">{p.name}</span>
                <span className="text-[11px] font-medium text-zinc-500">
                  {p.memberKind === 'parent' ? 'Forelder' : 'Barn'}
                  {p.memberKind === 'parent' &&
                    !p.linkedAuthUserId &&
                    canManageFamilyMembers &&
                    (!mePersonId || p.id !== mePersonId) && (
                      <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                        Ingen konto koblet ennå
                      </span>
                    )}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canManageFamilyMembers &&
                p.memberKind === 'parent' &&
                !p.linkedAuthUserId &&
                (!mePersonId || p.id !== mePersonId) && (
                  <button
                    type="button"
                    onClick={() => void showInviteForParent(p.id)}
                    disabled={!!adding || !!editingId || inviteLoadingForId === p.id}
                    className="rounded-xl border border-emerald-200 bg-white px-2.5 py-1 text-caption font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 focus:outline-none"
                  >
                    {inviteLoadingForId === p.id ? 'Henter…' : expandedInviteForId === p.id ? 'Skjul lenke' : 'Vis invitasjonslenke'}
                  </button>
                )}
              {canEditFamilyMember(p.id) && (
                <button
                  type="button"
                  onClick={() => setEditingId(p.id)}
                  disabled={!!adding || !!editingId}
                  className={`${btnRowAction} disabled:opacity-50`}
                >
                  Rediger
                </button>
              )}
              {canManageFamilyMembers && confirmRemoveId === p.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-caption text-zinc-500">Fjerne?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveId(null)}
                    className={btnRowAction}
                  >Nei</button>
                  <button
                    type="button"
                    onClick={async () => {
                      setConfirmRemoveId(null)
                      await removePerson(p.id)
                      onPersonRemoved?.(p.id)
                    }}
                    className="rounded-xl border border-rose-200 bg-white px-2.5 py-1 text-caption font-medium text-rose-600 hover:bg-rose-50 focus:outline-none"
                  >Fjern</button>
                </div>
              ) : canManageFamilyMembers ? (
                <button
                  type="button"
                  onClick={() => setConfirmRemoveId(p.id)}
                  disabled={!!adding || !!editingId || (mePersonId != null && p.id === mePersonId)}
                  className="rounded-xl border border-rose-200 bg-white px-2.5 py-1 text-caption font-medium text-rose-500 hover:bg-rose-50 disabled:opacity-50 focus:outline-none"
                >
                  Fjern
                </button>
              ) : null}
            </div>
          </div>
          {expandedInviteForId === p.id && inviteUrlByPersonId[p.id] && (
            <div className="border-t border-emerald-100 bg-emerald-50/60 px-4 py-3 text-[13px]">
              <p className="font-medium text-emerald-900 mb-1.5">Invitasjonslenke</p>
              <input
                readOnly
                value={inviteUrlByPersonId[p.id]}
                className="w-full break-all rounded-lg border border-emerald-100 bg-white px-3 py-1.5 text-[12px] text-zinc-700"
                aria-label="Invitasjonslenke"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(inviteUrlByPersonId[p.id]!) } catch {}
                  }}
                  className="rounded-pill bg-emerald-700 px-3 py-1 text-[12px] font-medium text-white hover:bg-emerald-800 transition"
                >
                  Kopier lenke
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedInviteForId(null)}
                  className="text-[12px] font-medium text-emerald-800 underline underline-offset-2"
                >
                  Skjul
                </button>
              </div>
            </div>
          )}
          </li>
        ))}
      </ul>

      {people.length === 0 && !adding && (
        <p className="text-[13px] text-zinc-500">Ingen familiemedlemmer enda. Legg til en over.</p>
      )}
    </div>
  )
}

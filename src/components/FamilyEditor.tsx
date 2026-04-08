import { useState } from 'react'
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
          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
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
          className="flex-1 rounded-lg border border-zinc-200 py-2 text-[14px] font-medium text-zinc-700"
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-brandTeal py-2 text-[14px] font-semibold text-white shadow-planner transition hover:brightness-95 disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-brandTeal focus:ring-offset-2"
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
  const [parentInviteUrl, setParentInviteUrl] = useState<string | null>(null)
  const [inviteLoadingForId, setInviteLoadingForId] = useState<string | null>(null)

  const editingPerson = editingId ? people.find((p) => p.id === editingId) : null

  async function showInviteForParent(memberId: string) {
    if (!user || !effectiveUserId) return
    setInviteLoadingForId(memberId)
    try {
      const inv = await getOrCreateInviteForTarget(effectiveUserId, memberId)
      if (inv) setParentInviteUrl(buildInviteUrl(inv.token))
    } finally {
      setInviteLoadingForId(null)
    }
  }

  return (
    <div className="space-y-4">
      {isInvitedParent && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 text-[13px] leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">Invitert forelder</p>
          <p className="mt-1">
            Du kan legge til og endre aktiviteter i kalenderen. Familiemedlemmer (barn og andre) administreres av{' '}
            <span className="font-medium">eieren av kalenderen</span>. Du kan redigere navn og farge på{' '}
            <span className="font-medium">deg selv</span> med «Rediger» på din rad.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Familie</h2>
        {canManageFamilyMembers && !adding && !editingId && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-brandTeal px-3 py-1.5 text-[13px] font-medium text-white shadow-planner-sm hover:brightness-95"
          >
            Legg til person
          </button>
        )}
      </div>

      {parentInviteUrl && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-[13px] text-emerald-900">
          <p className="font-medium">Invitasjonslenke til forelder</p>
          <input
            readOnly
            value={parentInviteUrl}
            className="mt-2 w-full break-all rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-[12px]"
            aria-label="Invitasjonslenke"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(parentInviteUrl)
                } catch {
                  // ignore
                }
              }}
              className="rounded-full bg-emerald-700 px-3 py-1 text-[12px] font-medium text-white"
            >
              Kopier lenke
            </button>
            <button
              type="button"
              onClick={() => setParentInviteUrl(null)}
              className="text-[12px] font-medium text-emerald-900 underline underline-offset-2"
            >
              Skjul
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-800/90">
            Du finner lenken igjen med «Vis invitasjonslenke» på forelderraden under, eller under Innstillinger → «Vis aktiv
            invitasjonslenke» (siste aktive lenke).
          </p>
        </div>
      )}

      {adding && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
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
                if (inv) setParentInviteUrl(buildInviteUrl(inv.token))
              }
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {editingPerson && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
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
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3"
          >
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
                    className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-[12px] font-medium text-emerald-900 disabled:opacity-50"
                  >
                    {inviteLoadingForId === p.id ? 'Henter…' : 'Vis invitasjonslenke'}
                  </button>
                )}
              {canEditFamilyMember(p.id) && (
                <button
                  type="button"
                  onClick={() => setEditingId(p.id)}
                  disabled={!!adding || !!editingId}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[12px] font-medium text-zinc-600 disabled:opacity-50"
                >
                  Rediger
                </button>
              )}
              {canManageFamilyMembers && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Fjern ${p.name} og alle aktivitetene deres?`)) return
                    await removePerson(p.id)
                    onPersonRemoved?.(p.id)
                  }}
                  disabled={!!adding || !!editingId || (mePersonId != null && p.id === mePersonId)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-medium text-red-600 disabled:opacity-50"
                >
                  Fjern
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {people.length === 0 && !adding && (
        <p className="text-[13px] text-zinc-500">Ingen familiemedlemmer enda. Legg til en over.</p>
      )}
    </div>
  )
}

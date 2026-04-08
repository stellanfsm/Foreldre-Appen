import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { formatInviteAcceptError, formatSupabaseError } from './supabaseErrors'
import { generateInviteToken } from './inviteToken'

const INVITE_EXPIRY_DAYS = 7

export interface InviteInfo {
  fromUserId: string
  invitedEmail: string | null
  expiresAt: string
  acceptedAt: string | null
  fromEmail: string | null
  /** Owner’s family_members.id — invitee claims this parent row on accept */
  targetMemberId: string | null
}

export async function createInvite(
  fromUserId: string,
  invitedEmail?: string,
  targetMemberId?: string
): Promise<{ token: string; expiresAt: string } | null> {
  const token = generateInviteToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)

  const { error } = await supabase.from('family_invites').insert({
    from_user_id: fromUserId,
    token,
    invited_email: invitedEmail ?? null,
    expires_at: expiresAt.toISOString(),
    target_member_id: targetMemberId ?? null,
  })

  if (error) {
    console.error('[inviteApi] createInvite error', error)
    return null
  }
  return { token, expiresAt: expiresAt.toISOString() }
}

export async function getInviteByToken(token: string): Promise<InviteInfo | null> {
  const { data, error } = await supabase.rpc('get_invite_by_token', { in_token: token })
  if (error) {
    console.error('[inviteApi] get_invite_by_token error', error)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    fromUserId: row.from_user_id,
    invitedEmail: row.invited_email ?? null,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
    fromEmail: row.from_email ?? null,
    targetMemberId: row.target_member_id ?? null,
  }
}

export async function acceptInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('accept_invite', { in_token: token })
  if (error) {
    console.error('[inviteApi] accept_invite error', error)
    return { ok: false, error: formatSupabaseError(error as PostgrestError) }
  }
  const result = data as { ok: boolean; error?: string } | null
  if (!result) return { ok: false, error: formatInviteAcceptError(undefined) }
  if (result.ok) return { ok: true }
  return { ok: false, error: formatInviteAcceptError(result.error) }
}

export async function getMyLink(userId: string): Promise<{ linkedToUserId: string } | null> {
  const { data, error } = await supabase
    .from('family_links')
    .select('linked_to_user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[inviteApi] getMyLink error', error)
    return null
  }
  if (!data) return null
  return { linkedToUserId: data.linked_to_user_id }
}

export async function unlink(userId: string): Promise<boolean> {
  const { error } = await supabase.from('family_links').delete().eq('user_id', userId)
  if (error) {
    console.error('[inviteApi] unlink error', error)
    return false
  }
  return true
}

export function buildInviteUrl(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}?invite=${encodeURIComponent(token)}`
}

/** Pending invite row (owner reads own rows via RLS). */
export type PendingInviteRow = {
  token: string
  expiresAt: string
  targetMemberId: string | null
}

/** Newest non-expired, not-yet-accepted invite from this owner (any target). */
export async function fetchLatestPendingInvite(fromUserId: string): Promise<PendingInviteRow | null> {
  const { data, error } = await supabase
    .from('family_invites')
    .select('token, expires_at, target_member_id')
    .eq('from_user_id', fromUserId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[inviteApi] fetchLatestPendingInvite error', error)
    return null
  }
  if (!data) return null
  return {
    token: data.token,
    expiresAt: data.expires_at,
    targetMemberId: data.target_member_id ?? null,
  }
}

/** Pending invite for a specific pre-created parent row, if still valid. */
export async function fetchPendingInviteForTarget(
  fromUserId: string,
  targetMemberId: string
): Promise<PendingInviteRow | null> {
  const { data, error } = await supabase
    .from('family_invites')
    .select('token, expires_at, target_member_id')
    .eq('from_user_id', fromUserId)
    .eq('target_member_id', targetMemberId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[inviteApi] fetchPendingInviteForTarget error', error)
    return null
  }
  if (!data) return null
  return {
    token: data.token,
    expiresAt: data.expires_at,
    targetMemberId: data.target_member_id ?? null,
  }
}

/** Reuse an active invite for this parent, or create a new one. Token-based; not email-bound. */
export async function getOrCreateInviteForTarget(
  fromUserId: string,
  targetMemberId: string
): Promise<{ token: string; expiresAt: string } | null> {
  const existing = await fetchPendingInviteForTarget(fromUserId, targetMemberId)
  if (existing) return { token: existing.token, expiresAt: existing.expiresAt }
  return createInvite(fromUserId, undefined, targetMemberId)
}

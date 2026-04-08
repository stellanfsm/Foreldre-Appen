-- ============================================================================
-- Invite fix: make accept_invite fully token-based (no email check).
-- Run in Supabase SQL Editor after supabase-invites.sql.
--
-- Root cause of the bug:
--   The frontend was passing the CREATOR's own email as invited_email when
--   creating invites. The RPC then enforced that the acceptor's email must
--   match — making every invite impossible to accept for anyone else.
--
-- Fix strategy:
--   1. Frontend: stop sending invited_email (already done in code).
--   2. Backend: remove the email-match guard from accept_invite entirely.
--      invited_email column is kept for future opt-in email binding,
--      but the RPC no longer enforces it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_invite(in_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv
  FROM public.family_invites
  WHERE token = in_token
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF inv.from_user_id = uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_accept_own');
  END IF;

  -- Email check intentionally removed. Invites are now token-based.
  -- If you want opt-in email binding in the future, re-add this block
  -- only when invited_email was explicitly set by the inviting user for
  -- a specific recipient (not the creator's own email).

  INSERT INTO public.family_links (user_id, linked_to_user_id)
  VALUES (uid, inv.from_user_id)
  ON CONFLICT (user_id) DO UPDATE SET linked_to_user_id = EXCLUDED.linked_to_user_id;

  UPDATE public.family_invites
  SET accepted_at = now(), accepted_by_user_id = uid
  WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

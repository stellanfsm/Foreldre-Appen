-- Calendar events: allow person_id = NULL (Tankestrøm dokumentimport uten kjent person).
-- Run in Supabase SQL Editor on existing projects (idempotent ALTER).

ALTER TABLE public.events ALTER COLUMN person_id DROP NOT NULL;

-- Update single event: honor explicit JSON null / empty string for person_id.
CREATE OR REPLACE FUNCTION public.update_event_keep_owner(
  p_event_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_row events%ROWTYPE;
BEGIN
  SELECT user_id INTO v_owner_id FROM public.events WHERE id = p_event_id;
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF v_owner_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.family_links WHERE user_id = auth.uid() AND linked_to_user_id = v_owner_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.events
  SET
    person_id    = CASE
      WHEN NOT (p_updates ? 'person_id') THEN person_id
      WHEN jsonb_typeof(p_updates->'person_id') = 'null' THEN NULL
      WHEN COALESCE(btrim(p_updates->>'person_id'), '') = '' THEN NULL
      ELSE (p_updates->>'person_id')::text
    END,
    title        = COALESCE(p_updates->>'title', title),
    start        = COALESCE(p_updates->>'start', start),
    "end"        = COALESCE(p_updates->>'end', "end"),
    notes        = CASE WHEN p_updates ? 'notes' THEN (p_updates->>'notes')::text ELSE notes END,
    location     = CASE WHEN p_updates ? 'location' THEN (p_updates->>'location')::text ELSE location END,
    reminder_minutes = CASE WHEN p_updates ? 'reminder_minutes' THEN (p_updates->>'reminder_minutes')::int ELSE reminder_minutes END,
    metadata     = CASE WHEN p_updates ? 'metadata' THEN (p_updates->'metadata')::jsonb ELSE metadata END,
    date         = COALESCE((p_updates->>'date')::date, date)
  WHERE id = p_event_id;

  SELECT * INTO v_row FROM public.events WHERE id = p_event_id;
  RETURN jsonb_build_object(
    'ok', true,
    'row', to_jsonb(v_row)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_events_by_group_keep_owner(
  p_group_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT user_id INTO v_owner_id FROM public.events WHERE recurrence_group_id = p_group_id LIMIT 1;
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF v_owner_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.family_links WHERE user_id = auth.uid() AND linked_to_user_id = v_owner_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.events
  SET
    person_id    = CASE
      WHEN NOT (p_updates ? 'person_id') THEN person_id
      WHEN jsonb_typeof(p_updates->'person_id') = 'null' THEN NULL
      WHEN COALESCE(btrim(p_updates->>'person_id'), '') = '' THEN NULL
      ELSE (p_updates->>'person_id')::text
    END,
    title        = COALESCE(p_updates->>'title', title),
    start        = COALESCE(p_updates->>'start', start),
    "end"        = COALESCE(p_updates->>'end', "end"),
    notes        = CASE WHEN p_updates ? 'notes' THEN (p_updates->>'notes')::text ELSE notes END,
    location     = CASE WHEN p_updates ? 'location' THEN (p_updates->>'location')::text ELSE location END,
    reminder_minutes = CASE WHEN p_updates ? 'reminder_minutes' THEN (p_updates->>'reminder_minutes')::int ELSE reminder_minutes END
  WHERE recurrence_group_id = p_group_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_event_keep_owner(uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_events_by_group_keep_owner(uuid, jsonb) TO anon, authenticated;

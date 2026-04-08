-- ============================================================================
-- Tasks: a first-class entity for date-based to-do items.
-- Run in Supabase SQL Editor after:
--   supabase-setup.sql
--   supabase-invites.sql  (family_links must exist)
-- ============================================================================

-- 1) Create table
CREATE TABLE public.tasks (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 text        NOT NULL,
  notes                 text,
  date                  date        NOT NULL,
  due_time              text,                           -- "HH:mm", optional deadline
  assigned_to_person_id text,                           -- family_members.id (text), nullable
  child_person_id       text,                           -- family_members.id (text), nullable
  completed_at          timestamptz,                    -- null = open, non-null = done
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 2) Indexes
CREATE INDEX idx_tasks_user_date ON public.tasks (user_id, date);
CREATE INDEX idx_tasks_date      ON public.tasks (date);

-- 3) Before-update trigger: locks ownership + bumps updated_at
CREATE OR REPLACE FUNCTION public.tasks_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.user_id    := OLD.user_id;   -- prevent ownership reassignment
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_before_update_trigger
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.tasks_before_update();

-- 4) Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 5) Access policy — mirrors the "owner OR linked" pattern used by events and family_members
CREATE POLICY "tasks_access_owner_or_linked"
  ON public.tasks
  FOR ALL
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT linked_to_user_id
      FROM public.family_links
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IN (
      SELECT linked_to_user_id
      FROM public.family_links
      WHERE user_id = auth.uid()
    )
  );

-- 6) Fetch RPC — resolves effective owner (same pattern as get_events_for_calendar)
--    Linked users automatically see the calendar owner's tasks.
CREATE OR REPLACE FUNCTION public.get_tasks_for_calendar(
  p_start_date date,
  p_end_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    (SELECT linked_to_user_id FROM public.family_links WHERE user_id = auth.uid() LIMIT 1),
    auth.uid()
  ) INTO v_owner_id;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        row_to_json(t)::jsonb
        ORDER BY t.date,
                 t.due_time NULLS LAST,
                 t.created_at
      ),
      '[]'::jsonb
    )
    FROM public.tasks t
    WHERE t.user_id = v_owner_id
      AND t.date >= p_start_date
      AND t.date <= p_end_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tasks_for_calendar(date, date) TO anon, authenticated;

-- Run this entire file in Supabase: SQL Editor → New query → paste → Run.
-- Creates tables and security so the app can show login and store events/family.

-- 1) EVENTS table
DROP TABLE IF EXISTS public.events CASCADE;
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  person_id text,
  date date NOT NULL,
  title text NOT NULL,
  start text NOT NULL,
  "end" text NOT NULL,
  notes text,
  location text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own events"
  ON public.events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) FAMILY_MEMBERS table (id = text like 'emma', 'leo' for app compatibility)
DROP TABLE IF EXISTS public.family_members CASCADE;
CREATE TABLE public.family_members (
  id text NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color_tint text NOT NULL,
  color_accent text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own family_members"
  ON public.family_members FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Done. After running:
-- 1) In Supabase: Authentication → Providers → enable "Email".
-- 2) Restart app (npm run dev) and you should see the login screen.

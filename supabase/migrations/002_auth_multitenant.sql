-- ============================================================
-- Migration 002: Multi-Tenant Business Auth
-- Run in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. BUSINESSES TABLE
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.businesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  plan        TEXT NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Businesses are readable by any member of that business
CREATE POLICY "businesses_select" ON public.businesses
  FOR SELECT USING (
    id IN (
      SELECT business_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 2. ADD business_id TO public.users (profile table)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS auth_id     UUID UNIQUE; -- links to auth.users.id

-- ────────────────────────────────────────────────────────────
-- 3. ADD business_id TO ALL OPERATIONAL TABLES
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'shifts','attendance','stations','faults','fault_updates',
    'tasks','outside_broadcasts','handovers','notifications',
    'audit_logs','attachments','reports','broadcast_status'
  ])
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE',
      tbl
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. RLS POLICIES — helper function
-- Returns the business_id of the currently authenticated user
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS UUID
LANGUAGE SQL STABLE
SECURITY DEFINER
AS $$
  SELECT business_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. RLS POLICIES — users table
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow reading for users"    ON public.users;
DROP POLICY IF EXISTS "Allow insert for users"     ON public.users;
DROP POLICY IF EXISTS "Allow update for users"     ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (business_id = public.current_business_id());

CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "users_update" ON public.users
  FOR UPDATE USING (business_id = public.current_business_id());

-- ────────────────────────────────────────────────────────────
-- 6. RLS POLICIES — all operational tables
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'shifts','attendance','stations','faults','fault_updates',
    'tasks','outside_broadcasts','handovers','notifications',
    'audit_logs','attachments','reports','broadcast_status'
  ])
  LOOP
    -- Drop existing open policies first
    EXECUTE format('DROP POLICY IF EXISTS "Allow select for %1$s" ON public.%1$I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow insert for %1$s" ON public.%1$I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow update for %1$s" ON public.%1$I', tbl);

    EXECUTE format(
      'CREATE POLICY "%1$s_select" ON public.%1$I FOR SELECT USING (business_id = public.current_business_id())',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "%1$s_insert" ON public.%1$I FOR INSERT WITH CHECK (business_id = public.current_business_id())',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "%1$s_update" ON public.%1$I FOR UPDATE USING (business_id = public.current_business_id())',
      tbl
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 7. TRIGGER — auto-create user profile when auth.users is created
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_name        TEXT;
  v_role        TEXT;
BEGIN
  -- Read metadata passed during signUp
  v_business_id := (NEW.raw_user_meta_data ->> 'business_id')::UUID;
  v_name        := COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email);
  v_role        := COALESCE(NEW.raw_user_meta_data ->> 'role', 'Technician');

  INSERT INTO public.users (
    id, auth_id, email, name, role, pin, business_id, created_at
  ) VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    v_name,
    v_role,
    -- Generate a random 4-digit PIN for the user
    LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0'),
    v_business_id,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ────────────────────────────────────────────────────────────
-- 8. FUNCTION — register_business
-- Called from the app after auth.signUp() to create the business
-- and link the first admin user atomically.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_business(
  p_business_name TEXT,
  p_business_slug TEXT,
  p_user_auth_id  UUID,
  p_user_name     TEXT,
  p_logo_url      TEXT DEFAULT NULL
)
RETURNS UUID -- returns business_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  -- Create the business
  INSERT INTO public.businesses (name, slug, logo_url)
  VALUES (p_business_name, p_business_slug, p_logo_url)
  RETURNING id INTO v_business_id;

  -- Update the user profile (created by trigger) with business_id + Admin role
  UPDATE public.users
  SET
    business_id = v_business_id,
    role        = 'Admin',
    name        = p_user_name
  WHERE auth_id = p_user_auth_id;

  RETURN v_business_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 9. Slug uniqueness index
-- ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS businesses_slug_idx ON public.businesses(slug);

-- ────────────────────────────────────────────────────────────
-- 10. Updated_at trigger for businesses
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_updated_at ON public.businesses;
CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

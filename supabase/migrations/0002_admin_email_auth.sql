-- Admin auth: switch from username to e-mail as the unique identifier, add
-- the 'super_admin' role, and add a one-time bootstrap flow for the very
-- first administrator (no existing admin is required to authorize it).

ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'super_admin';

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS email text;

-- Backfill any pre-existing row (e.g. a test admin created before this
-- migration) so the NOT NULL/UNIQUE constraints below can be applied safely.
UPDATE public.admin_users
  SET name = COALESCE(name, username),
      email = COALESCE(email, lower(username) || '@bpinfo.local')
  WHERE name IS NULL OR email IS NULL;

ALTER TABLE public.admin_users
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN email SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_key ON public.admin_users (email);

ALTER TABLE public.admin_users DROP COLUMN IF EXISTS username;

-- Functions whose signature, return type, or even just a parameter NAME
-- change need to be dropped first — CREATE OR REPLACE cannot alter any of
-- those on an existing function.
DROP FUNCTION IF EXISTS public.verify_admin(text, text);
DROP FUNCTION IF EXISTS public.verify_admin_user(text, text);
DROP FUNCTION IF EXISTS public.admin_list(text, text);
DROP FUNCTION IF EXISTS public.admin_create(text, text, text, text, public.admin_role, uuid);
DROP FUNCTION IF EXISTS public.admin_update(text, text, uuid, text, text, public.admin_role, uuid);

CREATE OR REPLACE FUNCTION public.verify_admin(_email text, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE email = lower(_email)
      AND password_hash = extensions.crypt(_password, password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_user(_email text, _password text)
RETURNS TABLE(id uuid, name text, email text, role public.admin_role, store_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT a.id, a.name, a.email, a.role, a.store_id
  FROM public.admin_users a
  WHERE a.email = lower(_email)
    AND a.password_hash = extensions.crypt(_password, a.password_hash);
$$;

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users);
$$;

CREATE OR REPLACE FUNCTION public.admin_bootstrap(_name text, _email text, _password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id uuid;
  existing_count integer;
BEGIN
  -- Safe to expose to anon: only ever succeeds while the table is empty,
  -- regardless of who calls it or with what credentials.
  SELECT count(*) INTO existing_count FROM public.admin_users;
  IF existing_count > 0 THEN
    RAISE EXCEPTION 'admin already exists';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'name required';
  END IF;

  IF _email IS NULL OR length(trim(_email)) = 0 THEN
    RAISE EXCEPTION 'email required';
  END IF;

  IF _password IS NULL OR length(_password) < 4 THEN
    RAISE EXCEPTION 'password too short';
  END IF;

  INSERT INTO public.admin_users (name, email, password_hash, role)
  VALUES (
    trim(_name),
    lower(trim(_email)),
    extensions.crypt(_password, extensions.gen_salt('bf')),
    'super_admin'
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list(_actor text, _actor_password text)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  role public.admin_role,
  store_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
    SELECT a.id, a.name, a.email, a.role, a.store_id, a.created_at, a.updated_at
    FROM public.admin_users a
    ORDER BY a.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create(
  _actor text,
  _actor_password text,
  _name text,
  _email text,
  _password text,
  _role public.admin_role DEFAULT 'admin',
  _store_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'name required';
  END IF;

  IF _email IS NULL OR length(trim(_email)) = 0 THEN
    RAISE EXCEPTION 'email required';
  END IF;

  IF _password IS NULL OR length(_password) < 4 THEN
    RAISE EXCEPTION 'password too short';
  END IF;

  INSERT INTO public.admin_users (name, email, password_hash, role, store_id)
  VALUES (
    trim(_name),
    lower(trim(_email)),
    extensions.crypt(_password, extensions.gen_salt('bf')),
    _role,
    _store_id
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update(
  _actor text,
  _actor_password text,
  _id uuid,
  _new_name text,
  _new_email text,
  _new_password text,
  _new_role public.admin_role DEFAULT NULL,
  _new_store_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _new_name IS NOT NULL AND length(trim(_new_name)) > 0 THEN
    UPDATE public.admin_users
      SET name = trim(_new_name)
      WHERE id = _id;
  END IF;

  IF _new_email IS NOT NULL AND length(trim(_new_email)) > 0 THEN
    UPDATE public.admin_users
      SET email = lower(trim(_new_email))
      WHERE id = _id;
  END IF;

  IF _new_password IS NOT NULL AND length(_new_password) >= 4 THEN
    UPDATE public.admin_users
      SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf'))
      WHERE id = _id;
  END IF;

  IF _new_role IS NOT NULL THEN
    UPDATE public.admin_users
      SET role = _new_role
      WHERE id = _id;
  END IF;

  IF _new_store_id IS NOT NULL THEN
    UPDATE public.admin_users
      SET store_id = _new_store_id
      WHERE id = _id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete(_actor text, _actor_password text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target_email text;
  total integer;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT email INTO target_email
    FROM public.admin_users
    WHERE id = _id;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF target_email = lower(_actor) THEN
    RAISE EXCEPTION 'cannot delete own user';
  END IF;

  SELECT count(*) INTO total FROM public.admin_users;

  IF total <= 1 THEN
    RAISE EXCEPTION 'must keep at least one admin';
  END IF;

  DELETE FROM public.admin_users WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_admin(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_admin(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_admin_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_admin_user(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_exists() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_bootstrap(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_bootstrap(text, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create(text, text, text, text, text, public.admin_role, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create(text, text, text, text, text, public.admin_role, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update(text, text, uuid, text, text, text, public.admin_role, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update(text, text, uuid, text, text, text, public.admin_role, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete(text, text, uuid) TO anon, authenticated;

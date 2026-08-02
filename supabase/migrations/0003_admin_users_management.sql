-- Turns admin_users into a proper user-management module: active/inactive
-- status, temporary-password + forced password change on next login, and
-- last-login tracking.

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Inactive users can no longer authenticate.
DROP FUNCTION IF EXISTS public.verify_admin(text, text);
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
      AND active = true
      AND password_hash = extensions.crypt(_password, password_hash)
  );
$$;

DROP FUNCTION IF EXISTS public.verify_admin_user(text, text);
CREATE OR REPLACE FUNCTION public.verify_admin_user(_email text, _password text)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  role public.admin_role,
  store_id uuid,
  must_change_password boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT a.id, a.name, a.email, a.role, a.store_id, a.must_change_password
  FROM public.admin_users a
  WHERE a.email = lower(_email)
    AND a.active = true
    AND a.password_hash = extensions.crypt(_password, a.password_hash);
$$;

-- Records a successful login. Kept separate from verify_admin (which stays a
-- pure read used internally by every other admin_* function to re-authorize
-- an actor) so "último acesso" reflects real logins, not every action.
CREATE OR REPLACE FUNCTION public.admin_record_login(_email text, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF public.verify_admin(_email, _password) THEN
    UPDATE public.admin_users SET last_login_at = now() WHERE email = lower(_email);
  END IF;
END;
$$;

-- Lets a logged-in user change their own password (used by the forced
-- "troque sua senha" screen right after a temporary-password login).
CREATE OR REPLACE FUNCTION public.admin_change_own_password(_email text, _current_password text, _new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_email, _current_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _new_password IS NULL OR length(_new_password) < 4 THEN
    RAISE EXCEPTION 'password too short';
  END IF;

  UPDATE public.admin_users
    SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf')),
        must_change_password = false
    WHERE email = lower(_email);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list(text, text);
CREATE OR REPLACE FUNCTION public.admin_list(_actor text, _actor_password text)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  role public.admin_role,
  store_id uuid,
  active boolean,
  must_change_password boolean,
  last_login_at timestamptz,
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
    SELECT a.id, a.name, a.email, a.role, a.store_id, a.active, a.must_change_password,
           a.last_login_at, a.created_at, a.updated_at
    FROM public.admin_users a
    ORDER BY a.name;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_create(text, text, text, text, text, public.admin_role, uuid);
CREATE OR REPLACE FUNCTION public.admin_create(
  _actor text,
  _actor_password text,
  _name text,
  _email text,
  _password text,
  _role public.admin_role DEFAULT 'admin',
  _store_id uuid DEFAULT NULL,
  _require_password_change boolean DEFAULT true
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

  BEGIN
    INSERT INTO public.admin_users (name, email, password_hash, role, store_id, must_change_password)
    VALUES (
      trim(_name),
      lower(trim(_email)),
      extensions.crypt(_password, extensions.gen_salt('bf')),
      _role,
      _store_id,
      _require_password_change
    )
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'email already registered';
  END;

  RETURN new_id;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_update(text, text, uuid, text, text, text, public.admin_role, uuid);
CREATE OR REPLACE FUNCTION public.admin_update(
  _actor text,
  _actor_password text,
  _id uuid,
  _new_name text,
  _new_email text,
  _new_password text,
  _new_role public.admin_role DEFAULT NULL,
  _new_store_id uuid DEFAULT NULL,
  _require_password_change boolean DEFAULT false
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
    BEGIN
      UPDATE public.admin_users
        SET email = lower(trim(_new_email))
        WHERE id = _id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'email already registered';
    END;
  END IF;

  IF _new_password IS NOT NULL AND length(_new_password) >= 4 THEN
    UPDATE public.admin_users
      SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf')),
          must_change_password = _require_password_change
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

-- Replaces hard delete as the primary lifecycle action: deactivate/reactivate,
-- with the two required safety guards enforced at the database level (not
-- just client-side), since this is SECURITY DEFINER and callable by anon.
CREATE OR REPLACE FUNCTION public.admin_set_active(_actor text, _actor_password text, _id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target_role public.admin_role;
  target_email text;
  actor_id uuid;
  other_active_super_admins integer;
  other_active_admins integer;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT role, email INTO target_role, target_email FROM public.admin_users WHERE id = _id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF _active = false THEN
    IF target_role = 'super_admin' THEN
      SELECT count(*) INTO other_active_super_admins
        FROM public.admin_users
        WHERE role = 'super_admin' AND active = true AND id <> _id;
      IF other_active_super_admins = 0 THEN
        RAISE EXCEPTION 'must keep at least one active super admin';
      END IF;
    END IF;

    SELECT id INTO actor_id FROM public.admin_users WHERE email = lower(_actor);
    IF actor_id = _id THEN
      SELECT count(*) INTO other_active_admins
        FROM public.admin_users
        WHERE active = true AND id <> _id;
      IF other_active_admins = 0 THEN
        RAISE EXCEPTION 'cannot deactivate yourself with no administrators left';
      END IF;
    END IF;
  END IF;

  UPDATE public.admin_users SET active = _active WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_admin(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_admin(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_admin_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_admin_user(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_record_login(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_record_login(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_change_own_password(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_change_own_password(text, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create(text, text, text, text, text, public.admin_role, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create(text, text, text, text, text, public.admin_role, uuid, boolean) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update(text, text, uuid, text, text, text, public.admin_role, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update(text, text, uuid, text, text, text, public.admin_role, uuid, boolean) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_active(text, text, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_active(text, text, uuid, boolean) TO anon, authenticated;

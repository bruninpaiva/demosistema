
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_users TO service_role;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER admin_users_set_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.admin_users (username, password_hash) VALUES
  ('admin',   extensions.crypt('123456', extensions.gen_salt('bf'))),
  ('Eduardo', extensions.crypt('1966',   extensions.gen_salt('bf'))),
  ('Elisa',   extensions.crypt('1967',   extensions.gen_salt('bf')))
ON CONFLICT (username) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_admin(_username text, _password text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE username = _username
      AND password_hash = extensions.crypt(_password, password_hash)
  );
$$;
REVOKE ALL ON FUNCTION public.verify_admin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_admin(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list(_actor text, _actor_password text)
RETURNS TABLE(id uuid, username text, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT a.id, a.username, a.created_at, a.updated_at FROM public.admin_users a ORDER BY a.username;
END; $$;
REVOKE ALL ON FUNCTION public.admin_list(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_create(_actor text, _actor_password text, _username text, _password text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _username IS NULL OR length(trim(_username)) = 0 THEN RAISE EXCEPTION 'username required'; END IF;
  IF _password IS NULL OR length(_password) < 4 THEN RAISE EXCEPTION 'password too short'; END IF;
  INSERT INTO public.admin_users(username, password_hash)
  VALUES (trim(_username), extensions.crypt(_password, extensions.gen_salt('bf')))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;
REVOKE ALL ON FUNCTION public.admin_create(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create(text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_update(_actor text, _actor_password text, _id uuid, _new_username text, _new_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _new_username IS NOT NULL AND length(trim(_new_username)) > 0 THEN
    UPDATE public.admin_users SET username = trim(_new_username) WHERE id = _id;
  END IF;
  IF _new_password IS NOT NULL AND length(_new_password) >= 4 THEN
    UPDATE public.admin_users SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf')) WHERE id = _id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.admin_update(text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update(text, text, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete(_actor text, _actor_password text, _id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE target_username text; total int;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT username INTO target_username FROM public.admin_users WHERE id = _id;
  IF target_username IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF target_username = _actor THEN RAISE EXCEPTION 'cannot delete own user'; END IF;
  SELECT count(*) INTO total FROM public.admin_users;
  IF total <= 1 THEN RAISE EXCEPTION 'must keep at least one admin'; END IF;
  DELETE FROM public.admin_users WHERE id = _id;
END; $$;
REVOKE ALL ON FUNCTION public.admin_delete(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete(text, text, uuid) TO anon, authenticated;

-- admin_authenticate's RETURNS TABLE declares OUT parameters named id/email,
-- which become implicit PL/pgSQL variables visible throughout the function
-- body. Every bare (unqualified) reference to admin_users.id/.email inside
-- an embedded query was therefore ambiguous between "the OUT parameter" and
-- "the table column" — Postgres rejected every single call with:
--   42702 column reference "email" is ambiguous
-- effectively taking down login for every account. Fixed by aliasing the
-- table as `au` and qualifying every reference, so the function no longer
-- depends on implicit RETURNS TABLE names lining up (or not) with real
-- column names.
CREATE OR REPLACE FUNCTION public.admin_authenticate(_email text, _password text, _code text DEFAULT NULL)
RETURNS TABLE(
  status text, -- 'ok' | 'needs_2fa' | 'invalid' | 'locked'
  id uuid,
  name text,
  email text,
  role public.admin_role,
  store_id uuid,
  must_change_password boolean,
  two_factor_enabled boolean,
  locked_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  u public.admin_users%ROWTYPE;
  code_ok boolean := false;
  codes jsonb;
  elem jsonb;
  new_codes jsonb;
BEGIN
  SELECT * INTO u FROM public.admin_users au WHERE au.email = lower(_email) AND au.active = true;

  IF u.id IS NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::public.admin_role, NULL::uuid, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  IF u.locked_until IS NOT NULL AND u.locked_until > now() THEN
    RETURN QUERY SELECT 'locked'::text, NULL::uuid, NULL::text, NULL::text, NULL::public.admin_role, NULL::uuid, NULL::boolean, NULL::boolean,
      ceil(extract(epoch FROM u.locked_until - now()))::integer;
    RETURN;
  END IF;

  IF u.password_hash <> extensions.crypt(_password, u.password_hash) THEN
    UPDATE public.admin_users au
      SET failed_login_attempts = au.failed_login_attempts + 1,
          locked_until = CASE WHEN au.failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE au.locked_until END
      WHERE au.id = u.id;
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::public.admin_role, NULL::uuid, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  IF NOT u.two_factor_enabled THEN
    UPDATE public.admin_users au SET failed_login_attempts = 0, locked_until = NULL WHERE au.id = u.id;
    RETURN QUERY SELECT 'ok'::text, u.id, u.name, u.email, u.role, u.store_id, u.must_change_password, u.two_factor_enabled, NULL::integer;
    RETURN;
  END IF;

  -- 2FA is enabled: password alone is not enough.
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RETURN QUERY SELECT 'needs_2fa'::text, NULL::uuid, NULL::text, NULL::text, NULL::public.admin_role, NULL::uuid, NULL::boolean, u.two_factor_enabled, NULL::integer;
    RETURN;
  END IF;

  code_ok := public.totp_verify(u.two_factor_secret, _code, 1);

  IF NOT code_ok THEN
    -- Not a valid TOTP code — try it as an unused recovery code.
    codes := u.recovery_codes;
    new_codes := '[]'::jsonb;
    FOR elem IN SELECT * FROM jsonb_array_elements(codes) LOOP
      IF NOT code_ok AND (elem ->> 'used')::boolean = false
         AND (elem ->> 'hash') = encode(extensions.digest(upper(trim(_code)), 'sha256'), 'hex') THEN
        code_ok := true;
        elem := jsonb_set(elem, '{used}', 'true'::jsonb);
      END IF;
      new_codes := new_codes || jsonb_build_array(elem);
    END LOOP;
    IF code_ok THEN
      UPDATE public.admin_users au SET recovery_codes = new_codes WHERE au.id = u.id;
    END IF;
  END IF;

  IF NOT code_ok THEN
    UPDATE public.admin_users au
      SET failed_login_attempts = au.failed_login_attempts + 1,
          locked_until = CASE WHEN au.failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE au.locked_until END
      WHERE au.id = u.id;
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::public.admin_role, NULL::uuid, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  UPDATE public.admin_users au SET failed_login_attempts = 0, locked_until = NULL WHERE au.id = u.id;
  RETURN QUERY SELECT 'ok'::text, u.id, u.name, u.email, u.role, u.store_id, u.must_change_password, u.two_factor_enabled, NULL::integer;
END;
$$;

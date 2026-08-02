-- Identity & Security module: TOTP two-factor authentication, recovery
-- codes, password-reset tokens, and login lockout.
--
-- The TOTP implementation below (base32_encode/base32_decode/totp_code) is
-- a hand-written RFC 6238 implementation using pgcrypto's hmac(), because
-- this app has no server-side Node auth layer — every admin_* auth check
-- already lives in Postgres, and none of these functions need anon/service
-- role beyond what's already granted. A self-test against the official
-- RFC 6238 test vectors runs at the end of this migration and RAISES if the
-- math is wrong, so an incorrect port fails loudly here instead of shipping
-- broken 2FA.

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_secret text,
  ADD COLUMN IF NOT EXISTS recovery_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS password_reset_token text,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

CREATE INDEX IF NOT EXISTS admin_users_password_reset_token_idx
  ON public.admin_users (password_reset_token)
  WHERE password_reset_token IS NOT NULL;

-- ============================================================
-- Base32 (RFC 4648) — needed because authenticator apps expect
-- TOTP secrets encoded as base32, not hex/base64.
-- ============================================================

CREATE OR REPLACE FUNCTION public.base32_encode(data bytea)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  bits int := 0;
  value int := 0;
  output text := '';
  i int;
  b int;
BEGIN
  FOR i IN 0..length(data) - 1 LOOP
    b := get_byte(data, i);
    value := (value << 8) | b;
    bits := bits + 8;
    WHILE bits >= 5 LOOP
      output := output || substr(alphabet, ((value >> (bits - 5)) & 31) + 1, 1);
      bits := bits - 5;
    END LOOP;
  END LOOP;
  IF bits > 0 THEN
    output := output || substr(alphabet, ((value << (5 - bits)) & 31) + 1, 1);
  END IF;
  RETURN output;
END;
$$;

CREATE OR REPLACE FUNCTION public.base32_decode(data text)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  clean text;
  bits int := 0;
  value int := 0;
  output bytea := ''::bytea;
  i int;
  idx int;
  c text;
BEGIN
  clean := upper(regexp_replace(coalesce(data, ''), '[^A-Za-z2-7]', '', 'g'));
  FOR i IN 1..length(clean) LOOP
    c := substr(clean, i, 1);
    idx := position(c in alphabet) - 1;
    IF idx < 0 THEN
      CONTINUE;
    END IF;
    value := (value << 5) | idx;
    bits := bits + 5;
    IF bits >= 8 THEN
      output := output || set_byte('\x00'::bytea, 0, (value >> (bits - 8)) & 255);
      bits := bits - 8;
    END IF;
  END LOOP;
  RETURN output;
END;
$$;

-- ============================================================
-- TOTP (RFC 6238) / HOTP (RFC 4226)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_totp_secret()
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.base32_encode(extensions.gen_random_bytes(20));
$$;

CREATE OR REPLACE FUNCTION public.totp_code(secret_b32 text, counter bigint)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key bytea;
  msg bytea := '\x0000000000000000'::bytea;
  digest_result bytea;
  offset_val int;
  bin_code bigint;
  i int;
  shift_amount int;
  byte_val int;
BEGIN
  key := public.base32_decode(secret_b32);
  -- 8-byte big-endian counter, one byte at a time (avoids one deeply
  -- nested/error-prone expression).
  FOR i IN 0..7 LOOP
    shift_amount := (7 - i) * 8;
    byte_val := ((counter >> shift_amount) & 255)::int;
    msg := set_byte(msg, i, byte_val);
  END LOOP;
  digest_result := extensions.hmac(msg, key, 'sha1');
  offset_val := get_byte(digest_result, length(digest_result) - 1) & 15;
  bin_code := ((get_byte(digest_result, offset_val) & 127)::bigint << 24)
            | (get_byte(digest_result, offset_val + 1)::bigint << 16)
            | (get_byte(digest_result, offset_val + 2)::bigint << 8)
            | get_byte(digest_result, offset_val + 3)::bigint;
  RETURN lpad((bin_code % 1000000)::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.totp_verify(secret_b32 text, code text, window_steps int DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  clean_code text;
  current_counter bigint;
  i int;
BEGIN
  clean_code := regexp_replace(coalesce(code, ''), '[^0-9]', '', 'g');
  IF length(clean_code) <> 6 THEN
    RETURN false;
  END IF;
  current_counter := floor(extract(epoch FROM now()) / 30)::bigint;
  FOR i IN (-window_steps)..window_steps LOOP
    IF public.totp_code(secret_b32, current_counter + i) = clean_code THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- Self-test against the official RFC 6238 Appendix B test vectors (SHA1).
-- If this raises, the migration stops here instead of shipping broken 2FA.
DO $$
DECLARE
  test_secret text := public.base32_encode(convert_to('12345678901234567890', 'UTF8'));
  got text;
BEGIN
  got := public.totp_code(test_secret, 1); -- T=59s
  IF got <> '287082' THEN
    RAISE EXCEPTION 'TOTP self-test failed (T=59): got % expected 287082', got;
  END IF;

  got := public.totp_code(test_secret, 37037036); -- T=1111111109
  IF got <> '081804' THEN
    RAISE EXCEPTION 'TOTP self-test failed (T=1111111109): got % expected 081804', got;
  END IF;

  got := public.totp_code(test_secret, 41152263); -- T=1234567890
  IF got <> '005924' THEN
    RAISE EXCEPTION 'TOTP self-test failed (T=1234567890): got % expected 005924', got;
  END IF;

  got := public.totp_code(test_secret, 66666666); -- T=2000000000
  IF got <> '279037' THEN
    RAISE EXCEPTION 'TOTP self-test failed (T=2000000000): got % expected 279037', got;
  END IF;

  RAISE NOTICE 'TOTP self-test against RFC 6238 vectors passed.';
END $$;

-- ============================================================
-- Recovery codes
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_recovery_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(extensions.gen_random_bytes(1), 0) % 33) + 1, 1),
    ''
  )
  FROM generate_series(1, 10);
$$;

-- ============================================================
-- Login: lockout + 2FA-aware authentication
-- ============================================================

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
  SELECT * INTO u FROM public.admin_users WHERE email = lower(_email) AND active = true;

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
    UPDATE public.admin_users
      SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
      WHERE id = u.id;
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::public.admin_role, NULL::uuid, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  IF NOT u.two_factor_enabled THEN
    UPDATE public.admin_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = u.id;
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
      UPDATE public.admin_users SET recovery_codes = new_codes WHERE id = u.id;
    END IF;
  END IF;

  IF NOT code_ok THEN
    UPDATE public.admin_users
      SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
      WHERE id = u.id;
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::public.admin_role, NULL::uuid, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  UPDATE public.admin_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = u.id;
  RETURN QUERY SELECT 'ok'::text, u.id, u.name, u.email, u.role, u.store_id, u.must_change_password, u.two_factor_enabled, NULL::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_authenticate(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_authenticate(text, text, text) TO anon, authenticated;

-- ============================================================
-- 2FA setup / verify / disable
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_2fa_setup_init(_actor text, _actor_password text)
RETURNS TABLE(secret text, otpauth_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_secret text;
  actor_email text;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  new_secret := public.generate_totp_secret();
  actor_email := lower(_actor);

  -- Stored but NOT enabled yet — only admin_2fa_setup_verify flips the flag,
  -- after the user proves they can generate a valid code from it.
  UPDATE public.admin_users SET two_factor_secret = new_secret WHERE email = actor_email;

  RETURN QUERY SELECT
    new_secret,
    'otpauth://totp/' || replace('BPInfo ERP', ' ', '%20') || ':' || actor_email ||
      '?secret=' || new_secret ||
      '&issuer=' || replace('BPInfo ERP', ' ', '%20') ||
      '&algorithm=SHA1&digits=6&period=30';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_2fa_setup_verify(_actor text, _actor_password text, _code text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  u public.admin_users%ROWTYPE;
  plain_codes text[] := '{}';
  hashed_codes jsonb := '[]'::jsonb;
  new_code text;
  i int;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO u FROM public.admin_users WHERE email = lower(_actor);

  IF u.two_factor_secret IS NULL THEN
    RAISE EXCEPTION 'no pending 2fa setup';
  END IF;

  IF NOT public.totp_verify(u.two_factor_secret, _code, 1) THEN
    RAISE EXCEPTION 'invalid code';
  END IF;

  FOR i IN 1..8 LOOP
    new_code := public.generate_recovery_code();
    plain_codes := array_append(plain_codes, new_code);
    hashed_codes := hashed_codes || jsonb_build_array(
      jsonb_build_object('hash', encode(extensions.digest(new_code, 'sha256'), 'hex'), 'used', false)
    );
  END LOOP;

  UPDATE public.admin_users
    SET two_factor_enabled = true, recovery_codes = hashed_codes
    WHERE id = u.id;

  RETURN plain_codes;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_2fa_disable(_actor text, _actor_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.admin_users
    SET two_factor_enabled = false, two_factor_secret = NULL, recovery_codes = '[]'::jsonb
    WHERE email = lower(_actor);
END;
$$;

-- Support case: user lost their authenticator device. Any authenticated
-- admin can force-clear 2FA on someone ELSE'S account (never used for
-- self — admin_2fa_disable already covers that, driven by the user's own
-- password, not another admin's).
CREATE OR REPLACE FUNCTION public.admin_force_disable_2fa(_actor text, _actor_password text, _target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.admin_users
    SET two_factor_enabled = false, two_factor_secret = NULL, recovery_codes = '[]'::jsonb
    WHERE id = _target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_2fa_setup_init(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_2fa_setup_init(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_2fa_setup_verify(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_2fa_setup_verify(text, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_2fa_disable(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_2fa_disable(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_force_disable_2fa(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_force_disable_2fa(text, text, uuid) TO anon, authenticated;

-- Lets an admin manually clear a lockout early (support action from the
-- user's "ficha" — Status da conta section).
CREATE OR REPLACE FUNCTION public.admin_unlock(_actor text, _actor_password text, _target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.admin_users
    SET failed_login_attempts = 0, locked_until = NULL
    WHERE id = _target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unlock(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_unlock(text, text, uuid) TO anon, authenticated;

-- ============================================================
-- Password reset (email delivery itself is out of the database's
-- hands — see app-side notes; this part only handles the token
-- lifecycle, which is fully real and fully enforced here).
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_request_password_reset(_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  u public.admin_users%ROWTYPE;
  raw_token text;
BEGIN
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  SELECT * INTO u FROM public.admin_users WHERE email = lower(_email) AND active = true;

  IF u.id IS NOT NULL THEN
    UPDATE public.admin_users
      SET password_reset_token = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
          password_reset_expires_at = now() + interval '15 minutes'
      WHERE id = u.id;
  END IF;

  -- Always returns a token-shaped string, whether or not the e-mail exists,
  -- so the caller can never distinguish the two cases from this response.
  RETURN raw_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_password(_token text, _new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  u public.admin_users%ROWTYPE;
BEGIN
  IF _new_password IS NULL OR length(_new_password) < 4 THEN
    RAISE EXCEPTION 'password too short';
  END IF;

  SELECT * INTO u
    FROM public.admin_users
    WHERE password_reset_token = encode(extensions.digest(coalesce(_token, ''), 'sha256'), 'hex')
      AND password_reset_expires_at IS NOT NULL
      AND password_reset_expires_at > now();

  IF u.id IS NULL THEN
    RETURN false;
  END IF;

  -- 2FA (if enabled) is intentionally left untouched: a stolen e-mail link
  -- alone still isn't enough to get in.
  UPDATE public.admin_users
    SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf')),
        password_changed_at = now(),
        must_change_password = false,
        password_reset_token = NULL,
        password_reset_expires_at = NULL,
        failed_login_attempts = 0,
        locked_until = NULL
    WHERE id = u.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_request_password_reset(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_request_password_reset(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reset_password(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(text, text) TO anon, authenticated;

-- ============================================================
-- Keep password_changed_at accurate for the other existing
-- password-setting paths too (bootstrap, admin_create,
-- admin_update, admin_change_own_password).
-- ============================================================

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

  INSERT INTO public.admin_users (name, email, password_hash, role, password_changed_at)
  VALUES (
    trim(_name),
    lower(trim(_email)),
    extensions.crypt(_password, extensions.gen_salt('bf')),
    'super_admin',
    now()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

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
    INSERT INTO public.admin_users (name, email, password_hash, role, store_id, must_change_password, password_changed_at)
    VALUES (
      trim(_name),
      lower(trim(_email)),
      extensions.crypt(_password, extensions.gen_salt('bf')),
      _role,
      _store_id,
      _require_password_change,
      now()
    )
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'email already registered';
  END;

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
          must_change_password = _require_password_change,
          password_changed_at = now()
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
        must_change_password = false,
        password_changed_at = now()
    WHERE email = lower(_email);
END;
$$;

-- admin_list now also surfaces the new security fields to the Usuários tab.
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
  two_factor_enabled boolean,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  locked_until timestamptz,
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
    SELECT a.id, a.name, a.email, a.role, a.store_id, a.active, a.must_change_password, a.two_factor_enabled,
           a.last_login_at, a.password_changed_at, a.locked_until, a.created_at, a.updated_at
    FROM public.admin_users a
    ORDER BY a.name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list(text, text) TO anon, authenticated;

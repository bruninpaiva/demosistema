-- BPInfo ERP initial schema baseline.
-- Structural objects only: no seeds, historical backfills, users, stores, or operational data.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TYPE public.app_role AS ENUM ('admin', 'operator');
CREATE TYPE public.admin_role AS ENUM ('admin', 'gerente');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  queue_position integer,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available',
  CONSTRAINT sales_reps_status_check
    CHECK (status IN ('available', 'lunch', 'off', 'in_service'))
);

CREATE TABLE public.no_sale_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_other boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sales_rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  type text CHECK (type IN ('sale', 'no_sale')),
  amount numeric(10, 2),
  notes text,
  reason_id uuid REFERENCES public.no_sale_reasons(id),
  reason_other_text text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'closed',
  closed_at timestamptz,
  CONSTRAINT attendances_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT attendances_status_type_chk CHECK (
    (status = 'open' AND type IS NULL)
    OR (status = 'closed' AND type = ANY (ARRAY['sale'::text, 'no_sale'::text]))
  ),
  CONSTRAINT attendances_type_when_closed_check CHECK (
    status = 'open' OR (status = 'closed' AND type IN ('sale', 'no_sale'))
  )
);

CREATE TABLE public.rep_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  break_type text NOT NULL CHECK (break_type IN ('lunch', 'off')),
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role public.admin_role NOT NULL DEFAULT 'admin',
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.promo_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  file_name text NOT NULL,
  discount integer NOT NULL,
  product_count integer NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  csv_content text NOT NULL
);

CREATE TABLE public.commission_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  month integer NOT NULL,
  year integer NOT NULL,
  meta_amount numeric NOT NULL DEFAULT 0,
  commission_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_by text,
  closed_at timestamptz,
  closed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, month, year)
);

CREATE TABLE public.commission_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.commission_imports(id) ON DELETE CASCADE,
  nome text NOT NULL,
  bruto numeric NOT NULL DEFAULT 0,
  liquido numeric NOT NULL DEFAULT 0,
  desc_pct numeric NOT NULL DEFAULT 0,
  desconto numeric NOT NULL DEFAULT 0,
  vendas numeric NOT NULL DEFAULT 0,
  vendas_com numeric NOT NULL DEFAULT 0,
  vendas_sem numeric NOT NULL DEFAULT 0,
  consentimentos numeric NOT NULL DEFAULT 0,
  uni numeric NOT NULL DEFAULT 0,
  tm numeric NOT NULL DEFAULT 0,
  pa numeric NOT NULL DEFAULT 0,
  pm numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attendances_created_at_idx ON public.attendances (created_at DESC);
CREATE INDEX attendances_sales_rep_id_idx ON public.attendances (sales_rep_id);
CREATE INDEX attendances_open_by_rep_idx
  ON public.attendances (sales_rep_id) WHERE status = 'open';
CREATE INDEX rep_breaks_rep_open_idx
  ON public.rep_breaks (sales_rep_id) WHERE ended_at IS NULL;
CREATE INDEX rep_breaks_started_idx ON public.rep_breaks (started_at DESC);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_to_end_of_queue(_rep_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_pos integer;
  max_pos integer;
  rep_store uuid;
BEGIN
  SELECT queue_position, store_id
    INTO current_pos, rep_store
    FROM public.sales_reps
    WHERE id = _rep_id;

  IF current_pos IS NULL OR rep_store IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(queue_position), 0)
    INTO max_pos
    FROM public.sales_reps
    WHERE active = true AND store_id = rep_store;

  UPDATE public.sales_reps
    SET queue_position = queue_position - 1
    WHERE queue_position > current_pos
      AND active = true
      AND store_id = rep_store;

  UPDATE public.sales_reps
    SET queue_position = max_pos
    WHERE id = _rep_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_store_pin(_store_id uuid, _pin text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores
    WHERE id = _store_id
      AND active = true
      AND pin = _pin
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'operator'::public.app_role)
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin(_username text, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE username = _username
      AND password_hash = extensions.crypt(_password, password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_user(_username text, _password text)
RETURNS TABLE(id uuid, username text, role public.admin_role, store_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT a.id, a.username, a.role, a.store_id
  FROM public.admin_users a
  WHERE a.username = _username
    AND a.password_hash = extensions.crypt(_password, a.password_hash);
$$;

CREATE OR REPLACE FUNCTION public.admin_list(_actor text, _actor_password text)
RETURNS TABLE(
  id uuid,
  username text,
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
    SELECT a.id, a.username, a.role, a.store_id, a.created_at, a.updated_at
    FROM public.admin_users a
    ORDER BY a.username;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create(
  _actor text,
  _actor_password text,
  _username text,
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

  IF _username IS NULL OR length(trim(_username)) = 0 THEN
    RAISE EXCEPTION 'username required';
  END IF;

  IF _password IS NULL OR length(_password) < 4 THEN
    RAISE EXCEPTION 'password too short';
  END IF;

  INSERT INTO public.admin_users (username, password_hash, role, store_id)
  VALUES (
    trim(_username),
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
  _new_username text,
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

  IF _new_username IS NOT NULL AND length(trim(_new_username)) > 0 THEN
    UPDATE public.admin_users
      SET username = trim(_new_username)
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
  target_username text;
  total integer;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT username INTO target_username
    FROM public.admin_users
    WHERE id = _id;

  IF target_username IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF target_username = _actor THEN
    RAISE EXCEPTION 'cannot delete own user';
  END IF;

  SELECT count(*) INTO total FROM public.admin_users;

  IF total <= 1 THEN
    RAISE EXCEPTION 'must keep at least one admin';
  END IF;

  DELETE FROM public.admin_users WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_commission_import(
  _actor text,
  _actor_password text,
  _store_id uuid,
  _month integer,
  _year integer,
  _meta numeric,
  _config jsonb,
  _rows jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor_role public.admin_role;
  actor_store uuid;
  imp_id uuid;
  existing_closed timestamptz;
  r jsonb;
BEGIN
  SELECT role, store_id
    INTO actor_role, actor_store
    FROM public.verify_admin_user(_actor, _actor_password);

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF actor_role = 'gerente' AND actor_store IS DISTINCT FROM _store_id THEN
    RAISE EXCEPTION 'forbidden: outra loja';
  END IF;

  SELECT closed_at INTO existing_closed
    FROM public.commission_imports
    WHERE store_id = _store_id AND month = _month AND year = _year;

  IF existing_closed IS NOT NULL THEN
    RAISE EXCEPTION 'competencia fechada';
  END IF;

  INSERT INTO public.commission_imports (
    store_id,
    month,
    year,
    meta_amount,
    commission_config,
    imported_by
  )
  VALUES (
    _store_id,
    _month,
    _year,
    _meta,
    COALESCE(_config, '{}'::jsonb),
    _actor
  )
  ON CONFLICT (store_id, month, year) DO UPDATE
    SET meta_amount = EXCLUDED.meta_amount,
        commission_config = EXCLUDED.commission_config,
        imported_by = EXCLUDED.imported_by,
        updated_at = now()
  RETURNING id INTO imp_id;

  DELETE FROM public.commission_rows WHERE import_id = imp_id;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) LOOP
    INSERT INTO public.commission_rows (
      import_id,
      nome,
      bruto,
      liquido,
      desc_pct,
      desconto,
      vendas,
      vendas_com,
      vendas_sem,
      consentimentos,
      uni,
      tm,
      pa,
      pm
    )
    VALUES (
      imp_id,
      COALESCE(r->>'nome', ''),
      COALESCE((r->>'bruto')::numeric, 0),
      COALESCE((r->>'liquido')::numeric, 0),
      COALESCE((r->>'descPct')::numeric, 0),
      COALESCE((r->>'desconto')::numeric, 0),
      COALESCE((r->>'vendas')::numeric, 0),
      COALESCE((r->>'vendasCom')::numeric, 0),
      COALESCE((r->>'vendasSem')::numeric, 0),
      COALESCE((r->>'consentimentos')::numeric, 0),
      COALESCE((r->>'uni')::numeric, 0),
      COALESCE((r->>'tm')::numeric, 0),
      COALESCE((r->>'pa')::numeric, 0),
      COALESCE((r->>'pm')::numeric, 0)
    );
  END LOOP;

  RETURN imp_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_commission_import(
  _actor text,
  _actor_password text,
  _import_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor_role public.admin_role;
BEGIN
  SELECT role INTO actor_role
    FROM public.verify_admin_user(_actor, _actor_password);

  IF actor_role IS NULL OR actor_role <> 'admin' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.commission_imports
    SET closed_at = now(), closed_by = _actor
    WHERE id = _import_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_commission_import(
  _actor text,
  _actor_password text,
  _import_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor_role public.admin_role;
BEGIN
  SELECT role INTO actor_role
    FROM public.verify_admin_user(_actor, _actor_password);

  IF actor_role IS NULL OR actor_role <> 'admin' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.commission_imports
    SET closed_at = NULL, closed_by = NULL
    WHERE id = _import_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_commission_import(
  _actor text,
  _actor_password text,
  _import_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor_role public.admin_role;
BEGIN
  SELECT role INTO actor_role
    FROM public.verify_admin_user(_actor, _actor_password);

  IF actor_role IS NULL OR actor_role <> 'admin' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM public.commission_imports WHERE id = _import_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_commission_imports(_actor text, _actor_password text)
RETURNS TABLE(
  id uuid,
  store_id uuid,
  store_name text,
  month integer,
  year integer,
  meta_amount numeric,
  imported_by text,
  updated_at timestamptz,
  closed_at timestamptz,
  closed_by text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role public.admin_role;
  v_store uuid;
BEGIN
  SELECT vau.role, vau.store_id
    INTO v_role, v_store
    FROM public.verify_admin_user(_actor, _actor_password) vau;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
    SELECT
      i.id,
      i.store_id,
      s.name AS store_name,
      i.month,
      i.year,
      i.meta_amount,
      i.imported_by,
      i.updated_at,
      i.closed_at,
      i.closed_by
    FROM public.commission_imports i
    JOIN public.stores s ON s.id = i.store_id
    WHERE v_role = 'admin' OR i.store_id = v_store
    ORDER BY i.year DESC, i.month DESC, s.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_commission_summary(
  _actor text,
  _actor_password text,
  _import_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor_role public.admin_role;
  actor_store uuid;
  imp public.commission_imports%ROWTYPE;
  result jsonb;
BEGIN
  SELECT role, store_id
    INTO actor_role, actor_store
    FROM public.verify_admin_user(_actor, _actor_password);

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO imp
    FROM public.commission_imports
    WHERE id = _import_id;

  IF imp.id IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF actor_role = 'gerente' AND imp.store_id IS DISTINCT FROM actor_store THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'import', jsonb_build_object(
      'id', imp.id,
      'store_id', imp.store_id,
      'month', imp.month,
      'year', imp.year,
      'meta_amount', imp.meta_amount,
      'commission_config', imp.commission_config,
      'imported_by', imp.imported_by,
      'updated_at', imp.updated_at,
      'closed_at', imp.closed_at,
      'closed_by', imp.closed_by
    ),
    'totals', (
      SELECT jsonb_build_object(
        'vendas', COALESCE(SUM(vendas), 0),
        'uni', COALESCE(SUM(uni), 0),
        'cadastros', COALESCE(SUM(vendas_com), 0),
        'consentimentos', COALESCE(SUM(consentimentos), 0),
        'funcionarias', COUNT(*)
      )
      FROM public.commission_rows
      WHERE import_id = imp.id
    ),
    'rows', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'nome', nome,
            'vendas', vendas,
            'uni', uni,
            'tm', tm,
            'pa', pa,
            'pm', pm,
            'vendas_com', vendas_com,
            'consentimentos', consentimentos
          )
          ORDER BY vendas DESC
        ),
        '[]'::jsonb
      )
      FROM public.commission_rows
      WHERE import_id = imp.id
    )
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_commission_full(
  _actor text,
  _actor_password text,
  _import_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor_role public.admin_role;
  imp public.commission_imports%ROWTYPE;
  result jsonb;
BEGIN
  SELECT role INTO actor_role
    FROM public.verify_admin_user(_actor, _actor_password);

  IF actor_role IS NULL OR actor_role <> 'admin' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO imp
    FROM public.commission_imports
    WHERE id = _import_id;

  IF imp.id IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT jsonb_build_object(
    'import', jsonb_build_object(
      'id', imp.id,
      'store_id', imp.store_id,
      'month', imp.month,
      'year', imp.year,
      'meta_amount', imp.meta_amount,
      'commission_config', imp.commission_config,
      'imported_by', imp.imported_by,
      'updated_at', imp.updated_at,
      'closed_at', imp.closed_at,
      'closed_by', imp.closed_by
    ),
    'rows', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'nome', nome,
            'bruto', bruto,
            'liquido', liquido,
            'descPct', desc_pct,
            'desconto', desconto,
            'vendas', vendas,
            'vendasCom', vendas_com,
            'vendasSem', vendas_sem,
            'consentimentos', consentimentos,
            'uni', uni,
            'tm', tm,
            'pa', pa,
            'pm', pm
          )
          ORDER BY liquido DESC
        ),
        '[]'::jsonb
      )
      FROM public.commission_rows
      WHERE import_id = imp.id
    )
  ) INTO result;

  RETURN result;
END;
$$;

CREATE TRIGGER stores_updated_at
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER admin_users_set_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER commission_imports_set_updated_at
BEFORE UPDATE ON public.commission_imports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT ALL ON public.stores TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.stores TO anon, authenticated;
REVOKE SELECT ON public.stores FROM anon, authenticated, public;
GRANT SELECT (id, name, active, created_at, updated_at) ON public.stores TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_reps TO anon, authenticated;
GRANT ALL ON public.sales_reps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_sale_reasons TO anon, authenticated;
GRANT ALL ON public.no_sale_reasons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendances TO anon, authenticated;
GRANT ALL ON public.attendances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_breaks TO anon, authenticated;
GRANT ALL ON public.rep_breaks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_exports TO anon, authenticated;
GRANT ALL ON public.promo_exports TO service_role;
GRANT ALL ON public.admin_users TO service_role;
GRANT ALL ON public.commission_imports TO service_role;
GRANT ALL ON public.commission_rows TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
REVOKE ALL ON FUNCTION public.verify_store_pin(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_store_pin(uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_to_end_of_queue(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.verify_admin(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_admin(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_admin_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_admin_user(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create(text, text, text, text, public.admin_role, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create(text, text, text, text, public.admin_role, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update(text, text, uuid, text, text, public.admin_role, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update(text, text, uuid, text, text, public.admin_role, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete(text, text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.save_commission_import(text, text, uuid, integer, integer, numeric, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.save_commission_import(text, text, uuid, integer, integer, numeric, jsonb, jsonb) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.close_commission_import(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.close_commission_import(text, text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.reopen_commission_import(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reopen_commission_import(text, text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_commission_import(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_commission_import(text, text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.list_commission_imports(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_commission_imports(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_commission_summary(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(text, text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_commission_full(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_commission_full(text, text, uuid) TO anon, authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.no_sale_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rep_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile"
  ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users update own profile"
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "user can read own roles"
  ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "anon read stores"
  ON public.stores
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon insert stores"
  ON public.stores
  FOR INSERT TO anon
  WITH CHECK (length(btrim(name)) > 0 AND length(pin) BETWEEN 4 AND 8);

CREATE POLICY "anon update stores"
  ON public.stores
  FOR UPDATE TO anon
  USING (id IS NOT NULL)
  WITH CHECK (length(btrim(name)) > 0 AND length(pin) BETWEEN 4 AND 8);

CREATE POLICY "anon delete stores"
  ON public.stores
  FOR DELETE TO anon
  USING (id IS NOT NULL);

CREATE POLICY "anon read sales_reps"
  ON public.sales_reps
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon insert sales_reps"
  ON public.sales_reps
  FOR INSERT TO anon
  WITH CHECK (length(btrim(name)) > 0 AND store_id IS NOT NULL);

CREATE POLICY "anon update sales_reps"
  ON public.sales_reps
  FOR UPDATE TO anon
  USING (id IS NOT NULL)
  WITH CHECK (
    status = ANY (ARRAY['available'::text, 'in_service'::text, 'lunch'::text, 'off'::text])
    AND length(btrim(name)) > 0
  );

CREATE POLICY "anon delete sales_reps"
  ON public.sales_reps
  FOR DELETE TO anon
  USING (id IS NOT NULL);

CREATE POLICY "anon read no_sale_reasons"
  ON public.no_sale_reasons
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon insert no_sale_reasons"
  ON public.no_sale_reasons
  FOR INSERT TO anon
  WITH CHECK (length(btrim(label)) > 0);

CREATE POLICY "anon update no_sale_reasons"
  ON public.no_sale_reasons
  FOR UPDATE TO anon
  USING (id IS NOT NULL)
  WITH CHECK (length(btrim(label)) > 0);

CREATE POLICY "anon delete no_sale_reasons"
  ON public.no_sale_reasons
  FOR DELETE TO anon
  USING (id IS NOT NULL);

CREATE POLICY "anon read attendances"
  ON public.attendances
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon insert attendances"
  ON public.attendances
  FOR INSERT TO anon
  WITH CHECK (
    sales_rep_id IS NOT NULL
    AND store_id IS NOT NULL
    AND (
      (status = 'open' AND type IS NULL)
      OR (status = 'closed' AND type IN ('sale', 'no_sale'))
    )
  );

CREATE POLICY "anon update attendances"
  ON public.attendances
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (
    sales_rep_id IS NOT NULL
    AND store_id IS NOT NULL
    AND (
      (status = 'open' AND type IS NULL)
      OR (status = 'closed' AND type IN ('sale', 'no_sale'))
    )
  );

CREATE POLICY "anon read rep_breaks"
  ON public.rep_breaks
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon insert rep_breaks"
  ON public.rep_breaks
  FOR INSERT TO anon
  WITH CHECK (
    break_type = ANY (ARRAY['lunch'::text, 'off'::text])
    AND sales_rep_id IS NOT NULL
  );

CREATE POLICY "anon update rep_breaks"
  ON public.rep_breaks
  FOR UPDATE TO anon
  USING (id IS NOT NULL)
  WITH CHECK (id IS NOT NULL);

CREATE POLICY "anon read promo_exports"
  ON public.promo_exports
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon insert promo_exports"
  ON public.promo_exports
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon delete promo_exports"
  ON public.promo_exports
  FOR DELETE TO anon
  USING (id IS NOT NULL);

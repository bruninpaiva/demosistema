
-- Enum para papéis de administrador
CREATE TYPE public.admin_role AS ENUM ('admin', 'gerente');

-- Tabela admin_users
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role public.admin_role NOT NULL DEFAULT 'admin',
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_users TO service_role;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER admin_users_set_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.admin_users (username, password_hash, role) VALUES
  ('admin',   extensions.crypt('123456', extensions.gen_salt('bf')), 'admin'),
  ('Eduardo', extensions.crypt('1966',   extensions.gen_salt('bf')), 'admin'),
  ('Elisa',   extensions.crypt('1967',   extensions.gen_salt('bf')), 'admin')
ON CONFLICT (username) DO NOTHING;

-- verify_admin: retorna true se usuário/senha bater
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

-- verify_admin_user: retorna id/role/store_id/username
CREATE OR REPLACE FUNCTION public.verify_admin_user(_username text, _password text)
RETURNS TABLE(id uuid, username text, role public.admin_role, store_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT a.id, a.username, a.role, a.store_id
  FROM public.admin_users a
  WHERE a.username = _username
    AND a.password_hash = extensions.crypt(_password, a.password_hash);
$$;
REVOKE ALL ON FUNCTION public.verify_admin_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_admin_user(text, text) TO anon, authenticated;

-- admin_list
CREATE OR REPLACE FUNCTION public.admin_list(_actor text, _actor_password text)
RETURNS TABLE(id uuid, username text, role public.admin_role, store_id uuid, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT a.id, a.username, a.role, a.store_id, a.created_at, a.updated_at
    FROM public.admin_users a ORDER BY a.username;
END; $$;
REVOKE ALL ON FUNCTION public.admin_list(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list(text, text) TO anon, authenticated;

-- admin_create
CREATE OR REPLACE FUNCTION public.admin_create(
  _actor text, _actor_password text, _username text, _password text,
  _role public.admin_role DEFAULT 'admin', _store_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.verify_admin(_actor, _actor_password) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _username IS NULL OR length(trim(_username)) = 0 THEN RAISE EXCEPTION 'username required'; END IF;
  IF _password IS NULL OR length(_password) < 4 THEN RAISE EXCEPTION 'password too short'; END IF;
  INSERT INTO public.admin_users(username, password_hash, role, store_id)
  VALUES (trim(_username), extensions.crypt(_password, extensions.gen_salt('bf')), _role, _store_id)
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;
REVOKE ALL ON FUNCTION public.admin_create(text, text, text, text, public.admin_role, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create(text, text, text, text, public.admin_role, uuid) TO anon, authenticated;

-- admin_update
CREATE OR REPLACE FUNCTION public.admin_update(
  _actor text, _actor_password text, _id uuid,
  _new_username text, _new_password text,
  _new_role public.admin_role DEFAULT NULL, _new_store_id uuid DEFAULT NULL
)
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
  IF _new_role IS NOT NULL THEN
    UPDATE public.admin_users SET role = _new_role WHERE id = _id;
  END IF;
  IF _new_store_id IS NOT NULL THEN
    UPDATE public.admin_users SET store_id = _new_store_id WHERE id = _id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.admin_update(text, text, uuid, text, text, public.admin_role, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update(text, text, uuid, text, text, public.admin_role, uuid) TO anon, authenticated;

-- admin_delete
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

-- promo_exports
CREATE TABLE public.promo_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  file_name text NOT NULL,
  discount integer NOT NULL,
  product_count integer NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  csv_content text NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_exports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_exports TO authenticated;
GRANT ALL ON public.promo_exports TO service_role;

ALTER TABLE public.promo_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read promo_exports" ON public.promo_exports FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert promo_exports" ON public.promo_exports FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon delete promo_exports" ON public.promo_exports FOR DELETE TO anon USING (id IS NOT NULL);

-- commission_imports
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
GRANT ALL ON public.commission_imports TO service_role;
ALTER TABLE public.commission_imports ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER commission_imports_set_updated_at
BEFORE UPDATE ON public.commission_imports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- commission_rows
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
GRANT ALL ON public.commission_rows TO service_role;
ALTER TABLE public.commission_rows ENABLE ROW LEVEL SECURITY;

-- save_commission_import
CREATE OR REPLACE FUNCTION public.save_commission_import(_actor text, _actor_password text, _store_id uuid, _month integer, _year integer, _meta numeric, _config jsonb, _rows jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  actor_role public.admin_role;
  actor_store uuid;
  imp_id uuid;
  existing_closed timestamptz;
  r jsonb;
BEGIN
  SELECT vau.role, vau.store_id INTO actor_role, actor_store
    FROM public.verify_admin_user(_actor, _actor_password) vau;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF actor_role = 'gerente' AND actor_store IS DISTINCT FROM _store_id THEN
    RAISE EXCEPTION 'forbidden: outra loja';
  END IF;

  SELECT closed_at INTO existing_closed
    FROM public.commission_imports
    WHERE store_id = _store_id AND month = _month AND year = _year;
  IF existing_closed IS NOT NULL THEN
    RAISE EXCEPTION 'competencia fechada';
  END IF;

  INSERT INTO public.commission_imports(store_id, month, year, meta_amount, commission_config, imported_by)
  VALUES (_store_id, _month, _year, _meta, COALESCE(_config, '{}'::jsonb), _actor)
  ON CONFLICT (store_id, month, year) DO UPDATE
    SET meta_amount = EXCLUDED.meta_amount,
        commission_config = EXCLUDED.commission_config,
        imported_by = EXCLUDED.imported_by,
        updated_at = now()
  RETURNING id INTO imp_id;

  DELETE FROM public.commission_rows WHERE import_id = imp_id;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) LOOP
    INSERT INTO public.commission_rows(
      import_id, nome, bruto, liquido, desc_pct, desconto,
      vendas, vendas_com, vendas_sem, consentimentos, uni, tm, pa, pm
    ) VALUES (
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
END; $function$;
REVOKE ALL ON FUNCTION public.save_commission_import(text, text, uuid, integer, integer, numeric, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_commission_import(text, text, uuid, integer, integer, numeric, jsonb, jsonb) TO anon, authenticated;

-- close/reopen
CREATE OR REPLACE FUNCTION public.close_commission_import(_actor text, _actor_password text, _import_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE actor_role public.admin_role;
BEGIN
  SELECT vau.role INTO actor_role FROM public.verify_admin_user(_actor, _actor_password) vau;
  IF actor_role IS NULL OR actor_role <> 'admin' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.commission_imports SET closed_at = now(), closed_by = _actor WHERE id = _import_id;
END; $$;
REVOKE ALL ON FUNCTION public.close_commission_import(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_commission_import(text, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reopen_commission_import(_actor text, _actor_password text, _import_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE actor_role public.admin_role;
BEGIN
  SELECT vau.role INTO actor_role FROM public.verify_admin_user(_actor, _actor_password) vau;
  IF actor_role IS NULL OR actor_role <> 'admin' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.commission_imports SET closed_at = NULL, closed_by = NULL WHERE id = _import_id;
END; $$;
REVOKE ALL ON FUNCTION public.reopen_commission_import(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_commission_import(text, text, uuid) TO anon, authenticated;

-- delete_commission_import
CREATE OR REPLACE FUNCTION public.delete_commission_import(_actor text, _actor_password text, _import_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE actor_role public.admin_role;
BEGIN
  SELECT vau.role INTO actor_role FROM public.verify_admin_user(_actor, _actor_password) vau;
  IF actor_role IS NULL OR actor_role <> 'admin' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM public.commission_imports WHERE id = _import_id;
END; $$;
REVOKE ALL ON FUNCTION public.delete_commission_import(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_commission_import(text, text, uuid) TO anon, authenticated;

-- list_commission_imports
CREATE OR REPLACE FUNCTION public.list_commission_imports(_actor text, _actor_password text)
RETURNS TABLE(id uuid, store_id uuid, store_name text, month integer, year integer, meta_amount numeric, imported_by text, updated_at timestamptz, closed_at timestamptz, closed_by text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE v_role public.admin_role; v_store uuid;
BEGIN
  SELECT vau.role, vau.store_id INTO v_role, v_store
    FROM public.verify_admin_user(_actor, _actor_password) vau;
  IF v_role IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT i.id, i.store_id, s.name AS store_name, i.month, i.year,
           i.meta_amount, i.imported_by, i.updated_at, i.closed_at, i.closed_by
    FROM public.commission_imports i
    JOIN public.stores s ON s.id = i.store_id
    WHERE v_role = 'admin' OR i.store_id = v_store
    ORDER BY i.year DESC, i.month DESC, s.name;
END; $function$;
REVOKE ALL ON FUNCTION public.list_commission_imports(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_commission_imports(text, text) TO anon, authenticated;

-- get_commission_summary
CREATE OR REPLACE FUNCTION public.get_commission_summary(_actor text, _actor_password text, _import_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_role public.admin_role; v_store uuid;
  imp public.commission_imports%ROWTYPE;
  result jsonb;
BEGIN
  SELECT vau.role, vau.store_id INTO v_role, v_store
    FROM public.verify_admin_user(_actor, _actor_password) vau;
  IF v_role IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO imp FROM public.commission_imports WHERE id = _import_id;
  IF imp.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF v_role = 'gerente' AND imp.store_id IS DISTINCT FROM v_store THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'import', jsonb_build_object(
      'id', imp.id, 'store_id', imp.store_id, 'month', imp.month, 'year', imp.year,
      'meta_amount', imp.meta_amount, 'commission_config', imp.commission_config,
      'imported_by', imp.imported_by, 'updated_at', imp.updated_at,
      'closed_at', imp.closed_at, 'closed_by', imp.closed_by
    ),
    'totals', (
      SELECT jsonb_build_object(
        'vendas', COALESCE(SUM(vendas),0),
        'uni', COALESCE(SUM(uni),0),
        'cadastros', COALESCE(SUM(vendas_com),0),
        'consentimentos', COALESCE(SUM(consentimentos),0),
        'funcionarias', COUNT(*)
      ) FROM public.commission_rows WHERE import_id = imp.id
    ),
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nome', nome, 'vendas', vendas, 'uni', uni, 'tm', tm, 'pa', pa, 'pm', pm,
        'vendas_com', vendas_com, 'consentimentos', consentimentos
      ) ORDER BY vendas DESC), '[]'::jsonb)
      FROM public.commission_rows WHERE import_id = imp.id
    )
  ) INTO result;
  RETURN result;
END; $function$;
REVOKE ALL ON FUNCTION public.get_commission_summary(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(text, text, uuid) TO anon, authenticated;

-- get_commission_full
CREATE OR REPLACE FUNCTION public.get_commission_full(_actor text, _actor_password text, _import_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  actor_role public.admin_role;
  imp public.commission_imports%ROWTYPE;
  result jsonb;
BEGIN
  SELECT vau.role INTO actor_role FROM public.verify_admin_user(_actor, _actor_password) vau;
  IF actor_role IS NULL OR actor_role <> 'admin' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO imp FROM public.commission_imports WHERE id = _import_id;
  IF imp.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;

  SELECT jsonb_build_object(
    'import', jsonb_build_object(
      'id', imp.id, 'store_id', imp.store_id, 'month', imp.month, 'year', imp.year,
      'meta_amount', imp.meta_amount, 'commission_config', imp.commission_config,
      'imported_by', imp.imported_by, 'updated_at', imp.updated_at,
      'closed_at', imp.closed_at, 'closed_by', imp.closed_by
    ),
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nome', nome, 'bruto', bruto, 'liquido', liquido, 'descPct', desc_pct,
        'desconto', desconto, 'vendas', vendas, 'vendasCom', vendas_com,
        'vendasSem', vendas_sem, 'consentimentos', consentimentos,
        'uni', uni, 'tm', tm, 'pa', pa, 'pm', pm
      ) ORDER BY liquido DESC), '[]'::jsonb)
      FROM public.commission_rows WHERE import_id = imp.id
    )
  ) INTO result;
  RETURN result;
END; $function$;
REVOKE ALL ON FUNCTION public.get_commission_full(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_commission_full(text, text, uuid) TO anon, authenticated;


ALTER TABLE public.commission_imports
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by text;

DROP FUNCTION IF EXISTS public.list_commission_imports(text, text);

CREATE OR REPLACE FUNCTION public.save_commission_import(_actor text, _actor_password text, _store_id uuid, _month integer, _year integer, _meta numeric, _config jsonb, _rows jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor_role public.admin_role;
  actor_store uuid;
  imp_id uuid;
  existing_closed timestamptz;
  r jsonb;
BEGIN
  SELECT role, store_id INTO actor_role, actor_store
    FROM public.verify_admin_user(_actor, _actor_password);
  IF actor_role IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF actor_role = 'gerente' AND actor_store IS DISTINCT FROM _store_id THEN
    RAISE EXCEPTION 'forbidden: outra loja';
  END IF;

  SELECT closed_at INTO existing_closed
    FROM public.commission_imports
    WHERE store_id = _store_id AND month = _month AND year = _year;
  IF existing_closed IS NOT NULL THEN
    RAISE EXCEPTION 'competência fechada';
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

CREATE OR REPLACE FUNCTION public.close_commission_import(_actor text, _actor_password text, _import_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE actor_role public.admin_role;
BEGIN
  SELECT role INTO actor_role FROM public.verify_admin_user(_actor, _actor_password);
  IF actor_role IS NULL OR actor_role <> 'admin' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.commission_imports SET closed_at = now(), closed_by = _actor WHERE id = _import_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.reopen_commission_import(_actor text, _actor_password text, _import_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE actor_role public.admin_role;
BEGIN
  SELECT role INTO actor_role FROM public.verify_admin_user(_actor, _actor_password);
  IF actor_role IS NULL OR actor_role <> 'admin' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.commission_imports SET closed_at = NULL, closed_by = NULL WHERE id = _import_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.list_commission_imports(_actor text, _actor_password text)
 RETURNS TABLE(id uuid, store_id uuid, store_name text, month integer, year integer, meta_amount numeric, imported_by text, updated_at timestamptz, closed_at timestamptz, closed_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE actor_role public.admin_role; actor_store uuid;
BEGIN
  SELECT role, store_id INTO actor_role, actor_store
    FROM public.verify_admin_user(_actor, _actor_password);
  IF actor_role IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT i.id, i.store_id, s.name, i.month, i.year,
           i.meta_amount, i.imported_by, i.updated_at, i.closed_at, i.closed_by
    FROM public.commission_imports i
    JOIN public.stores s ON s.id = i.store_id
    WHERE actor_role = 'admin' OR i.store_id = actor_store
    ORDER BY i.year DESC, i.month DESC, s.name;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_commission_summary(_actor text, _actor_password text, _import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor_role public.admin_role; actor_store uuid;
  imp public.commission_imports%ROWTYPE;
  result jsonb;
BEGIN
  SELECT role, store_id INTO actor_role, actor_store
    FROM public.verify_admin_user(_actor, _actor_password);
  IF actor_role IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO imp FROM public.commission_imports WHERE id = _import_id;
  IF imp.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF actor_role = 'gerente' AND imp.store_id IS DISTINCT FROM actor_store THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_commission_full(_actor text, _actor_password text, _import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor_role public.admin_role;
  imp public.commission_imports%ROWTYPE;
  result jsonb;
BEGIN
  SELECT role INTO actor_role FROM public.verify_admin_user(_actor, _actor_password);
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

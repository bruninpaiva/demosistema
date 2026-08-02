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

REVOKE ALL ON FUNCTION public.get_commission_full(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_commission_full(text, text, uuid) TO anon, authenticated;

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

  IF actor_role IS NULL OR actor_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.commission_imports
     SET closed_at = now(),
         closed_by = _actor
   WHERE id = _import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.close_commission_import(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.close_commission_import(text, text, uuid) TO anon, authenticated;

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

  IF actor_role IS NULL OR actor_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.commission_imports
     SET closed_at = NULL,
         closed_by = NULL
   WHERE id = _import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_commission_import(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reopen_commission_import(text, text, uuid) TO anon, authenticated;

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

  IF actor_role IS NULL OR actor_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM public.commission_imports
   WHERE id = _import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_commission_import(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_commission_import(text, text, uuid) TO anon, authenticated;

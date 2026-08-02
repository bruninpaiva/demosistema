-- Duas correções pequenas, encontradas ao construir o Faturamento/Ticket Médio
-- do Dashboard (Etapa 4.1) a partir de commission_rows, sem mexer em regra de
-- negócio nenhuma: só corrige um bug de visibilidade e adiciona um campo já
-- calculável a uma função que hoje não é usada por nenhuma tela.

-- 1) list_commission_imports tratava qualquer papel != 'admin' como restrito
--    à própria loja — incluindo super_admin, que deveria enxergar tudo, igual
--    admin. Um super_admin nunca via nenhuma competência (nem a de uma loja
--    específica, já que seu store_id é NULL e "store_id = NULL" nunca bate).
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
    WHERE v_role IN ('admin', 'super_admin') OR i.store_id = v_store
    ORDER BY i.year DESC, i.month DESC, s.name;
END;
$$;

-- 2) get_commission_summary não é usada por nenhuma tela hoje — só adiciona
--    "liquido" (faturamento líquido da competência) ao totals já calculado,
--    que o Dashboard precisa e o CommissionTab (que usa get_commission_full,
--    não esta) já expõe por linha.
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
        'funcionarias', COUNT(*),
        'liquido', COALESCE(SUM(liquido), 0)
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

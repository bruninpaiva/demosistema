CREATE OR REPLACE FUNCTION public.list_commission_imports(_actor text, _actor_password text)
 RETURNS TABLE(id uuid, store_id uuid, store_name text, month integer, year integer, meta_amount numeric, imported_by text, updated_at timestamp with time zone, closed_at timestamp with time zone, closed_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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
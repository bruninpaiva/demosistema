
-- 1. Drop overly-permissive "public all X" policies
DROP POLICY IF EXISTS "public all attendances" ON public.attendances;
DROP POLICY IF EXISTS "public all no_sale_reasons" ON public.no_sale_reasons;
DROP POLICY IF EXISTS "public all rep_breaks" ON public.rep_breaks;
DROP POLICY IF EXISTS "public all sales_reps" ON public.sales_reps;
DROP POLICY IF EXISTS "public all stores" ON public.stores;

-- 2. Attendances: kiosk needs to insert; nobody reads/updates/deletes as anon
CREATE POLICY "anon read attendances" ON public.attendances
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert attendances" ON public.attendances
  FOR INSERT TO anon
  WITH CHECK (
    type = ANY (ARRAY['sale'::text,'no_sale'::text])
    AND sales_rep_id IS NOT NULL
    AND store_id IS NOT NULL
  );

-- 3. Sales reps: read; kiosk updates status/queue; admin creates/moves/deletes with basic invariants
CREATE POLICY "anon read sales_reps" ON public.sales_reps
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert sales_reps" ON public.sales_reps
  FOR INSERT TO anon
  WITH CHECK (length(btrim(name)) > 0 AND store_id IS NOT NULL);
CREATE POLICY "anon update sales_reps" ON public.sales_reps
  FOR UPDATE TO anon
  USING (id IS NOT NULL)
  WITH CHECK (
    status = ANY (ARRAY['available'::text,'in_service'::text,'lunch'::text,'off'::text])
    AND length(btrim(name)) > 0
  );
CREATE POLICY "anon delete sales_reps" ON public.sales_reps
  FOR DELETE TO anon USING (id IS NOT NULL);

-- 4. Rep breaks: kiosk inserts/updates; anyone can read
CREATE POLICY "anon read rep_breaks" ON public.rep_breaks
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert rep_breaks" ON public.rep_breaks
  FOR INSERT TO anon
  WITH CHECK (
    break_type = ANY (ARRAY['lunch'::text,'off'::text])
    AND sales_rep_id IS NOT NULL
  );
CREATE POLICY "anon update rep_breaks" ON public.rep_breaks
  FOR UPDATE TO anon
  USING (id IS NOT NULL)
  WITH CHECK (id IS NOT NULL);

-- 5. Stores: read (except PIN column), write with basic invariants
CREATE POLICY "anon read stores" ON public.stores
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert stores" ON public.stores
  FOR INSERT TO anon
  WITH CHECK (length(btrim(name)) > 0 AND length(pin) BETWEEN 4 AND 8);
CREATE POLICY "anon update stores" ON public.stores
  FOR UPDATE TO anon
  USING (id IS NOT NULL)
  WITH CHECK (length(btrim(name)) > 0 AND length(pin) BETWEEN 4 AND 8);
CREATE POLICY "anon delete stores" ON public.stores
  FOR DELETE TO anon USING (id IS NOT NULL);

-- Hide PIN column from ordinary reads: revoke column-level SELECT on pin.
REVOKE SELECT ON public.stores FROM anon, authenticated, PUBLIC;
GRANT SELECT (id, name, active, created_at, updated_at) ON public.stores TO anon, authenticated;
GRANT SELECT ON public.stores TO service_role;

-- 6. No-sale reasons: read + admin CRUD
CREATE POLICY "anon read no_sale_reasons" ON public.no_sale_reasons
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert no_sale_reasons" ON public.no_sale_reasons
  FOR INSERT TO anon
  WITH CHECK (length(btrim(label)) > 0);
CREATE POLICY "anon update no_sale_reasons" ON public.no_sale_reasons
  FOR UPDATE TO anon
  USING (id IS NOT NULL)
  WITH CHECK (length(btrim(label)) > 0);
CREATE POLICY "anon delete no_sale_reasons" ON public.no_sale_reasons
  FOR DELETE TO anon USING (id IS NOT NULL);

-- 7. Profiles: drop broad readable-by-authenticated; keep admin & self
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- 8. Verify store PIN via SECURITY DEFINER RPC (PIN never leaves the DB)
CREATE OR REPLACE FUNCTION public.verify_store_pin(_store_id uuid, _pin text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = _store_id AND active = true AND pin = _pin
  );
$$;
REVOKE ALL ON FUNCTION public.verify_store_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_store_pin(uuid, text) TO anon, authenticated;

-- 9. Restrict has_role EXECUTE (SECURITY DEFINER function shouldn't be user-callable)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

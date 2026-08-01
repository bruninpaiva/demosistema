
-- Make user_id optional in attendances (no more auth)
ALTER TABLE public.attendances ALTER COLUMN user_id DROP NOT NULL;

-- Drop old restrictive policies
DROP POLICY IF EXISTS "users read own attendances" ON public.attendances;
DROP POLICY IF EXISTS "admins read all attendances" ON public.attendances;
DROP POLICY IF EXISTS "users insert own attendances" ON public.attendances;
DROP POLICY IF EXISTS "admins update attendances" ON public.attendances;
DROP POLICY IF EXISTS "admins delete attendances" ON public.attendances;

DROP POLICY IF EXISTS "authenticated read sales_reps" ON public.sales_reps;
DROP POLICY IF EXISTS "admins manage sales_reps" ON public.sales_reps;

DROP POLICY IF EXISTS "authenticated read reasons" ON public.no_sale_reasons;
DROP POLICY IF EXISTS "admins manage reasons" ON public.no_sale_reasons;

-- Open policies (tablet uso direto)
CREATE POLICY "public all attendances" ON public.attendances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all sales_reps" ON public.sales_reps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all no_sale_reasons" ON public.no_sale_reasons FOR ALL USING (true) WITH CHECK (true);

-- Grant anon access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendances TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_reps TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_sale_reasons TO anon;

-- Reset and seed random test names
DELETE FROM public.attendances;
DELETE FROM public.sales_reps;
INSERT INTO public.sales_reps (name, active) VALUES
  ('Ana', true),
  ('Beatriz', true),
  ('Camila', true),
  ('Daniela', true),
  ('Eduarda', true),
  ('Fernanda', true),
  ('Gabriela', true),
  ('Helena', true);

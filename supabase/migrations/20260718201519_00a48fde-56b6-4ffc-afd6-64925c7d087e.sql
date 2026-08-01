
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

-- Sprint 4.4: horario de funcionamento por loja para o motor de alertas.
-- Uma linha por loja/dia. Nao cria usuario, nao toca auth e nao altera dados
-- operacionais existentes.

CREATE TABLE public.store_operating_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open boolean NOT NULL DEFAULT true,
  opens_at time NOT NULL DEFAULT '09:00',
  closes_at time NOT NULL DEFAULT '20:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_operating_hours_store_weekday_key UNIQUE (store_id, weekday),
  CONSTRAINT store_operating_hours_range_check CHECK (opens_at < closes_at)
);

CREATE INDEX store_operating_hours_store_id_idx
  ON public.store_operating_hours(store_id);

CREATE TRIGGER store_operating_hours_set_updated_at
BEFORE UPDATE ON public.store_operating_hours
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.store_operating_hours TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_operating_hours TO anon, authenticated;

ALTER TABLE public.store_operating_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read store_operating_hours"
  ON public.store_operating_hours
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon insert store_operating_hours"
  ON public.store_operating_hours
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon update store_operating_hours"
  ON public.store_operating_hours
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete store_operating_hours"
  ON public.store_operating_hours
  FOR DELETE TO anon
  USING (true);

CREATE POLICY "authenticated read store_operating_hours"
  ON public.store_operating_hours
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated insert store_operating_hours"
  ON public.store_operating_hours
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update store_operating_hours"
  ON public.store_operating_hours
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated delete store_operating_hours"
  ON public.store_operating_hours
  FOR DELETE TO authenticated
  USING (true);

INSERT INTO public.store_operating_hours (store_id, weekday, is_open, opens_at, closes_at)
SELECT s.id, d.weekday, (d.weekday BETWEEN 1 AND 6), '09:00'::time, '20:00'::time
FROM public.stores s
CROSS JOIN generate_series(0, 6) AS d(weekday)
ON CONFLICT (store_id, weekday) DO NOTHING;

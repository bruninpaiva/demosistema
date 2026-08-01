
CREATE TABLE public.rep_breaks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  break_type text NOT NULL CHECK (break_type IN ('lunch','off')),
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_breaks TO anon, authenticated;
GRANT ALL ON public.rep_breaks TO service_role;

ALTER TABLE public.rep_breaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all rep_breaks" ON public.rep_breaks FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX rep_breaks_rep_open_idx ON public.rep_breaks (sales_rep_id) WHERE ended_at IS NULL;
CREATE INDEX rep_breaks_started_idx ON public.rep_breaks (started_at DESC);

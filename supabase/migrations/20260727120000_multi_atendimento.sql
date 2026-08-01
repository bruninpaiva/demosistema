-- Multiple concurrent attendances per sales rep.
-- An attendance now has a lifecycle: 'open' (in progress, outcome unknown)
-- then 'closed' (type = sale/no_sale). A rep can have several 'open' rows
-- at once when she picks up a new customer before closing a previous one.

ALTER TABLE public.attendances ALTER COLUMN type DROP NOT NULL;

ALTER TABLE public.attendances ADD COLUMN status text NOT NULL DEFAULT 'closed' CHECK (status IN ('open','closed'));
ALTER TABLE public.attendances ADD COLUMN closed_at timestamptz;
UPDATE public.attendances SET closed_at = created_at WHERE status = 'closed';

ALTER TABLE public.attendances ADD CONSTRAINT attendances_status_type_chk CHECK (
  (status = 'open' AND type IS NULL) OR (status = 'closed' AND type = ANY (ARRAY['sale','no_sale']))
);

CREATE INDEX attendances_open_by_rep_idx ON public.attendances (sales_rep_id) WHERE status = 'open';

DROP POLICY IF EXISTS "anon insert attendances" ON public.attendances;
CREATE POLICY "anon insert attendances" ON public.attendances FOR INSERT TO anon WITH CHECK (
  sales_rep_id IS NOT NULL AND store_id IS NOT NULL AND (
    (status = 'open' AND type IS NULL) OR (status = 'closed' AND type = ANY (ARRAY['sale','no_sale']))
  )
);

CREATE POLICY "anon update attendances" ON public.attendances FOR UPDATE TO anon USING (status = 'open') WITH CHECK (
  sales_rep_id IS NOT NULL AND store_id IS NOT NULL AND (
    (status = 'open' AND type IS NULL) OR (status = 'closed' AND type = ANY (ARRAY['sale','no_sale']))
  )
);

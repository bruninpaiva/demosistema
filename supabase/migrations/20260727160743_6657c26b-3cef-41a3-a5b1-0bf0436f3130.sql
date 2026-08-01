
-- Allow type to be null while attendance is open
ALTER TABLE public.attendances ALTER COLUMN type DROP NOT NULL;

-- Add status + closed_at
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Backfill existing rows: they were all closed sales/no_sale
UPDATE public.attendances SET closed_at = created_at WHERE closed_at IS NULL;

-- Constrain status values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendances_status_check') THEN
    ALTER TABLE public.attendances
      ADD CONSTRAINT attendances_status_check CHECK (status IN ('open','closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendances_type_when_closed_check') THEN
    ALTER TABLE public.attendances
      ADD CONSTRAINT attendances_type_when_closed_check
      CHECK (status = 'open' OR (status = 'closed' AND type IN ('sale','no_sale')));
  END IF;
END$$;

-- Index for fast lookup of open attendances per rep
CREATE INDEX IF NOT EXISTS attendances_open_by_rep_idx
  ON public.attendances(sales_rep_id) WHERE status = 'open';

-- Replace RLS policies to allow the open->closed flow
DROP POLICY IF EXISTS "anon insert attendances" ON public.attendances;
CREATE POLICY "anon insert attendances" ON public.attendances
  FOR INSERT TO anon
  WITH CHECK (
    sales_rep_id IS NOT NULL
    AND store_id IS NOT NULL
    AND (
      (status = 'open'   AND type IS NULL) OR
      (status = 'closed' AND type IN ('sale','no_sale'))
    )
  );

DROP POLICY IF EXISTS "anon update attendances" ON public.attendances;
CREATE POLICY "anon update attendances" ON public.attendances
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (
    sales_rep_id IS NOT NULL
    AND store_id IS NOT NULL
    AND (
      (status = 'open'   AND type IS NULL) OR
      (status = 'closed' AND type IN ('sale','no_sale'))
    )
  );

GRANT UPDATE ON public.attendances TO anon;

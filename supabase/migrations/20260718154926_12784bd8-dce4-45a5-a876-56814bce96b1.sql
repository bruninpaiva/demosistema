
-- 1) STORES table
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO anon, authenticated;
GRANT ALL ON public.stores TO service_role;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all stores" ON public.stores FOR ALL USING (true) WITH CHECK (true);

-- 2) Add store_id to sales_reps and attendances
ALTER TABLE public.sales_reps ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.attendances ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

-- 3) Seed 5 stores with random 4-digit PINs
INSERT INTO public.stores (name, pin) VALUES
  ('Lupo Sp Market Sport',       lpad((floor(random()*10000))::int::text, 4, '0')),
  ('Lupo Shopping Mais',         lpad((floor(random()*10000))::int::text, 4, '0')),
  ('Lupo Shopping Light',        lpad((floor(random()*10000))::int::text, 4, '0')),
  ('Lupo Shopping Nações Unidas',lpad((floor(random()*10000))::int::text, 4, '0')),
  ('Lupo Alameda Lorena',        lpad((floor(random()*10000))::int::text, 4, '0'));

-- 4) Attach existing sales_reps to the first store
UPDATE public.sales_reps
SET store_id = (SELECT id FROM public.stores ORDER BY created_at ASC LIMIT 1)
WHERE store_id IS NULL;

-- 5) Rewrite queue function to be scoped per store
CREATE OR REPLACE FUNCTION public.send_to_end_of_queue(_rep_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  current_pos integer;
  max_pos integer;
  rep_store uuid;
BEGIN
  SELECT queue_position, store_id INTO current_pos, rep_store
  FROM public.sales_reps WHERE id = _rep_id;
  IF current_pos IS NULL OR rep_store IS NULL THEN RETURN; END IF;

  SELECT COALESCE(MAX(queue_position), 0) INTO max_pos
  FROM public.sales_reps WHERE active = true AND store_id = rep_store;

  UPDATE public.sales_reps
    SET queue_position = queue_position - 1
    WHERE queue_position > current_pos
      AND active = true
      AND store_id = rep_store;

  UPDATE public.sales_reps SET queue_position = max_pos WHERE id = _rep_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.send_to_end_of_queue(uuid) TO anon, authenticated;

-- 6) Updated_at trigger for stores
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

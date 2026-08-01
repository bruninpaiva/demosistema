
ALTER TABLE public.sales_reps
  ADD COLUMN IF NOT EXISTS queue_position integer;

-- Inicializa posições da fila pela ordem alfabética atual
WITH ord AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
  FROM public.sales_reps
)
UPDATE public.sales_reps s
SET queue_position = ord.rn
FROM ord
WHERE s.id = ord.id AND s.queue_position IS NULL;

-- Função: envia uma vendedora para o fim da fila (compactando as demais)
CREATE OR REPLACE FUNCTION public.send_to_end_of_queue(_rep_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_pos integer;
  max_pos integer;
BEGIN
  SELECT queue_position INTO current_pos FROM public.sales_reps WHERE id = _rep_id;
  IF current_pos IS NULL THEN RETURN; END IF;

  SELECT COALESCE(MAX(queue_position), 0) INTO max_pos FROM public.sales_reps WHERE active = true;

  -- Compacta: todas com posição maior sobem 1
  UPDATE public.sales_reps
    SET queue_position = queue_position - 1
    WHERE queue_position > current_pos AND active = true;

  -- Vai para o final
  UPDATE public.sales_reps SET queue_position = max_pos WHERE id = _rep_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_to_end_of_queue(uuid) TO anon, authenticated;


WITH ranked AS (
  SELECT id, store_id,
    ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at, id) AS rn
  FROM public.sales_reps
  WHERE queue_position IS NULL AND active = true
)
UPDATE public.sales_reps s
SET queue_position = COALESCE(
  (SELECT MAX(queue_position) FROM public.sales_reps WHERE store_id = s.store_id AND active = true AND queue_position IS NOT NULL), 0
) + r.rn
FROM ranked r
WHERE s.id = r.id;

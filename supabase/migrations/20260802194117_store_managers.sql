-- Sprint 4.3: gerente de loja como contato administrativo opcional.
-- Nao cria login, convite, senha ou permissao nova; apenas desacopla o
-- responsavel administrativo da tabela de usuarios administradores.

CREATE TABLE public.store_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  phone text NULL,
  email text NULL,
  active boolean NOT NULL DEFAULT true,
  user_id uuid NULL REFERENCES public.admin_users(id) ON DELETE SET NULL,
  access_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stores
  ADD COLUMN manager_id uuid NULL REFERENCES public.store_managers(id) ON DELETE SET NULL;

CREATE INDEX store_managers_active_name_idx
  ON public.store_managers(active, name);

CREATE INDEX stores_manager_id_idx
  ON public.stores(manager_id);

CREATE TRIGGER store_managers_set_updated_at
BEFORE UPDATE ON public.store_managers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.store_managers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_managers TO anon, authenticated;
GRANT SELECT (manager_id) ON public.stores TO anon, authenticated;

ALTER TABLE public.store_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read store_managers"
  ON public.store_managers
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon insert store_managers"
  ON public.store_managers
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon update store_managers"
  ON public.store_managers
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon delete store_managers"
  ON public.store_managers
  FOR DELETE TO anon
  USING (true);

CREATE POLICY "authenticated read store_managers"
  ON public.store_managers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated insert store_managers"
  ON public.store_managers
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update store_managers"
  ON public.store_managers
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated delete store_managers"
  ON public.store_managers
  FOR DELETE TO authenticated
  USING (true);

-- Compatibilidade: se ja existirem usuarios administrativos com papel gerente
-- e loja vinculada, preserva a informacao como contato administrativo. O acesso
-- futuro permanece explicitamente desativado.
WITH migrated AS (
  INSERT INTO public.store_managers (name, phone, email, active, user_id, access_enabled)
  SELECT DISTINCT ON (au.store_id)
    au.name,
    NULL::text,
    au.email,
    au.active,
    au.id,
    false
  FROM public.admin_users au
  WHERE au.role = 'gerente'
    AND au.store_id IS NOT NULL
  ORDER BY au.store_id, au.created_at
  RETURNING id, user_id
)
UPDATE public.stores s
SET manager_id = m.id
FROM migrated m
JOIN public.admin_users au ON au.id = m.user_id
WHERE s.id = au.store_id
  AND s.manager_id IS NULL;

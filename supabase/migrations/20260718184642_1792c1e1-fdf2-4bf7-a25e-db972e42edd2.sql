
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'operator');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- Stores
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stores TO service_role;
GRANT SELECT (id, name, active, created_at, updated_at) ON public.stores TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stores TO anon, authenticated;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read stores" ON public.stores FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert stores" ON public.stores FOR INSERT TO anon WITH CHECK (length(btrim(name)) > 0 AND length(pin) BETWEEN 4 AND 8);
CREATE POLICY "anon update stores" ON public.stores FOR UPDATE TO anon USING (id IS NOT NULL) WITH CHECK (length(btrim(name)) > 0 AND length(pin) BETWEEN 4 AND 8);
CREATE POLICY "anon delete stores" ON public.stores FOR DELETE TO anon USING (id IS NOT NULL);

-- Sales reps
CREATE TABLE public.sales_reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  queue_position integer,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','lunch','off','in_service'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_reps TO anon, authenticated;
GRANT ALL ON public.sales_reps TO service_role;
ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read sales_reps" ON public.sales_reps FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert sales_reps" ON public.sales_reps FOR INSERT TO anon WITH CHECK (length(btrim(name)) > 0 AND store_id IS NOT NULL);
CREATE POLICY "anon update sales_reps" ON public.sales_reps FOR UPDATE TO anon USING (id IS NOT NULL) WITH CHECK (status = ANY (ARRAY['available'::text,'in_service'::text,'lunch'::text,'off'::text]) AND length(btrim(name)) > 0);
CREATE POLICY "anon delete sales_reps" ON public.sales_reps FOR DELETE TO anon USING (id IS NOT NULL);

-- No-sale reasons
CREATE TABLE public.no_sale_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  is_other BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_sale_reasons TO anon, authenticated;
GRANT ALL ON public.no_sale_reasons TO service_role;
ALTER TABLE public.no_sale_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read no_sale_reasons" ON public.no_sale_reasons FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert no_sale_reasons" ON public.no_sale_reasons FOR INSERT TO anon WITH CHECK (length(btrim(label)) > 0);
CREATE POLICY "anon update no_sale_reasons" ON public.no_sale_reasons FOR UPDATE TO anon USING (id IS NOT NULL) WITH CHECK (length(btrim(label)) > 0);
CREATE POLICY "anon delete no_sale_reasons" ON public.no_sale_reasons FOR DELETE TO anon USING (id IS NOT NULL);

INSERT INTO public.no_sale_reasons (label, sort_order, is_other) VALUES
  ('Não encontrou tamanho', 1, false),
  ('Não encontrou cor', 2, false),
  ('Não gostou do modelo', 3, false),
  ('Achou caro', 4, false),
  ('Vai pensar', 5, false),
  ('Vai pesquisar em outra loja', 6, false),
  ('Apenas estava olhando', 7, false),
  ('Cliente com pressa', 8, false),
  ('Produto indisponível', 9, false),
  ('Não encontrou o que procurava', 10, false),
  ('Preferiu comprar online', 11, false),
  ('Estava acompanhando outra pessoa', 12, false),
  ('Troca / devolução', 13, false),
  ('Outro', 99, true);

-- Attendances
CREATE TABLE public.attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sales_rep_id UUID NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale','no_sale')),
  amount NUMERIC(10,2),
  notes TEXT,
  reason_id UUID REFERENCES public.no_sale_reasons(id),
  reason_other_text TEXT,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL
);
CREATE INDEX ON public.attendances (created_at DESC);
CREATE INDEX ON public.attendances (sales_rep_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendances TO anon, authenticated;
GRANT ALL ON public.attendances TO service_role;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read attendances" ON public.attendances FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert attendances" ON public.attendances FOR INSERT TO anon WITH CHECK (type = ANY (ARRAY['sale'::text,'no_sale'::text]) AND sales_rep_id IS NOT NULL AND store_id IS NOT NULL);

-- Rep breaks
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
CREATE POLICY "anon read rep_breaks" ON public.rep_breaks FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert rep_breaks" ON public.rep_breaks FOR INSERT TO anon WITH CHECK (break_type = ANY (ARRAY['lunch'::text,'off'::text]) AND sales_rep_id IS NOT NULL);
CREATE POLICY "anon update rep_breaks" ON public.rep_breaks FOR UPDATE TO anon USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);
CREATE INDEX rep_breaks_rep_open_idx ON public.rep_breaks (sales_rep_id) WHERE ended_at IS NULL;
CREATE INDEX rep_breaks_started_idx ON public.rep_breaks (started_at DESC);

-- Functions
CREATE OR REPLACE FUNCTION public.send_to_end_of_queue(_rep_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  current_pos integer;
  max_pos integer;
  rep_store uuid;
BEGIN
  SELECT queue_position, store_id INTO current_pos, rep_store FROM public.sales_reps WHERE id = _rep_id;
  IF current_pos IS NULL OR rep_store IS NULL THEN RETURN; END IF;
  SELECT COALESCE(MAX(queue_position), 0) INTO max_pos FROM public.sales_reps WHERE active = true AND store_id = rep_store;
  UPDATE public.sales_reps SET queue_position = queue_position - 1 WHERE queue_position > current_pos AND active = true AND store_id = rep_store;
  UPDATE public.sales_reps SET queue_position = max_pos WHERE id = _rep_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_to_end_of_queue(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_store_pin(_store_id uuid, _pin text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = _store_id AND active = true AND pin = _pin);
$$;
REVOKE ALL ON FUNCTION public.verify_store_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_store_pin(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)), COALESCE(NEW.raw_user_meta_data->>'full_name', '')) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'operator'::public.app_role)) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed stores + reps
INSERT INTO public.stores (name, pin) VALUES
  ('Lupo Sp Market Sport',       lpad((floor(random()*10000))::int::text, 4, '0')),
  ('Lupo Shopping Mais',         lpad((floor(random()*10000))::int::text, 4, '0')),
  ('Lupo Shopping Light',        lpad((floor(random()*10000))::int::text, 4, '0')),
  ('Lupo Shopping Nações Unidas',lpad((floor(random()*10000))::int::text, 4, '0')),
  ('Lupo Alameda Lorena',        lpad((floor(random()*10000))::int::text, 4, '0'));

INSERT INTO public.sales_reps (name, active, store_id, queue_position)
SELECT n.name, true, s.id, n.rn
FROM (SELECT id FROM public.stores ORDER BY created_at ASC LIMIT 1) s,
     (VALUES ('Ana',1),('Beatriz',2),('Camila',3),('Daniela',4),('Eduarda',5),('Fernanda',6),('Gabriela',7),('Helena',8)) AS n(name,rn);

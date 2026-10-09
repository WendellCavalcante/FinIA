-- FinIA — Esquema PostgreSQL (Supabase) com Row Level Security
-- Execute no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

create type papel_membro   as enum ('gestor', 'operacional');
create type escopo_conta   as enum ('CNPJ', 'CPF');
create type tipo_transacao as enum ('entrada', 'saida');
create type status_transacao as enum ('pago', 'pendente', 'agendado');

-- Empresas / contas (um usuário pode ter CNPJ e CPF)
create table empresas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  documento  text,                       -- CNPJ ou CPF
  escopo     escopo_conta not null default 'CNPJ',
  criado_em  timestamptz not null default now()
);

-- Perfis (ligados ao auth.users do Supabase)
create table usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  whatsapp   text,
  criado_em  timestamptz not null default now()
);

-- Multi-usuário: quem acessa qual empresa e com qual papel
create table membros (
  empresa_id uuid references empresas(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete cascade,
  papel      papel_membro not null default 'operacional',
  primary key (empresa_id, usuario_id)
);

create table transacoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  criado_por  uuid not null default auth.uid() references usuarios(id),
  tipo        tipo_transacao not null,
  status      status_transacao not null default 'pago',
  descricao   text not null,
  categoria   text not null default 'Outros',
  contraparte text,
  valor       numeric(14,2) not null check (valor > 0),
  data        date not null,                 -- data de pagamento/vencimento
  origem      text default 'texto',          -- texto | voz | foto | pix | dda
  anexo_url   text,
  confianca_ia numeric(3,2),                 -- 0..1, retornado pelo motor de IA
  criado_em   timestamptz not null default now()
);
create index on transacoes (empresa_id, data);

-- Agendamentos / débitos vinculados (DDA, boletos, recorrências)
create table agendamentos_calendario (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  transacao_id uuid references transacoes(id) on delete set null,
  titulo       text not null,
  vencimento   date not null,
  valor        numeric(14,2),
  fonte        text default 'manual',        -- manual | dda | recorrencia
  codigo_barras text,
  criado_em    timestamptz not null default now()
);

-- Cobranças PIX
create table cobrancas_pix (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  transacao_id uuid references transacoes(id) on delete cascade,
  cliente      text not null,
  valor        numeric(14,2) not null,
  vencimento   date not null,
  txid         text unique not null,
  payload      text not null,                -- PIX copia-e-cola
  pago_em      timestamptz
);

-- Cor do calendário calculada no banco (mesma regra do front-end)
create view vw_calendario with (security_invoker = true) as
select t.*,
  case
    when t.status = 'pago' and t.tipo = 'entrada' then 'verde'
    when t.status = 'pago' and t.tipo = 'saida'   then 'vermelho'
    when t.status = 'agendado'                    then 'azul'
    when t.data <= current_date + 15              then 'amarelo'
    else 'azul'
  end as cor
from transacoes t;

-- Quando a cobrança PIX é paga: amarelo -> verde automaticamente
create or replace function fn_pix_pago() returns trigger language plpgsql as $$
begin
  if new.pago_em is not null and old.pago_em is null and new.transacao_id is not null then
    update transacoes set status = 'pago' where id = new.transacao_id;
  end if;
  return new;
end $$;
create trigger trg_pix_pago after update on cobrancas_pix
for each row execute function fn_pix_pago();

-- ---------- Row Level Security ----------
create or replace function sou_membro(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where empresa_id = eid and usuario_id = auth.uid());
$$;
create or replace function sou_gestor(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where empresa_id = eid and usuario_id = auth.uid() and papel = 'gestor');
$$;

alter table empresas                enable row level security;
alter table usuarios                enable row level security;
alter table membros                 enable row level security;
alter table transacoes              enable row level security;
alter table agendamentos_calendario enable row level security;
alter table cobrancas_pix           enable row level security;

create policy "perfil próprio"        on usuarios for all using (id = auth.uid()) with check (id = auth.uid());
create policy "ver minhas empresas"   on empresas for select using (sou_membro(id));
create policy "ver meus vínculos"     on membros  for select using (usuario_id = auth.uid() or sou_gestor(empresa_id));
create policy "gestor gere vínculos"  on membros  for all    using (sou_gestor(empresa_id)) with check (sou_gestor(empresa_id));

-- Gestor: acesso total. Operacional: só INSERE e vê o que ele mesmo enviou.
create policy "gestor total"          on transacoes for all    using (sou_gestor(empresa_id)) with check (sou_gestor(empresa_id));
create policy "operacional insere"    on transacoes for insert with check (sou_membro(empresa_id) and criado_por = auth.uid());
create policy "operacional vê o seu"  on transacoes for select using (sou_membro(empresa_id) and criado_por = auth.uid());

create policy "gestor agendamentos"   on agendamentos_calendario for all using (sou_gestor(empresa_id)) with check (sou_gestor(empresa_id));
create policy "gestor cobranças"      on cobrancas_pix            for all using (sou_gestor(empresa_id)) with check (sou_gestor(empresa_id));

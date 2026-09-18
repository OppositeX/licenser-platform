-- Scoped API tokens + audit trail for the CNVS vending surface.
-- The token is a least-privilege bearer credential the CNVS side registers;
-- the licenser holds the service role and does the work. Every write is
-- audited. RLS forced — service-role only.

create table if not exists public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  token_hash   text not null unique,            -- sha256(raw token), hex
  prefix       text not null,                   -- first chars of the raw token, for display
  scopes       text[] not null default '{}',    -- e.g. settings:read, license:write, credits:grant
  active       boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_tokens_active_idx on public.api_tokens (active);
alter table public.api_tokens enable row level security;
alter table public.api_tokens force row level security;

create table if not exists public.api_audit (
  id           uuid primary key default gen_random_uuid(),
  token_id     uuid references public.api_tokens(id) on delete set null,
  token_prefix text,
  tool         text not null,
  scope        text,
  dry_run      boolean not null default false,
  args         jsonb,
  ok           boolean not null default true,
  status       int,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists api_audit_created_idx on public.api_audit (created_at desc);
create index if not exists api_audit_token_idx   on public.api_audit (token_id, created_at desc);
alter table public.api_audit enable row level security;
alter table public.api_audit force row level security;

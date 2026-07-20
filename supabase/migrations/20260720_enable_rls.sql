-- Enable Row Level Security on every application table. Additive + idempotent.
--
-- Why this is safe today:
--   * All API routes and every /admin data read go through the Supabase
--     SERVICE-ROLE client (lib/supabase/service.ts). The service role BYPASSES
--     RLS entirely, so enabling RLS does not change any server code path.
--   * The anon / authenticated browser clients are used ONLY for Supabase Auth
--     (login, session), never to read these tables directly.
--
-- Effect: with RLS enabled and NO permissive policies, the anon and
-- authenticated roles can no longer read or write these tables even if the
-- anon key leaks. This is the belt-and-suspenders layer TAKEOVER.md flagged
-- as the outstanding P1.
--
-- If a future feature needs the browser (anon/authenticated) to read a table
-- directly, add a scoped policy in a LATER migration — do not disable RLS.

do $$
declare
  t text;
  tables text[] := array[
    'admins','products','plans','licenses','activations','product_releases',
    'events','validation_log','license_overrides','feedback','logs','settings',
    'webhook_deliveries','plan_woo_variations'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security;', t);
      -- FORCE so the table owner is subject to RLS too; service_role still bypasses.
      execute format('alter table public.%I force row level security;', t);
    end if;
  end loop;
end $$;

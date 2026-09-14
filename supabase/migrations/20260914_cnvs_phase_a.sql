-- CNVS Phase A — settings audit, deployment beacons, service status, incidents.
-- Additive + idempotent, in the style of the earlier migrations.
--
-- Backs four endpoints that cnvs-4 polls but that did not exist:
--   GET  /api/v2/cnvs/settings       (PRC-007 / PRC-008) — pricing, from the store
--   POST /api/v2/beacons             (DET-001)           — deployment beacons
--   GET  /api/v2/status                                  — service status
--   GET  /api/v2/incidents/unresolved                    — open incidents

-- ---------------------------------------------------------------------------
-- 1. settings_audit — who changed what, for every settings write.
--    public.settings only carries updated_at/updated_by (who + when, not what).
--    Pricing changes need the before/after, so they get their own trail.
-- ---------------------------------------------------------------------------
create table if not exists public.settings_audit (
  id          bigserial primary key,
  key         text not null,
  old_value   jsonb,
  new_value   jsonb,
  changed_by  text,
  changed_at  timestamptz not null default now()
);
create index if not exists settings_audit_key_idx     on public.settings_audit (key, changed_at desc);
create index if not exists settings_audit_changed_idx on public.settings_audit (changed_at desc);

-- ---------------------------------------------------------------------------
-- 2. cnvs.* pricing rows.
--    These seed values match the v1 defaults cnvs-4 compiles in, so the first
--    response after this migration is identical to what the product already
--    serves. From here they are editable at /admin/cnvs with no CNVS deploy —
--    which is the entire point of the endpoint.
--    `on conflict do nothing` so re-running never stomps an admin's prices.
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('cnvs.plans', '{
     "pro":    { "monthlyUsd": 15, "annualUsd": 12, "minSeats": 1 },
     "studio": { "monthlyUsd": 25, "annualUsd": 20, "minSeats": 2 }
   }'::jsonb),
  ('cnvs.credits', '{
     "perSeat": { "pro": 500, "studio": 1000 },
     "freeDaily": 20,
     "rolloverMonths": 1
   }'::jsonb),
  ('cnvs.rate_card', '[
     { "action": "agent_edit_fast",  "label": "Agent edit, fast model",         "route": "/api/ai/agent",       "credits": 1, "paidCredits": 0 },
     { "action": "agent_edit_pro",   "label": "Agent edit, pro model",          "route": "/api/ai/agent",       "credits": 6 },
     { "action": "image_1080",       "label": "Image, 1080p",                   "route": "/api/ai/image",       "credits": 10 },
     { "action": "image_to_3d",      "label": "Image to 3D, textured",          "route": "/api/3d/generate",    "credits": 100 },
     { "action": "rig_repose",       "label": "Auto-rig, repose first",         "route": "/api/3d/rig",         "credits": 40 },
     { "action": "animation_clip",   "label": "Animation clip, each",           "route": "/api/3d/rig",         "credits": 15 },
     { "action": "world_draft",      "label": "World, draft",                   "route": "/api/world/generate", "credits": 40 },
     { "action": "world_full",       "label": "World, full quality",            "route": "/api/world/generate", "credits": 300 },
     { "action": "hero_video",       "label": "Hero video, 8 s, one aspect",    "route": "/api/ai/video",       "credits": 240 },
     { "action": "hero_video_pair",  "label": "Hero video pair, 16:9 and 9:16", "route": "/api/ai/video",       "credits": 480 },
     { "action": "template_restyle", "label": "Restyle a template with your own product", "route": "bundle",    "credits": 150 },
     { "action": "doctrine_tool",    "label": "Doctrine tool call",             "route": "hosted MCP",          "credits": 6 }
   ]'::jsonb),
  ('cnvs.packs', '[
     { "sku": "cnvs-credits-1k",   "credits": 1000,   "usd": 10,  "recurring": false },
     { "sku": "cnvs-credits-5k",   "credits": 5000,   "usd": 45,  "recurring": false },
     { "sku": "cnvs-credits-20k",  "credits": 20000,  "usd": 160, "recurring": false },
     { "sku": "cnvs-credits-100k", "credits": 100000, "usd": 700, "recurring": false }
   ]'::jsonb),
  ('cnvs.dev',         '{ "lifetimeDays": 7, "bootsPerDay": 500, "ipsPerDay": 25 }'::jsonb),
  ('cnvs.grace_days',  '14'::jsonb),
  ('cnvs.fair_use',    '{ "fastEditsPerDay": 300 }'::jsonb),
  ('cnvs.entitlement', '{ "prodTtlHours": 24, "graceHours": 72 }'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. cnvs_beacons — deployment beacons posted by CNVS runtimes (DET-001).
--    The full body is kept in `payload`; the columns are a best-effort
--    projection for indexing and the admin list. Nothing about the request is
--    required, so an unexpected body shape is recorded rather than dropped.
-- ---------------------------------------------------------------------------
create table if not exists public.cnvs_beacons (
  id             uuid primary key default gen_random_uuid(),
  received_at    timestamptz not null default now(),
  deployment_id  text,
  project        text,
  environment    text,
  runtime        text,
  version        text,
  commit_sha     text,
  url            text,
  region         text,
  event          text,
  status         text,
  license_key_prefix text,
  license_id     uuid references public.licenses(id) on delete set null,
  fingerprint    text,
  ip             text,
  user_agent     text,
  payload        jsonb not null default '{}'::jsonb
);
create index if not exists cnvs_beacons_received_idx    on public.cnvs_beacons (received_at desc);
create index if not exists cnvs_beacons_deployment_idx  on public.cnvs_beacons (deployment_id, received_at desc) where deployment_id is not null;
create index if not exists cnvs_beacons_project_idx     on public.cnvs_beacons (project, received_at desc)       where project is not null;
create index if not exists cnvs_beacons_environment_idx on public.cnvs_beacons (environment, received_at desc)   where environment is not null;
create index if not exists cnvs_beacons_license_idx     on public.cnvs_beacons (license_id, received_at desc)    where license_id is not null;

-- ---------------------------------------------------------------------------
-- 4. service_components — the rows behind GET /api/v2/status.
--    Seeded from the surfaces the rate card already names, plus licensing.
--    Editable at /admin/cnvs/status; `position` drives display order.
-- ---------------------------------------------------------------------------
create table if not exists public.service_components (
  key         text primary key,
  name        text not null,
  description text,
  status      text not null default 'operational'
    check (status in ('operational','degraded','partial_outage','major_outage','maintenance')),
  position    int  not null default 100,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

insert into public.service_components (key, name, description, position) values
  ('licensing', 'Licensing & entitlements', 'License validation and entitlement issuance', 10),
  ('ai_agent',  'Agent edits',              'Fast and pro model agent edits',              20),
  ('ai_image',  'Image generation',         '1080p image generation',                      30),
  ('three_d',   '3D generation & rigging',  'Image to 3D, auto-rig, animation clips',      40),
  ('world',     'World generation',         'Draft and full-quality worlds',               50),
  ('ai_video',  'Video generation',         'Hero video rendering',                        60),
  ('doctrine',  'Doctrine tools',           'Hosted MCP doctrine tool calls',              70)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. incidents — rows behind GET /api/v2/incidents/unresolved.
--    "Unresolved" means status <> 'resolved' and resolved_at is null.
-- ---------------------------------------------------------------------------
create table if not exists public.incidents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  status      text not null default 'investigating'
    check (status in ('investigating','identified','monitoring','resolved')),
  impact      text not null default 'minor'
    check (impact in ('none','minor','major','critical')),
  components  text[] not null default '{}',
  started_at  timestamptz not null default now(),
  resolved_at timestamptz,
  created_by  text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists incidents_started_idx on public.incidents (started_at desc);
-- Partial index matching the /unresolved query exactly.
create index if not exists incidents_unresolved_idx on public.incidents (started_at desc)
  where resolved_at is null and status <> 'resolved';

-- ---------------------------------------------------------------------------
-- 6. RLS — same posture as 20260720_enable_rls.sql. Every read and write goes
--    through the service-role client, which bypasses RLS; enabling it with no
--    permissive policies means a leaked anon key still reads nothing.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array['settings_audit','cnvs_beacons','service_components','incidents'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security;', t);
      execute format('alter table public.%I force row level security;', t);
    end if;
  end loop;
end $$;

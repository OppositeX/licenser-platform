-- Release channels + rollback. Additive + idempotent.
--   channel: which track a release belongs to (stable / beta / rc)
--   yanked:  a pulled release is never served to any client (rollback lever)
alter table public.product_releases
  add column if not exists channel text not null default 'stable'
    check (channel in ('stable','beta','rc')),
  add column if not exists yanked boolean not null default false;

create index if not exists releases_channel_idx
  on public.product_releases (product_id, channel, yanked);

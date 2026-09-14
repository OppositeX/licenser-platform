# Handoff — CNVS Phase A (licenser side)

**Branch:** `claude/cnvs-phase-a-endpoints` (off `main` @ `f6613b7`)
**Commits:** `fcfea03` (feature) · `641e345` (byte-length fix)
**Date:** 2026-09-14 · **Status:** complete on the branch, **not merged, not live**

---

## 1. The job, and where it stands

CNVS (cnvs-4-marketing.vercel.app) sells licences but could not charge a
licenser-managed price for an AI generation: the four `/api/v2` paths cnvs-4
polls all returned 404, so every price the CNVS editor quotes and debits is a
hardcoded fallback compiled into cnvs-4.

All four are built, tested and pushed:

| Endpoint | Method | Cache-Control | Ticket |
|---|---|---|---|
| `/api/v2/cnvs/settings` | GET | `public, max-age=300` | PRC-007 / PRC-008 |
| `/api/v2/beacons` | POST | `no-store` | DET-001 |
| `/api/v2/status` | GET | `public, max-age=60` | — |
| `/api/v2/incidents/unresolved` | GET | `public, max-age=60` | — |

`/api/v2/validate` was **not** touched (it already worked — 405 to GET).

### ⚠️ Still 404 on `licenser.gloo.ooo`

That domain serves **production, which deploys from `main`**. The work is on a
feature branch and no PR was opened (the brief said not to). **Nothing reaches
CNVS until this branch merges to `main`.** That is the single remaining step to
close the original definition of done.

---

## 2. What was verified, and how

Verification used the branch's **Vercel preview deployment**, which carries the
real `SUPABASE_SERVICE_ROLE_KEY`. Preview URLs sit behind Vercel SSO (302), so:

```bash
# Get a share token out of the redirect, redeem it once for a bypass cookie:
#   mcp__vercel__web_fetch_vercel_url <preview-url>   → read `_vercel_share=…` from `location`
B="https://licenser-platform-git-claude-cnvs-phase-a-endpoints-otwdesign.vercel.app"
curl -s -L -c /tmp/cj.txt -o /dev/null "$B/api/v2/cnvs/settings?_vercel_share=<TOKEN>"
curl -s -b /tmp/cj.txt "$B/api/v2/cnvs/settings?cb=$(date +%s)"   # cb= busts the CDN cache
```

Results against the **real database**:

- `settings` → 200, `source: "store"` (reading rows, not constants), all 8
  sections, 12 rate-card actions, `cache-control: public, max-age=300`.
- `status` → 200, 7 components read from `service_components`.
- `incidents/unresolved` → 200, `{ok:true,incidents:[],count:0}`.
- `beacons` → 202, `{ok:true,id:"…",stored:true}`; row confirmed in
  `cnvs_beacons` with every column projected and the raw payload intact.
- **Round-trip:** set `cnvs.grace_days` 14→30 in the store → endpoint returned
  `graceDays: 30` with a bumped `updated_at` → reverted to 14. This is the
  proof that a price change reaches CNVS with no CNVS deploy.

All verification rows were cleaned up afterwards: `settings_audit`,
`cnvs_beacons` and `incidents` are all at 0 rows; `cnvs.grace_days` is back to
`14` with `updated_by = null`.

Local gates: `npx tsc --noEmit` clean · `npx vitest run` 90/90 · `next build`
clean, all four routes + three admin pages registered.

---

## 3. Database — already applied

Migration `supabase/migrations/20260914_cnvs_phase_a.sql` is **applied to the
live licenser project** (`iyseueyttklbcghtwohk`, eu-west-1) via the Supabase
MCP. It is additive and idempotent. Do not re-apply blindly; it is safe if you
do (`create … if not exists`, `on conflict (key) do nothing`).

| Table | Purpose |
|---|---|
| `settings_audit` | before/after/who for every settings write |
| `cnvs_beacons` | deployment beacons; full body in `payload` |
| `service_components` | 7 seeded rows behind `/api/v2/status` |
| `incidents` | rows behind `/api/v2/incidents/unresolved` |

Plus 8 `cnvs.*` rows seeded into the existing `public.settings`. All four new
tables have **forced RLS with no policies**, matching `20260720_enable_rls.sql`
— every read/write goes through the service-role client, which bypasses RLS.

`tests/cnvs-migration-seed.test.ts` parses the migration's seeded JSON and
asserts it equals the code defaults, so the two copies cannot silently drift.

---

## 4. The contract — read before touching the settings endpoint

cnvs-4 (`apps/marketing/lib/cnvs-settings.ts`) validates our payload before any
of it can price a click. **On any violation it discards the response entirely**,
serves its own defaults and reports `degraded: true, reason: "invalid-payload"`.

That failure mode is the thing to design against: a bad payload **looks healthy
from our side** (200, valid JSON) and changes nothing in the product. The six
rules, all enforced in `lib/cnvs/settings.ts` and covered case-by-case in
`tests/cnvs-settings.test.ts` (38 cases):

1. A 200 must carry prices — bare `{ok:true}` is rejected as `empty-payload`.
2. `rateCard` must price **all twelve** actions by exact `action` string. A
   partial card, a duplicate, or an unknown action fails the whole card.
3. `credits` / `paidCredits` must be non-negative **integers** — not strings,
   floats or null. (`paidCredits` is optional; the rule applies when present.)
4. No action above `100000` credits (1 credit = 1 cent → $1,000 per click).
5. `plans.*.monthlyUsd`/`annualUsd` and `packs[].usd`/`credits` positive;
   `minSeats`, `credits.perSeat.*`, `credits.freeDaily` non-negative.
6. Omitting a key is safe (cnvs-4 falls back per key); malformed is not.

**Three layers defend this** — keep all three if you refactor:

- `writeCnvsSections()` validates **before** storing, so a bad price is
  rejected at `/admin/cnvs` rather than served.
- `buildCnvsSettings()` degrades **per section** — one malformed row costs that
  section's prices, not the whole response — and logs the fault.
- The route re-validates the assembled payload before responding, falling back
  to defaults if anything slipped through.

A test feeds garbage for all eight keys and asserts the output still validates.

---

## 5. Open items

### a. Merge to `main` — blocks everything
Nothing is live until then. No PR was opened per the brief.

### b. Beacon body shape is UNCONFIRMED ← most likely to need rework
The brief said to read the cnvs-4 caller before designing the table. **I could
not.** `GLOO-ooo/cnvs-4` is outside the session's repo scope and `add_repo`
refused it:

> `cross-tier adds are not supported in v1: requested "gloo-ooo/cnvs-4" but
> session already has repos from owner(s) [oppositex]`

Workaround for the next session: **start the session with `GLOO-ooo/cnvs-4` as
the initial source**, then add `oppositex/licenser-platform`.

The field names in `lib/cnvs/beacons.ts` are therefore educated guesses across
camel/snake/nested variants. The design makes that survivable — the whole body
is stored verbatim in `cnvs_beacons.payload`, columns are a best-effort
projection, so a wrong guess costs a null column, never a dropped beacon, and
is fixed **in that one file with no migration**. Confirm against the caller and
tighten `FIELD_ALIASES`.

Also unverified for the same reason: whether cnvs-4 expects a specific response
shape from `/api/v2/beacons` (we return `202 {ok,id,stored}`), and whether it
expects specific shapes from `/status` and `/incidents/unresolved` — those two
were designed to a sensible convention, not to a read contract.

### c. `CRON_SECRET` is unset on Vercel
`/api/cron/renewal-reminders` runs unguarded — anyone who finds the path can
trigger it. **Deliberately not failed closed:** doing so while the var is
missing would silently stop the daily renewal emails, which is worse. Exposure
is bounded because the route already skips any license reminded inside its
7-day window, so repeat calls cannot spam customers. Each unguarded run now
logs a warning to `logs` (channel `cron`).

It is an env var — it cannot be set from the repo, and the Vercel MCP does not
expose env vars. Steps are in `.env.example`; summary:

```bash
openssl rand -hex 32
vercel env add CRON_SECRET production   # paste it
vercel --prod                            # redeploy so functions pick it up
curl -s -o /dev/null -w '%{http_code}\n' https://licenser.gloo.ooo/api/cron/renewal-reminders  # expect 401
```

Only **after** that returns 401, optionally flip the guard to fail closed in
`app/api/cron/renewal-reminders/route.ts`:
`if (secret && …)` → `if (!secret || …)`, and delete the `if (!secret)` warning
block below it.

### d. LIC-318 / LIC-319 / LIC-320 — cannot be located
Searched exhaustively: zero GitHub issues on the repo, no PRs, no commit
messages, no file references, nothing in `git grep` across all branches.
`LIC-317` is the highest ticket referenced anywhere. **Ask Omri where the
tracker lives** — these cannot be reported on from the repo alone.

---

## 6. Map of the code

```
lib/cnvs/settings.ts   Types, the twelve actions, defaults, the six-rule
                       validators, buildCnvsSettings() assembly. No I/O.
lib/cnvs/store.ts      Reads/writes cnvs.* rows + settings_audit. Fail-soft
                       reads (DB down → defaults, source:'fallback').
lib/cnvs/beacons.ts    Body normalisation + license-key redaction. ← see 5b
lib/cnvs/status.ts     Component/incident reads, rollUpStatus(), publicIncident()
lib/cnvs/http.ts       Shared CORS + Cache-Control helpers for the v2 routes

app/api/v2/cnvs/settings/route.ts
app/api/v2/beacons/route.ts
app/api/v2/status/route.ts
app/api/v2/incidents/unresolved/route.ts

app/admin/cnvs/page.tsx          Pricing editor + change history
app/admin/cnvs/actions.ts        Server actions (validate → write → audit)
app/admin/cnvs/beacons/page.tsx  Beacon list with raw payloads
app/admin/cnvs/status/page.tsx   Components + incidents
app/admin/cnvs/status/actions.ts
```

Every file carries a header comment explaining *why* it is shaped that way —
read those before refactoring.

### Decisions worth not undoing

- **Prices live in the store, not in constants.** The constants in
  `lib/cnvs/settings.ts` are the fallback for a missing/malformed row only.
  Re-introducing a second set of hardcoded prices defeats the whole endpoint.
- **Beacons answer 202 even when storage fails** (`stored:false`, fault logged).
  A CNVS deploy must never fail on our storage.
- **License keys are never stored in `cnvs_beacons`** — reduced to the 8-char
  prefix (matching `licenses.key_prefix = substr(key,1,8)`), including inside
  the raw payload.
- **`status` / `incidents` answer 200 with `stale: true` on a read failure**, so
  a caller can tell "no incidents" from "we couldn't look".
- **Metadata (`ok`, `updated_at`, `source`) stays outside `settings`**, which
  carries exactly the documented keys and nothing else.

---

## 7. Environment notes for the next session

- **`SUPABASE_SERVICE_ROLE_KEY` is not available to sessions** (by design —
  the Supabase MCP will not return it). A local server run with the anon key
  reads nothing through forced RLS, which exercises the fallback paths but not
  the store path. Use the Supabase MCP for DB work, and the preview deployment
  (§2) for true end-to-end checks.
- Supabase MCP project id: `iyseueyttklbcghtwohk`.
- Vercel project `prj_bydb2KivuiLZ1FrFUvlXRfVRloK7`, team
  `team_R4vYUVawA1B8qCitPPEmniD2`.
- The `licenser` MCP server failed to connect at session start
  (`CONNECTION_CLOSED`) — unrelated to this work, but worth a retry if needed.

## 8. Suggested next steps, in order

1. Merge `claude/cnvs-phase-a-endpoints` → `main`; confirm the four endpoints
   answer 200 on `licenser.gloo.ooo`.
2. Point cnvs-4 at `https://licenser.gloo.ooo/api/v2/cnvs/settings` and confirm
   it reports `degraded: false`.
3. Start a session rooted at `GLOO-ooo/cnvs-4`, read the beacon caller, tighten
   `FIELD_ALIASES` (§5b).
4. Set `CRON_SECRET` (§5c).
5. Chase LIC-318/319/320 with Omri (§5d).
6. Have Omri change one price at `/admin/cnvs` and watch it land in CNVS —
   the acceptance test that matters.

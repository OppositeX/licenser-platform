# Licenser Platform

Self-hosted license + update delivery for the Gloo plugin ecosystem. Replaces the WP install at `licenser.d3v.co.il`.

- **Live:** https://licenser-platform-otwdesign.vercel.app
- **Stack:** Next.js 14 (app router) · Supabase (Postgres + Auth) · Vercel
- **Status:** scaffold only — coming-soon landing. Full port tracked in kanban as LIC-204 + LIC-207.

## Local dev

```
npm install
cp .env.example .env.local   # add Supabase URL + anon key + service role
npm run dev
```

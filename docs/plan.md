# Opt-in usage stats for Foundry packages

## Why

INVESTIGATOR is installed on people's own Foundry servers, so there's no way
to know which versions are in use, which presets people play, which Foundry
versions to keep supporting, or which modules it needs to get along with.
Forge's bazaar gives a single install figure, and that's all.

This is a small, **opt-in**, open service for collecting that, built so that
"is this spying?" has a short and convincing answer. It's written for any of
our Foundry packages, not just INVESTIGATOR.

Of the 42 most-installed systems on the Forge (October 2026), one collects
usage stats (The One Ring 2e: a world ID, versions, timezone and language,
on every GM load, with no opt-out). Asking first, showing exactly what's
sent, and publishing what's collected puts us well ahead of that.

## Principles

- **Off until the GM says yes.** Nothing is sent before then.
- **Show the payload.** The opt-in dialog has a button which shows the exact
  JSON that would be sent.
- **No personal data.** A random install ID, created at opt-in, not Foundry's
  world ID or title. No IP addresses are stored. Country (from Cloudflare)
  is the only thing derived from the IP, and the dialog says so.
- **Only public modules.** The module list is part of the report, but the
  server only keeps modules listed in Foundry's public package index, so the
  names of private or unreleased modules are never stored.
- **Opting out stops the reports.** The install ID is kept, so a world which
  opts back in carries on where it left off; a "reset" button makes a new
  one. We keep raw rows for a fixed time (13 months), then only weekly totals.
- **Open.** The code and this document are public.

## Shape

```
Foundry (GM's browser)
   │  POST /v1/report  (once per world per day)
   ▼
ingest Worker ── ingest.<domain>, public
   │  writes
   ▼
D1 database ◄── daily cron: weekly roll-ups, retention
   ▲  reads
   │
dashboard Worker ── stats.<domain>, behind Cloudflare Access
   └─ serves the dashboard app and its JSON API
```

Two Workers sharing one D1 database. The public one only accepts one payload
shape and writes it; nothing that reads data is reachable without Access.

### Ingest Worker

- `POST /v1/report`, body JSON, any origin (Foundry runs on anyone's
  domain), no credentials. The client sends it as `text/plain`, so browsers
  don't need a CORS preflight; `OPTIONS` is answered anyway.
- Rejects bodies over 64 KB, anything that doesn't match the schema, and
  package IDs not in its `PACKAGE_IDS` list.
- Rate limited per IP address with a Workers rate limiting binding. The IP is
  used as the limiter's key and nowhere else.
- One row per package, install and day: a later report the same day replaces
  the earlier one (including its settings and modules), so repeated or
  flooded reports mostly overwrite themselves.
- It can't be secured against fake reports: anything in the client is public.
  The defences above keep the damage small.

### Dashboard Worker

- Behind a Cloudflare Access application on its hostname (free for up to 50
  users; log in with a one-time PIN or GitHub).
- Also verifies the `Cf-Access-Jwt-Assertion` header itself, against the
  team's public keys, so a routing mistake can't expose it.
- `workers_dev` and preview URLs are off in both Workers, so they can't be
  reached at `*.workers.dev`, around Access.
- Runs before its static assets (`run_worker_first`), so the app's files are
  behind the same check.
- A small JSON API (fixed SQL queries, no query language exposed) and a
  Vite + React app with the charts.

### Data

D1 (SQLite) rather than Workers Analytics Engine, which keeps data for about
three months and samples at volume: version adoption over years is the point.

- `reports`: package, install ID, day (UTC), package version, Foundry
  version, language, user count, country.
- `report_settings`: key/value pairs the package chooses to report (for
  INVESTIGATOR: the preset and theme, its rules switches, and which lists
  differ from the preset). At most 64, short strings, numbers or booleans.
- `report_modules`: active module IDs and versions, only for modules in
  `public_modules`.
- `public_modules`: the module IDs in Foundry's public package index
  (`index-latest.json`), refreshed daily by its own cron trigger. Until it's
  first filled, no modules are kept.
- `weekly_counts`: for each package, week and dimension (package version,
  Foundry version, language, country, each setting, each module), how many
  installs reported each value. An install counts once per week, with what it
  last reported that week.

A daily cron rebuilds the weekly counts for the last two weeks, and deletes
raw rows older than `RAW_RETENTION_DAYS` (400). The dashboard reads the
weekly counts.

### The report (schema version 1)

```json
{
  "schemaVersion": 1,
  "installId": "kq7Xb2c9TzRf1mWd8sLp4a",
  "package": { "id": "investigator", "version": "10.130" },
  "foundry": { "version": "14.367" },
  "language": "en",
  "userCount": 5,
  "settings": { "preset": "pathOfCthulhuPreset", "useMwStyleAbilities": false },
  "modules": [{ "id": "dice-so-nice", "version": "5.2.1" }]
}
```

`modules` is optional, so a package can leave it out. The schema lives in
`packages/schema` (valibot), with a small client helper for building and
sending reports, so the packages and the Worker can't drift apart.

## The Foundry side (in each package, not this repo)

- A world setting, off by default, and a one-off dialog for the GM after an
  update: "Share anonymous usage stats", "No thanks", "Ask me later", with a
  "Show exactly what would be sent" button.
- The install ID is created when the GM first opts in, and kept if they opt
  out, so opting back in carries on with it. A "reset" button in settings
  makes a new one.
- Sent once per world per day, from the GM's client after `ready`, with a
  short timeout. Failures are ignored, and nothing is logged unless debugging
  is on.

## Dashboard charts

- Active installs per week.
- Version adoption over time (stacked area).
- Presets and other settings in use.
- Foundry versions in use (when can we drop an old one?).
- Languages (which translations are used?).
- Countries.
- The modules most often used alongside the package, and their versions.

## Not yet decided

- Whether to also publish a public page of aggregate numbers.

## Cost

Everything should fit in Cloudflare's free tiers at our scale: Workers
requests, D1 storage and writes, and Access for up to 50 users.

# fvtt-telemetry

Opt-in, anonymous usage stats for Foundry VTT packages, on Cloudflare Workers.
See [docs/plan.md](docs/plan.md) for what's collected, why, and how it's kept
private.

## What's here

| Path                | What                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| `packages/schema`   | The report format (valibot), and helpers for packages to build and send reports  |
| `workers/ingest`    | The public endpoint, `POST /v1/report`, plus the daily roll-up and retention job |
| `workers/dashboard` | The dashboard (Vite + React) and its JSON API, behind Cloudflare Access          |
| `migrations`        | The D1 schema, shared by both Workers                                            |

## Commands

- `pnpm check` runs typecheck, tests, lint, format check and build.
- `pnpm --filter fvtt-telemetry-dashboard seed:local` fills the dashboard's
  local D1 with made-up data, then `pnpm --filter fvtt-telemetry-dashboard dev`
  serves it on http://localhost:8787. Put `DEV_SKIP_ACCESS=true` in
  `workers/dashboard/.dev.vars` first: it skips the Access check for requests
  from this machine only.
- Wrangler leaves a process holding its output open, so pipe its output to a
  file rather than to `tail` or `head`, or the pipe never closes.

## Setting it up on Cloudflare

Nothing here has been deployed yet. To do it:

1. `wrangler d1 create fvtt-telemetry`, and put the database ID in both
   `wrangler.jsonc` files.
2. `wrangler d1 migrations apply fvtt-telemetry --remote` (from either Worker's
   folder).
3. Pick two hostnames on a zone in the account, e.g. `ingest.<domain>` and
   `stats.<domain>`, and put them in the `routes` of each `wrangler.jsonc`.
4. In Zero Trust, add a self-hosted Access application for the dashboard's
   hostname, with a policy allowing just you (email one-time PIN or GitHub).
   Put the team domain (`<team>.cloudflareaccess.com`) and the application's
   AUD tag in the dashboard's `vars`.
5. `pnpm --filter fvtt-telemetry-ingest deploy` and
   `pnpm --filter fvtt-telemetry-dashboard deploy`.
6. Check the dashboard says "Forbidden" without logging in, and that
   `curl -X POST https://ingest.<domain>/v1/report -d '{}'` gets a 400.

`workers_dev` and `preview_urls` are off in both Workers, so they're only
reachable on those hostnames. Observability and Logpush are off too, so no
request logs (with IP addresses) are kept.

## Sending reports from a package

```ts
import {
  createInstallId,
  isReportDue,
  utcDay,
  type ReportV1,
} from "@lumphammer/fvtt-telemetry-schema";
import { sendReport } from "@lumphammer/fvtt-telemetry-schema/client";
```

Only once the GM has opted in: keep the install ID and the last day sent in
world settings, and once a day (`isReportDue`), from the GM's client after
`ready`, build a `ReportV1` and `sendReport` it to
`https://ingest.<domain>/v1/report`. Add the package's ID to the ingest
Worker's `PACKAGE_IDS`. The plan describes the opt-in dialog.

The schema package isn't published yet; publish it to npm (or copy it in)
when the first package starts sending.

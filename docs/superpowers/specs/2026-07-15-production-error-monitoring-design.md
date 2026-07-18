# Production Error Monitoring Design

## Goal

Make InkFirst production failures traceable across generation, Supabase Storage, linework persistence, and downloads without recording secrets, payment payloads, emails, prompts, or signed URLs.

## Architecture

Create a provider-neutral `monitoring-core.mjs` module. Every monitored request receives a `requestId`; server code reports structured events through a single allowlisted interface. Events are always written as one-line JSON to Vercel Runtime Logs and are optionally forwarded to `ERROR_MONITOR_WEBHOOK_URL` when configured.

The monitoring path must never break the product path. Webhook delivery is best effort, has a short timeout, and suppresses its own failures after writing a local warning.

## Event Shape

Every error event contains:

- `timestamp`
- `level: "error"`
- `service: "inkfirst"`
- `environment`
- `release`
- `event`
- `stage`
- `route`
- `requestId`
- `generationId` when known
- `ownerRef`, a deterministic hash of the internal owner ID
- `provider`
- `providerPredictionId` when Replicate returned one
- `errorName`
- `errorMessage`, length-limited and scrubbed
- `statusCode`
- `durationMs`
- `retryable`

No arbitrary context properties are accepted. This prevents accidental leakage from request bodies or provider responses.

## Privacy Rules

Never record:

- API keys, cookies, authorization headers, Supabase service keys, or webhook signatures
- email addresses or billing addresses
- full Creem payloads or payment details
- full prompts or user ideas
- signed or private image URLs
- raw request or response bodies

Internal user and anonymous client IDs are converted to `ownerRef` with SHA-256 before leaving business code. Error messages are scrubbed for bearer tokens, common secret query parameters, email addresses, and URL query strings.

## Instrumented Failures

### Concept generation

Report provider failures and route exceptions with `requestId`, owner reference, Replicate prediction ID, route, duration, and HTTP status.

### Storage and persistence

Report Concept upload, generation asset persistence, verification, Linework upload, and Linework verification failures with generation and provider IDs. Credits remain unchanged when persistence fails.

### Linework

Report provider failures separately from Storage or database failures so retry guidance can distinguish them.

### Downloads

Report only server failures (`status >= 500`). Expected user errors such as missing permissions or invalid parameters remain normal responses and do not create production alerts.

## Delivery

Default delivery is JSON through `console.error`, which Vercel Runtime Logs can search. Optional delivery uses:

- `ERROR_MONITOR_WEBHOOK_URL`
- `ERROR_MONITOR_WEBHOOK_TOKEN`
- `ERROR_MONITOR_TIMEOUT_MS`, default `1500`

The token is sent only as an authorization header and is never included in event JSON.

## Verification

Automated tests must prove:

- context is allowlisted and user IDs are hashed
- secrets, emails, prompts, and signed URL query strings are scrubbed
- Webhook failures do not replace the original business error
- Concept, Linework, Storage, and Download code paths call the monitor
- API responses include `X-Request-Id`
- existing regression and production builds continue to pass

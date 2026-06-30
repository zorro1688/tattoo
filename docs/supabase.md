# Supabase setup

This project is still using `data/inkfirst-store.json` for local MVP testing. The production path is to move users, generation history, credits, payment events, and image files to Supabase.

## Files added in this phase

- `supabase/schema.sql` is the reviewed schema draft.
- `.env.example` now includes Supabase environment variables.
- This document explains how the schema maps to the current InkFirst app.

The Supabase CLI is installed as a project dev dependency. The reviewed schema has been copied into:

```text
supabase/migrations/20260616075450_initial_inkfirst_schema.sql
```

Keep `supabase/schema.sql` as the readable source draft and keep the migration file in sync when the schema changes.

## Environment variables

Frontend-safe:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Server-only:

```text
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=inkfirst-designs
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code. Use it only in server routes for trusted operations such as webhook processing, anonymous quota updates, and image uploads.

## Database model

`auth.users`

- Managed by Supabase Auth.
- `profiles.id` references `auth.users(id)`.

`profiles`

- Public profile row for authenticated users.
- Users can read and update only their own row through RLS.

`anonymous_clients`

- Replacement for the current anonymous cookie JSON client record.
- Keeps the current MVP viable before login exists.
- No client-side RLS policies are granted; server code should use the service role.

`user_entitlements`

- Authenticated account credits and download permissions.
- Stores `free_credits_remaining`, `paid_credits_remaining`, `high_resolution_downloads_unlocked`, and the active billing plan.

`generations`

- Saved tattoo generation record.
- Supports either `owner_user_id` for authenticated accounts or `anonymous_client_id` for the current cookie-based flow.
- Stores prompt, input fields, provider, model, status, and placement note.

`generation_assets`

- One row per generated file: concept, linework, or placement.
- Stores either Supabase Storage path or a temporary provider URL during migration.
- The long-term target is `storage_path`, not Replicate-hosted URLs.

`credit_events`

- Append-only credit and entitlement ledger.
- Creem webhook processing should write one row with `source = 'creem'`, `external_event_id`, plan, credits, and `high_resolution_unlocked = true`.

`billing_events`

- Raw payment event audit log.
- Store Creem payloads here before or after credit processing so webhook retries are traceable.

## Storage

The schema creates a private `inkfirst-designs` bucket.

Recommended path format:

```text
{user_id}/{generation_id}/concept.webp
{user_id}/{generation_id}/linework.webp
{user_id}/{generation_id}/placement.svg
```

For anonymous users, upload through server routes with the service role and store paths on `generation_assets`. After login, migrate anonymous generations to a real `owner_user_id`.

## RLS policy approach

All public tables in the schema have RLS enabled.

Authenticated users can:

- Read their own `profiles`.
- Update their own `profiles`.
- Read their own `user_entitlements`.
- Read their own `generations`.
- Read assets that belong to their own generations.
- Read their own `credit_events`.
- Read and manage Storage objects under their own `{auth.uid()}` folder.

Server-only operations:

- Anonymous quota creation and mutation.
- Generation inserts and updates.
- Billing webhook inserts and credit grants.
- Writing `high_resolution_downloads_unlocked`.
- Uploading files for anonymous users.

## Migration order

1. Create a Supabase project.
2. Add the environment variables to `.env.local`.
3. Link the local project to your Supabase project.
4. Apply `supabase/migrations/20260616075450_initial_inkfirst_schema.sql` to a local or staging database.
5. Run Supabase advisors and fix any security warnings.
6. Add a database store module in the app that mirrors the current `quota-store.mjs` API.
7. Switch API routes from JSON store to Supabase behind an environment flag.
8. Upload generated images to `inkfirst-designs` and save `generation_assets.storage_path`.

## Current implementation boundary

This phase prepares the database layer. It does not yet replace `quota-store.mjs`, add login UI, or upload generated images to Supabase Storage.

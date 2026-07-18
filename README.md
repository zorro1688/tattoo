# InkFirst

InkFirst is an AI tattoo generator landing page for first-time tattoo users and people who need tattoo ideas before talking to an artist.

## What is included now

- SEO-focused homepage targeting `AI Tattoo Generator`.
- Top navigation with generator, how-it-works, styles, pricing, FAQ, and CTA anchors.
- Tattoo idea input, style, placement, size, and complexity controls.
- Collapsed advanced prompt preview.
- Concept / linework toggle.
- Placement preview with placement-specific guidance.
- How It Works, Use Cases, Styles, Pricing, FAQ, and Footer sections.
- Tattoo artist brief for discussing the idea offline.
- Server-side anonymous free-generation quota.
- Local JSON generation history for MVP testing.
- Supabase schema draft for production database migration.
- Downloadable concept notes.
- Mock generation API plus a Replicate provider path for real concept image generation.
- Checkout-ready pricing buttons.
- Static no-dependency preview for immediate local testing.

## Run locally

The static homepage works without installing packages:

```bash
npm run dev:static
```

Open:

```text
http://localhost:3000
```

Checkout placeholder endpoint:

```text
http://localhost:3000/api/billing/checkout?plan=pro
```

Creem webhook endpoint:

```text
POST http://localhost:3000/api/webhooks/creem
```

After Creem redirects back to:

```text
/?checkout=success&plan=creator-pack#pricing
```

the homepage refreshes quota, shows a payment success message, and removes the checkout query from the URL.

Generation endpoint:

```text
POST http://localhost:3000/api/generate
```

Quota endpoint:

```text
GET http://localhost:3000/api/quota
```

Generation history endpoint:

```text
GET http://localhost:3000/api/generations?limit=6
```

The generation provider defaults to `mock` with `mock-static-assets`, so the product flow works locally without an image API key.
Set `GENERATION_PROVIDER=replicate` and `REPLICATE_API_TOKEN` in `.env.local` to generate a real concept image through Replicate. Linework and placement preview still use the existing static examples for now.
Set `REPLICATE_LINEWORK_MODEL=black-forest-labs/flux-canny-pro` to generate linework from the saved concept image. Creating linework consumes one generation credit.
Successful generations are saved to `data/inkfirst-store.json` by default. This file is ignored by git. The production Supabase schema draft lives in `supabase/schema.sql`; setup notes are in `docs/supabase.md`.
The `/my-designs` page reads the same store to show the current visitor's recent tattoo designs.

## Environment

Copy `.env.example` to `.env.local` when moving to the production Next.js version:

```text

## Generation quality evaluation

The fixed benchmark covers animals, plants, lettering, and geometric designs. It checks image decoding, dimensions, dark backgrounds, likely canvas clipping, duplicate candidates, and whether each four-candidate batch contains at least one automated-pass result.

Evaluate an existing manifest without spending Replicate balance:

```bash
npm run eval:quality -- --manifest path/to/quality-manifest.json
```

A manifest contains `benchmarkVersion` and a `runs` array. Each run supplies `caseId`, `category`, `input`, and four local or HTTP(S) candidate image references. Reports are written to `quality-reports/` as JSON and Markdown.

Run the fixed benchmark through the live provider only when you intend to spend Replicate balance:

```bash
GENERATION_PROVIDER=replicate npm run eval:quality -- --generate
```

Use `--limit 1` for a low-cost smoke test before running all twelve cases:

```bash
GENERATION_PROVIDER=replicate npm run eval:quality -- --generate --limit 1
```

Set `REPLICATE_API_TOKEN` in the environment before using `--generate`. The evaluator never writes tokens or signed URL query strings into reports. Anatomy, unrequested elements, tattoo usability, and Concept/Linework consistency remain explicit manual review fields.

Run the offline quality tests with `npm run test:quality`.
PAYMENT_PROVIDER=creem
CREEM_API_KEY=
CREEM_CREATOR_PACK_PRODUCT_ID=
CREEM_PRO_MONTHLY_PRODUCT_ID=
CREEM_PRO_YEARLY_PRODUCT_ID=
CREEM_PRO_PRODUCT_ID=
CREEM_WEBHOOK_SECRET=
GENERATION_PROVIDER=mock
GENERATION_MODEL=mock-static-assets
REPLICATE_API_TOKEN=
# Use when GENERATION_PROVIDER=replicate:
# GENERATION_MODEL=black-forest-labs/flux-schnell
REPLICATE_LINEWORK_MODEL=black-forest-labs/flux-canny-pro
OPENAI_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=inkfirst-designs
# Optional local-only store path:
# INKFIRST_STORE_PATH=data/inkfirst-store.json
```

For Replicate local testing:

```text
GENERATION_PROVIDER=replicate
REPLICATE_API_TOKEN=your_replicate_token
# Optional. If omitted or left as mock-static-assets, the server uses black-forest-labs/flux-schnell.
GENERATION_MODEL=black-forest-labs/flux-schnell
REPLICATE_LINEWORK_MODEL=black-forest-labs/flux-canny-pro
```

Provider smoke test:

```bash
npm run test:billing
npm run test:generate
npm run test:quota
```

## Next implementation steps

1. Install Supabase CLI and convert `supabase/schema.sql` into a real migration.
2. Add auth or email-based account binding.
3. Replace `quota-store.mjs` with a Supabase-backed store behind the same API contract.
4. Upload generated images to the private `inkfirst-designs` bucket.
5. Configure live Creem products and webhook secret in deployment.
6. Tune linework/stencil quality prompts and model choice.
7. Generate placement preview from the same accepted concept image.
8. Gradually convert the static homepage markup into native React components.
9. Add Stripe as a second payment provider after Stripe becomes available.

## Product focus

InkFirst should stay focused on:

- First tattoo ideas.
- Placement-aware generation.
- Tattoo-ready linework.
- Artist-ready references.
- Paid upgrades for more generations and final downloads.

Avoid adding appointment booking, community features, mobile apps, or custom model training before the first validation round.

# InkFirst Billing History Design

## Goal

Give signed-in users a reliable billing history and give support enough information to investigate reports such as "I paid, but my credits did not arrive."

Payment records and balance changes remain separate: `billing_events` records what Creem reported, while `credit_events` records credits or download access granted by InkFirst.

## User Experience

Add a `Billing` item to the signed-in Account menu. It opens `/billing`.

The page contains an account summary showing the current plan, remaining paid credits, and high-resolution download access, followed by billing history ordered newest first. Each row shows plan, status, credits, payment source, event time, and a shortened event ID.

Supported user-facing statuses are `Paid`, `Processing`, `Failed`, `Refunded`, and `Cancelled`. Unknown Creem event types are shown as `Processing` rather than incorrectly claiming payment success.

The empty state is `No billing history yet.` Logged-out visitors are asked to sign in. Raw webhook payloads, card data, API keys, and webhook secrets are never returned to the browser.

## Data Model

Reuse `public.billing_events` as the payment event log. Each valid Creem webhook is upserted by its external event ID so webhook retries remain idempotent.

Stored fields:

- `id`: Creem event ID.
- `provider`: `creem`.
- `event_type`: original Creem event type.
- `owner_user_id`: authenticated InkFirst account from trusted checkout metadata.
- `anonymous_client_id`: retained only for legacy events when no user owner exists.
- `plan`: normalized InkFirst plan.
- `credits`: credits associated with the plan.
- `processed_at`: time InkFirst finished processing the event.
- `payload`: raw provider payload, available only to trusted server code.
- `created_at`: database insertion time.

Add indexes for user and anonymous-owner history queries if they are not already present. RLS remains enabled. Browser clients will not query this table directly; the service-role server endpoint authenticates the request and filters by the resolved owner ID.

Existing successful purchases recorded only in `credit_events` are included by the API as normalized legacy paid entries. They are not copied destructively and are deduplicated against billing events using provider plus external event ID.

## Server Behavior

### Webhook persistence

After signature verification and metadata validation, the Creem webhook handler records the event in `billing_events`. Entitlement granting remains idempotent through the existing external event ID rules.

The payment event should still be recorded when it is valid but does not grant credits, including cancellation, failure, and refund events. Invalid signatures or untrusted owner metadata are rejected and not exposed as account records.

### Billing API

Add `GET /api/billing-events?limit=20`.

- Return `401` when no authenticated account exists.
- Clamp `limit` to a safe range.
- Query only records owned by the authenticated user.
- Merge legacy successful `credit_events` records.
- Return normalized display data, not raw provider payloads.
- Return the current entitlement summary with the event list.

```json
{
  "summary": {
    "plan": "creator-pack",
    "paidCreditsRemaining": 19,
    "highResolutionDownloadsUnlocked": true
  },
  "events": [
    {
      "id": "evt_123",
      "provider": "creem",
      "plan": "creator-pack",
      "status": "paid",
      "credits": 20,
      "occurredAt": "2026-06-20T08:00:00.000Z"
    }
  ]
}
```

## Frontend Structure

Create static `/billing.html`, served at `/billing`, plus `billing.js`. Keep the layout consistent with My Designs rather than turning it into a dense admin dashboard.

Desktop uses a compact table. Mobile uses stacked rows with stable labels so values do not overflow. Status is expressed with restrained text and color, not large pill buttons.

The Account menu links to `/billing`. A Pricing link remains available for users who need more credits or a plan upgrade.

## Error Handling

- Loading: `Loading billing history...`
- Logged out: explain that billing history belongs to an account and open the existing sign-in flow.
- API failure: show `Billing history is temporarily unavailable. Try again.`
- Empty result: show `No billing history yet.` with a link to Pricing.
- Unknown event type: display `Processing` and preserve the event ID for support.

## Security

- Verify Creem signatures before persisting events.
- Resolve ownership from authenticated checkout metadata, never from a browser-supplied query parameter.
- Filter all history queries by the server-verified user ID.
- Never return `payload` from the billing API.
- Keep the Supabase secret/service-role key server-only.
- Keep RLS enabled on `billing_events` as defense in depth.

## Tests

- A valid Creem webhook is stored once and a retry does not duplicate it.
- Non-success payment events are recorded but do not grant credits.
- The billing API rejects anonymous requests.
- The billing API only returns the current user's events.
- Legacy successful `credit_events` appear once.
- Raw payload data is absent from API responses.
- `/billing` and Account menu navigation are present.
- Empty, loading, error, desktop, and mobile states render without overflow.
- Existing checkout, webhook, quota, download-access, and TypeScript tests continue to pass.

## Scope

This iteration does not add invoices, refunds initiated from InkFirst, subscription cancellation controls, admin search, or card details. Those require separate provider workflows and should be added only after billing history is reliable.

# Billing History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure account Billing page that records Creem webhook events, displays current entitlements, and exposes enough normalized order information to diagnose missing credits.

**Architecture:** A focused `billing-history-core.mjs` normalizes provider event types and merges legacy credit records. `supabase-store.mjs` persists and lists trusted payment data, while authenticated Node and Next API routes return a payload-free view. The static Billing page consumes that endpoint and the Account menu links to it.

**Tech Stack:** Node.js ES modules, static HTML/CSS/JavaScript, Next.js 15 route handlers, Supabase PostgREST, Creem webhooks, Node assertion tests.

---

## File Map

- Create `billing-history-core.mjs`: provider status mapping, safe response mapping, event merging.
- Create `tests/billing-history-core.test.mjs`: normalization and deduplication tests.
- Modify `supabase-store.mjs`: persist and query billing/legacy credit events.
- Modify `quota-store.mjs`: safe facade for billing history and entitlement summary.
- Modify `billing-core.mjs`: classify whether a verified webhook grants credits.
- Modify `server.mjs`: persist webhooks, add authenticated billing API, serve `/billing`.
- Modify `app/api/webhooks/creem/route.js`: match static webhook behavior.
- Create `app/api/billing-events/route.js`: Next billing history API.
- Create `billing.html`, `billing.js`, `public/billing.js`: Billing interface.
- Create `app/billing/page.tsx`: Next wrapper for static Billing markup.
- Modify `auth.js`, `public/auth.js`: Account menu Billing link.
- Modify `styles.css`: Billing summary, table, status, and responsive styles.
- Create `tests/billing-history-store.test.mjs`, `tests/billing-history-api.test.mjs`, and `tests/billing-page.test.mjs`.

### Task 1: Normalize Billing Events

**Files:**
- Create: `billing-history-core.mjs`
- Create: `tests/billing-history-core.test.mjs`

- [ ] **Step 1: Write the failing normalization tests**

Test `checkout.completed -> paid`, cancellation/failure/refund mappings, unknown events -> processing, removal of `payload`, and deduplication by `provider:id` with billing events preferred over legacy credit events.

```js
const normalized = normalizeBillingEvent({
  id: "evt_paid",
  provider: "creem",
  event_type: "checkout.completed",
  plan: "creator-pack",
  credits: 20,
  processed_at: "2026-06-20T08:00:00.000Z",
  payload: { secret: "must-not-leak" }
});

assert.deepEqual(normalized, {
  id: "evt_paid",
  provider: "creem",
  plan: "creator-pack",
  status: "paid",
  credits: 20,
  occurredAt: "2026-06-20T08:00:00.000Z"
});
assert.equal(isCreditGrantingEvent("checkout.completed"), true);
assert.equal(isCreditGrantingEvent("checkout.failed"), false);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/billing-history-core.test.mjs`

Expected: FAIL because `billing-history-core.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure functions**

```js
export function billingStatusFromEventType(eventType = "") { /* map provider status */ }
export function isCreditGrantingEvent(eventType = "") { /* true only for paid */ }
export function normalizeBillingEvent(row) { /* safe public fields only */ }
export function normalizeLegacyCreditEvent(row) { /* status: paid */ }
export function mergeBillingHistory(billingRows, creditRows, limit = 20) { /* dedupe and sort */ }
```

Use event-type fragments `completed|succeeded|paid` for paid, `refund` for refunded, `cancel` for cancelled, and `fail|expire` for failed. Everything else is processing.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node tests/billing-history-core.test.mjs`

Expected: all billing history core tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add Documents/tattoo/billing-history-core.mjs Documents/tattoo/tests/billing-history-core.test.mjs
git commit -m "feat: normalize billing history events"
```

### Task 2: Persist and Read Billing History from Supabase

**Files:**
- Modify: `supabase-store.mjs`
- Modify: `quota-store.mjs`
- Create: `tests/billing-history-store.test.mjs`

- [ ] **Step 1: Write failing store tests**

Verify `persistBillingEventToSupabase(event)` performs an idempotent POST to `/billing_events?on_conflict=id` with `Prefer: resolution=merge-duplicates,return=minimal`, assigns `owner_user_id` for UUID owners, and stores the raw payload only in Supabase. Verify `listBillingHistoryFromSupabase(userId)` requests both owned billing and credit events and returns merged normalized results.

- [ ] **Step 2: Run the store test and verify RED**

Run: `node tests/billing-history-store.test.mjs`

Expected: FAIL because the store exports are missing.

- [ ] **Step 3: Add Supabase persistence and query functions**

```js
export async function persistBillingEventToSupabase(event, env = process.env, fetchImpl = fetch) {
  if (!getSupabaseConfig(env)) return { skipped: true };
  await requestSupabase("/billing_events?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: event.eventId,
      provider: "creem",
      event_type: event.eventType,
      ...ownerCreditPayload(event.clientId),
      plan: toBillingPlan(event.plan),
      credits: event.credits,
      processed_at: new Date().toISOString(),
      payload: event.raw
    })
  }, env, fetchImpl);
  return { skipped: false };
}
```

`listBillingHistoryFromSupabase` clamps limits to 1-50, filters both tables by the owner, selects only required credit fields, and calls `mergeBillingHistory`.

- [ ] **Step 4: Add safe facades and quota summary**

In `quota-store.mjs`, export `recordBillingEvent(event)` and `getBillingHistory(ownerId, options)`. Return current paid credits and high-resolution access, and derive the summary plan from the latest paid event with `free` as fallback.

- [ ] **Step 5: Run store and existing Supabase tests**

Run: `node tests/billing-history-store.test.mjs; npm run test:supabase`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add Documents/tattoo/supabase-store.mjs Documents/tattoo/quota-store.mjs Documents/tattoo/tests/billing-history-store.test.mjs
git commit -m "feat: persist billing events in Supabase"
```

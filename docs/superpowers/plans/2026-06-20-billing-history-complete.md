# Billing History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record Creem payment events and give signed-in users a secure Billing page with entitlement and order history.

**Architecture:** Pure helpers normalize payment states and merge legacy credit records. Supabase remains the trusted event store; authenticated Node and Next endpoints return only safe current-user fields. A static Billing page follows the existing My Designs pattern.

**Tech Stack:** Node.js ES modules, static HTML/CSS/JS, Next.js 15, Supabase PostgREST, Creem webhooks, Node assertion tests.

---

### Task 1: Normalize Billing Events

**Files:** Create `billing-history-core.mjs`; test `tests/billing-history-core.test.mjs`.

- [ ] Write failing tests for `checkout.completed -> paid`, failed/cancelled/refunded mappings, unknown -> processing, safe public fields, sorting, and provider/event-ID deduplication.
- [ ] Run `node tests/billing-history-core.test.mjs`; expect module-not-found failure.
- [ ] Export `billingStatusFromEventType`, `isCreditGrantingEvent`, `normalizeBillingEvent`, `normalizeLegacyCreditEvent`, and `mergeBillingHistory`.

```js
assert.equal(isCreditGrantingEvent("checkout.completed"), true);
assert.equal(isCreditGrantingEvent("checkout.failed"), false);
assert.deepEqual(normalizeBillingEvent(row), {
  id: "evt_1", provider: "creem", plan: "creator-pack",
  status: "paid", credits: 20, occurredAt: row.processed_at
});
```

- [ ] Run the test; expect PASS.
- [ ] Commit the two scoped files with `feat: normalize billing history events`.

### Task 2: Persist and Query Supabase History

**Files:** Modify `supabase-store.mjs`, `quota-store.mjs`; test `tests/billing-history-store.test.mjs`.

- [ ] Write failing tests proving billing events upsert to `/billing_events?on_conflict=id`, UUID owners use `owner_user_id`, queries filter by owner, and legacy credit events merge without duplicates.
- [ ] Run `node tests/billing-history-store.test.mjs`; expect missing-export failure.
- [ ] Add `persistBillingEventToSupabase(event)` using `Prefer: resolution=merge-duplicates,return=minimal` and these fields:

```js
{
  id: event.eventId,
  provider: "creem",
  event_type: event.eventType,
  ...ownerCreditPayload(event.clientId),
  plan: toBillingPlan(event.plan),
  credits: event.credits,
  processed_at: new Date().toISOString(),
  payload: event.raw
}
```

- [ ] Add `listBillingHistoryFromSupabase(ownerId, { limit })`; clamp 1-50, query owned billing and credit rows, select no unnecessary payload for reads, and merge with the pure helper.
- [ ] Add safe facades `recordBillingEvent(event)` and `getBillingHistory(ownerId, options)` in `quota-store.mjs`. Return summary `{ plan, paidCreditsRemaining, highResolutionDownloadsUnlocked }` plus events.
- [ ] Run `node tests/billing-history-store.test.mjs; npm run test:supabase`; expect PASS.
- [ ] Commit scoped files with `feat: persist billing events in Supabase`.

### Task 3: Make Webhook Processing Status-Aware

**Files:** Modify `billing-core.mjs`, `server.mjs`, `app/api/webhooks/creem/route.js`; test `tests/billing-history-webhook.test.mjs` and existing webhook tests.

- [ ] Write failing tests proving completed events record and grant once, while failed/refunded/cancelled events record but never grant credits.
- [ ] Run `node tests/billing-history-webhook.test.mjs`; expect missing recording behavior.
- [ ] In both webhook handlers, verify and parse first, call `recordBillingEvent(event)`, then call `addPaidCredits` only when `isCreditGrantingEvent(event.eventType)` is true.
- [ ] Return `{ received: true, recorded: true, granted: Boolean(result?.granted) }`. Let persistence failures return an error so Creem retries safely.
- [ ] Run `node tests/billing-history-webhook.test.mjs; node tests/creem-webhook-access.test.mjs; npm run test:billing`; expect PASS.
- [ ] Commit scoped files with `feat: record Creem billing events`.

### Task 4: Add Authenticated Billing API

**Files:** Modify `server.mjs`; create `app/api/billing-events/route.js`; test `tests/billing-history-api.test.mjs`.

- [ ] Write failing tests for `GET /api/billing-events`, 401 anonymous response, current-user ownership, limit handling, and no raw `payload` in responses.
- [ ] Run `node tests/billing-history-api.test.mjs`; expect missing-route failure.
- [ ] Add the static handler:

```js
const session = getClientSession(request.headers.cookie ?? "");
if (!session.isAuthenticated || !session.userId) {
  writeJson(response, 401, { error: "Sign in to view billing history." });
  return;
}
writeJson(response, 200, await getBillingHistory(session.userId, {
  limit: Number(url.searchParams.get("limit") ?? 20)
}));
```

- [ ] Add the equivalent Next `GET` route with `NextResponse.json`.
- [ ] Run `node tests/billing-history-api.test.mjs; npx tsc --noEmit`; expect PASS.
- [ ] Commit scoped files with `feat: expose account billing history API`.

### Task 5: Build Billing Page and Account Entry

**Files:** Create `billing.html`, `billing.js`, `public/billing.js`, `app/billing/page.tsx`; modify `server.mjs`, `auth.js`, `public/auth.js`, `styles.css`; test `tests/billing-page.test.mjs`.

- [ ] Write failing tests asserting `/billing` in both runtimes, Account link, one H1, summary/history/status elements, Pricing CTA, and fetch to `/api/billing-events?limit=20`.
- [ ] Run `node tests/billing-page.test.mjs`; expect missing-page failure.
- [ ] Create semantic `Billing & Credits` markup with current plan, paid credits, download access, live status, history container, and Pricing CTA.
- [ ] Implement escaped rendering for plan, provider, status, credits, date, and shortened event ID. Handle loading, 401, request failure, and `No billing history yet.`
- [ ] Add a compact desktop table and mobile label/value layout below 720px. Avoid oversized pills; allow long IDs to wrap.
- [ ] Serve `/billing`, add the Next static wrapper, and add `Billing` to both Account menu scripts.
- [ ] Run `node tests/billing-page.test.mjs; node --check billing.js; node --check public/billing.js; npx tsc --noEmit`; expect PASS.
- [ ] Commit scoped files with `feat: add account billing history page`.

### Task 6: End-to-End Verification

- [ ] Run all new billing tests plus `npm run test:billing`, `npm run test:supabase`, and `node tests/creem-webhook-access.test.mjs`.
- [ ] Run regressions: `npm run test:quota`, `npm run test:generate`, checkout-auth, download-access, pricing-state, success-page, and `npx tsc --noEmit`.
- [ ] With Supabase and the app running, sign in and open Account > Billing. Verify the paid test order, mobile layout, empty state, anonymous state, and no console errors.
- [ ] In Supabase Studio, replay one signed webhook and confirm one billing row, one credit grant, and no raw payload in the browser API response.
- [ ] Commit only scoped verification fixes; never stage unrelated worktree changes or create an empty commit.

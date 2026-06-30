import assert from "node:assert/strict";
import test from "node:test";

import {
  billingStatusFromEventType,
  isCreditGrantingEvent,
  mergeBillingHistory,
  normalizeBillingEvent,
  normalizeLegacyCreditEvent,
} from "../billing-history-core.mjs";

test("maps billing event types with specific outcomes taking precedence", () => {
  const cases = [
    ["checkout.completed", "paid"],
    ["payment_succeeded", "paid"],
    ["invoice.paid", "paid"],
    ["payment.paid.refund", "refunded"],
    ["payment.succeeded.cancelled", "cancelled"],
    ["payment.completed_failed", "failed"],
    ["invoice.expired", "failed"],
    ["payment.pending", "processing"],
    ["", "processing"],
    [undefined, "processing"],
  ];

  for (const [eventType, expected] of cases) {
    assert.equal(billingStatusFromEventType(eventType), expected);
  }
});

test("only paid event types grant credits", () => {
  assert.equal(isCreditGrantingEvent("checkout.completed"), true);
  assert.equal(isCreditGrantingEvent("invoice.paid"), true);
  assert.equal(isCreditGrantingEvent("payment.paid.refund"), false);
  assert.equal(isCreditGrantingEvent("payment.cancelled"), false);
  assert.equal(isCreditGrantingEvent("payment.failed"), false);
  assert.equal(isCreditGrantingEvent("payment.pending"), false);
});

test("negated payment states never grant credits", () => {
  const eventTypes = ["unpaid", "not_paid", "payment.not_completed", "not-paid"];

  assert.deepEqual(
    eventTypes.map((eventType) => billingStatusFromEventType(eventType)),
    ["processing", "processing", "processing", "processing"],
  );
  assert.deepEqual(
    eventTypes.map((eventType) => isCreditGrantingEvent(eventType)),
    [false, false, false, false],
  );
});
test("normalizes billing rows without leaking private fields", () => {
  const normalized = normalizeBillingEvent({
    external_event_id: "evt_123",
    provider: "stripe",
    event_type: "checkout.completed",
    plan: "pro",
    credits: 250,
    occurred_at: "2026-06-20T10:00:00.000Z",
    payload: { secret: true },
    user_id: "user_123",
    owner_id: "owner_123",
  });

  assert.deepEqual(normalized, {
    id: "evt_123",
    provider: "stripe",
    plan: "pro",
    status: "paid",
    credits: 250,
    occurredAt: "2026-06-20T10:00:00.000Z",
  });
  assert.deepEqual(Object.keys(normalized), [
    "id",
    "provider",
    "plan",
    "status",
    "credits",
    "occurredAt",
  ]);
});

test("normalizes non-paid billing rows with zero credits", () => {
  assert.equal(
    normalizeBillingEvent({
      event_type: "payment.failed",
      credits: 20,
    }).credits,
    0,
  );
});
test("normalizes legacy credit rows as paid", () => {
  assert.deepEqual(
    normalizeLegacyCreditEvent({
      external_event_id: "legacy_1",
      source: "lemonsqueezy",
      plan: "starter",
      credits_delta: 80,
      created_at: "2026-06-19T09:00:00.000Z",
      payload: { hidden: true },
      owner_id: "owner_456",
    }),
    {
      id: "legacy_1",
      provider: "lemonsqueezy",
      plan: "starter",
      status: "paid",
      credits: 80,
      occurredAt: "2026-06-19T09:00:00.000Z",
    },
  );

  assert.equal(
    normalizeLegacyCreditEvent({
      external_event_id: "legacy_2",
      provider: "stripe",
    }).provider,
    "stripe",
  );
});

test("keeps legacy credit rows with null external ids distinct by database id", () => {
  const merged = mergeBillingHistory([], [
    {
      id: "credit-row-1",
      external_event_id: null,
      source: "manual",
      credits_delta: 5,
      created_at: "2026-06-20T09:00:00.000Z",
    },
    {
      id: "credit-row-2",
      external_event_id: null,
      source: "manual",
      credits_delta: 10,
      created_at: "2026-06-21T09:00:00.000Z",
    },
  ]);

  assert.deepEqual(merged.map(({ id }) => id), ["credit-row-2", "credit-row-1"]);
});
test("merges, prefers billing duplicates, and orders newest first", () => {
  const billingRows = [
    {
      external_event_id: "shared",
      provider: "stripe",
      event_type: "payment.refunded",
      plan: "billing-plan",
      credits: 0,
      occurred_at: "2026-06-18T12:00:00.000Z",
    },
    {
      external_event_id: "newest",
      provider: "stripe",
      event_type: "invoice.paid",
      plan: "pro",
      credits: 200,
      occurred_at: "2026-06-20T12:00:00.000Z",
    },
  ];
  const creditRows = [
    {
      external_event_id: "shared",
      source: "stripe",
      plan: "legacy-plan",
      credits_delta: 100,
      created_at: "2026-06-21T12:00:00.000Z",
    },
    {
      external_event_id: "middle",
      source: "paddle",
      plan: "starter",
      credits_delta: 50,
      created_at: "2026-06-19T12:00:00.000Z",
    },
  ];

  const merged = mergeBillingHistory(billingRows, creditRows);

  assert.deepEqual(merged.map(({ id }) => id), ["newest", "middle", "shared"]);
  assert.deepEqual(merged.find(({ id }) => id === "shared"), {
    id: "shared",
    provider: "stripe",
    plan: "billing-plan",
    status: "refunded",
    credits: 0,
    occurredAt: "2026-06-18T12:00:00.000Z",
  });
});

test("keeps identical event ids from different providers", () => {
  const merged = mergeBillingHistory(
    [
      {
        external_event_id: "shared-id",
        provider: "stripe",
        event_type: "invoice.paid",
        plan: "pro",
        credits: 200,
        occurred_at: "2026-06-20T12:00:00.000Z",
      },
    ],
    [
      {
        external_event_id: "shared-id",
        source: "paddle",
        plan: "starter",
        credits_delta: 50,
        created_at: "2026-06-19T12:00:00.000Z",
      },
    ],
  );

  assert.equal(merged.length, 2);
  assert.deepEqual(merged, [
    {
      id: "shared-id",
      provider: "stripe",
      plan: "pro",
      status: "paid",
      credits: 200,
      occurredAt: "2026-06-20T12:00:00.000Z",
    },
    {
      id: "shared-id",
      provider: "paddle",
      plan: "starter",
      status: "paid",
      credits: 50,
      occurredAt: "2026-06-19T12:00:00.000Z",
    },
  ]);
});
test("clamps merge limits to the inclusive range 1 through 50", () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({
    external_event_id: `evt_${index}`,
    provider: "stripe",
    event_type: "invoice.paid",
    credits: index,
    occurred_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }));

  assert.equal(mergeBillingHistory(rows, [], 0).length, 1);
  assert.equal(mergeBillingHistory(rows, [], -10).length, 1);
  assert.equal(mergeBillingHistory(rows, [], 100).length, 50);
  assert.equal(mergeBillingHistory(rows, [], 3).length, 3);
});

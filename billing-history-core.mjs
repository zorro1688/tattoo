const PAID_EVENT_TOKENS = new Set(["completed", "succeeded", "paid"]);
const REFUNDED_EVENT_TYPE = /refund/i;
const CANCELLED_EVENT_TYPE = /cancel/i;
const FAILED_EVENT_TYPE = /(fail|expire)/i;

function eventTypeTokens(value) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hasNegatedPaidState(tokens) {
  if (tokens.includes("unpaid")) return true;
  return tokens.some(
    (token, index) => token === "not" && PAID_EVENT_TOKENS.has(tokens[index + 1]),
  );
}

export function billingStatusFromEventType(eventType = "") {
  const value = String(eventType ?? "");
  const tokens = eventTypeTokens(value);

  if (REFUNDED_EVENT_TYPE.test(value)) return "refunded";
  if (CANCELLED_EVENT_TYPE.test(value)) return "cancelled";
  if (FAILED_EVENT_TYPE.test(value)) return "failed";
  if (hasNegatedPaidState(tokens)) return "processing";
  if (tokens.some((token) => PAID_EVENT_TOKENS.has(token))) return "paid";
  return "processing";
}

export function isCreditGrantingEvent(eventType = "") {
  return billingStatusFromEventType(eventType) === "paid";
}

export function normalizeBillingEvent(row) {
  const source = row ?? {};
  const status = billingStatusFromEventType(source.event_type ?? source.eventType);

  return {
    id: source.external_event_id ?? source.id,
    provider: source.provider,
    plan: source.plan,
    status,
    credits: status === "paid" ? (source.credits ?? source.credits_delta ?? 0) : 0,
    occurredAt: source.occurred_at ?? source.occurredAt ?? source.created_at,
  };
}

export function normalizeLegacyCreditEvent(row) {
  const source = row ?? {};

  return {
    id: source.external_event_id ?? source.id,
    provider: source.source ?? source.provider,
    plan: source.plan,
    status: "paid",
    credits: source.credits_delta ?? 0,
    occurredAt: source.created_at,
  };
}

function clampedLimit(limit) {
  const numericLimit = Number(limit);
  const integerLimit = Number.isFinite(numericLimit) ? Math.trunc(numericLimit) : 20;
  return Math.min(50, Math.max(1, integerLimit));
}

export function mergeBillingHistory(billingRows, creditRows, limit = 20) {
  const events = new Map();

  for (const row of creditRows ?? []) {
    const event = normalizeLegacyCreditEvent(row);
    events.set(`${event.provider}\u0000${event.id}`, event);
  }

  for (const row of billingRows ?? []) {
    const event = normalizeBillingEvent(row);
    events.set(`${event.provider}\u0000${event.id}`, event);
  }

  return [...events.values()]
    .sort((left, right) => {
      const leftTime = Date.parse(left.occurredAt) || 0;
      const rightTime = Date.parse(right.occurredAt) || 0;
      return rightTime - leftTime;
    })
    .slice(0, clampedLimit(limit));
}

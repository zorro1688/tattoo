import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  listBillingHistoryFromSupabase,
  persistBillingEventToSupabase,
} from "../supabase-store.mjs";
import {
  getBillingHistory,
  readStore,
  recordBillingEvent,
} from "../quota-store.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const supabaseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
const userId = "00000000-0000-4000-8000-000000000001";

function response(body = null, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  };
}

function requestPath(call) {
  const url = new URL(call.url);
  return `${url.pathname}${url.search}`;
}

async function withProcessEnvironment(values, testBody) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    await testBody();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withTempStore(testBody) {
  const directory = await mkdtemp(join(tmpdir(), "inkfirst-billing-history-"));
  const storePath = join(directory, "store.json");

  try {
    await withProcessEnvironment(
      {
        INKFIRST_STORE_PATH: storePath,
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      },
      () => testBody(storePath),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await run("billing persistence skips cleanly without Supabase configuration", async () => {
  const result = await persistBillingEventToSupabase(
    { eventId: "evt_skip" },
    {},
    async () => {
      throw new Error("fetch should not be called");
    },
  );

  assert.deepEqual(result, { skipped: true });
});

await run("billing persistence requires an event id", async () => {
  await assert.rejects(
    () => persistBillingEventToSupabase({}, supabaseEnv, async () => response()),
    /eventId/i,
  );
});

await run("billing persistence creates UUID-owned events without changing raw payload", async () => {
  const calls = [];
  const raw = { id: "evt_user", customer: { email: "private@example.com" } };
  const result = await persistBillingEventToSupabase(
    {
      eventId: "evt_user",
      eventType: "checkout.completed",
      clientId: userId,
      plan: "creator-pack",
      credits: 20,
      raw,
    },
    supabaseEnv,
    async (url, options) => {
      calls.push({ url, options });
      return response([{ id: "evt_user" }], { status: 201 });
    },
  );

  assert.deepEqual(result, { skipped: false });
  assert.equal(calls.length, 1);
  assert.equal(requestPath(calls[0]), "/rest/v1/billing_events?on_conflict=id&select=id");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(
    calls[0].options.headers.Prefer,
    "resolution=ignore-duplicates,return=representation",
  );

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.id, "evt_user");
  assert.equal(body.provider, "creem");
  assert.equal(body.event_type, "checkout.completed");
  assert.equal(body.owner_user_id, userId);
  assert.equal(body.anonymous_client_id, undefined);
  assert.equal(body.plan, "creator-pack");
  assert.equal(body.credits, 20);
  assert.equal(new Date(body.processed_at).toISOString(), body.processed_at);
  assert.deepEqual(body.payload, raw);
  assert.deepEqual(raw, { id: "evt_user", customer: { email: "private@example.com" } });
});

await run("billing persistence uses anonymous ownership and a normalized source", async () => {
  const calls = [];
  await persistBillingEventToSupabase(
    {
      eventId: "evt_anon",
      eventType: "invoice.paid",
      clientId: "anon_client",
      source: "stripe",
      plan: "pro-monthly",
      credits: 100,
      raw: {},
    },
    supabaseEnv,
    async (url, options) => {
      calls.push({ url, options });
      return response([{ id: "evt_anon" }], { status: 201 });
    },
  );

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.provider, "stripe");
  assert.equal(body.anonymous_client_id, "anon_client");
  assert.equal(body.owner_user_id, undefined);
});

for (const owner of [
  { label: "UUID", clientId: userId, ownerColumn: "owner_user_id" },
  { label: "anonymous", clientId: "anon_client", ownerColumn: "anonymous_client_id" },
]) {
  await run(`billing persistence accepts an identical ${owner.label} retry after verifying immutable fields`, async () => {
    const calls = [];
    const event = { eventId: `evt_retry_${owner.label}`, eventType: "checkout.completed", clientId: owner.clientId, source: "creem", plan: "creator-pack", credits: 20, raw: { secret: "never read" } };
    const result = await persistBillingEventToSupabase(event, supabaseEnv, async (url, options) => {
      calls.push({ url, options });
      if (options.method === "POST") return response([], { status: 200 });
      return response([{ provider: "creem", event_type: "checkout.completed", owner_user_id: owner.ownerColumn === "owner_user_id" ? owner.clientId : null, anonymous_client_id: owner.ownerColumn === "anonymous_client_id" ? owner.clientId : null, plan: "creator-pack", credits: 20 }]);
    });
    assert.deepEqual(result, { skipped: false, idempotent: true });
    assert.equal(calls.length, 2);
    assert.equal(requestPath(calls[0]), "/rest/v1/billing_events?on_conflict=id&select=id");
    assert.equal(calls[0].options.headers.Prefer, "resolution=ignore-duplicates,return=representation");
    const retryUrl = new URL(calls[1].url);
    assert.equal(retryUrl.searchParams.get("select"), "provider,event_type,owner_user_id,anonymous_client_id,plan,credits");
    assert.equal(retryUrl.searchParams.get("id"), `eq.${event.eventId}`);
    assert.equal(retryUrl.searchParams.get("limit"), "1");
    assert.equal(retryUrl.search.includes("payload"), false);
    assert.equal(calls[1].options.method, "GET");
    assert.equal(calls[1].options.headers.Authorization, "Bearer service-role-key");
  });

  await run(`billing persistence rejects conflicting ${owner.label} retries`, async () => {
    const baseEvent = { eventId: `evt_conflict_${owner.label}`, eventType: "checkout.completed", clientId: owner.clientId, source: "creem", plan: "creator-pack", credits: 20 };
    const existing = { provider: "creem", event_type: "checkout.completed", owner_user_id: owner.ownerColumn === "owner_user_id" ? owner.clientId : null, anonymous_client_id: owner.ownerColumn === "anonymous_client_id" ? owner.clientId : null, plan: "creator-pack", credits: 20 };
    const conflicts = [{ source: "stripe" }, { eventType: "payment.refunded" }, { clientId: owner.ownerColumn === "owner_user_id" ? "00000000-0000-4000-8000-000000000002" : "other_client" }, { plan: "pro-monthly" }, { credits: 100 }];
    for (const conflict of conflicts) {
      await assert.rejects(() => persistBillingEventToSupabase({ ...baseEvent, ...conflict }, supabaseEnv, async (_url, options) => options.method === "POST" ? response([], { status: 200 }) : response([existing])), /Billing event conflict/i);
    }
  });
}
await run("Supabase history reads exact safe columns for a UUID owner and merges duplicates", async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/billing_events?")) {
      return response([
        {
          id: "shared",
          provider: "creem",
          event_type: "payment.refunded",
          plan: "creator-pack",
          credits: 20,
          processed_at: "2026-06-21T12:00:00.000Z",
          created_at: "2026-06-21T12:00:01.000Z",
        },
        {
          id: "newest",
          provider: "creem",
          event_type: "checkout.completed",
          plan: "pro-monthly",
          credits: 100,
          processed_at: "2026-06-22T12:00:00.000Z",
          created_at: "2026-06-22T12:00:01.000Z",
          payload: { secret: "must not be exposed" },
          owner_user_id: userId,
        },
      ]);
    }
    if (new URL(url).searchParams.get("select") === "plan") {
      return response([{ plan: "pro-monthly" }]);
    }
    return response([
      {
        source: "creem",
        external_event_id: "shared",
        plan: "creator-pack",
        credits_delta: 20,
        created_at: "2026-06-21T12:00:02.000Z",
      },
      {
        source: "manual",
        external_event_id: "legacy",
        plan: "creator-pack",
        credits_delta: 5,
        created_at: "2026-06-20T12:00:00.000Z",
      },
    ]);
  };

  const result = await listBillingHistoryFromSupabase(
    userId,
    { limit: 100 },
    supabaseEnv,
    fetchMock,
  );

  assert.equal(result.skipped, false);
  assert.equal(result.latestPaidPlan, "pro-monthly");
  assert.deepEqual(result.events.map(({ id }) => id), ["newest", "shared", "legacy"]);
  assert.equal(result.events[1].status, "refunded");
  assert.equal(result.events[1].credits, 0);
  assert.equal(result.events[1].occurredAt, "2026-06-21T12:00:00.000Z");
  assert.equal(Object.hasOwn(result.events[0], "payload"), false);
  assert.equal(Object.hasOwn(result.events[0], "owner_user_id"), false);
  assert.equal(calls.length, 4);

  const billingUrl = new URL(calls[0].url);
  assert.equal(billingUrl.pathname, "/rest/v1/billing_events");
  assert.equal(
    billingUrl.searchParams.get("select"),
    "id,provider,event_type,plan,credits,processed_at,created_at",
  );
  assert.equal(billingUrl.searchParams.get("owner_user_id"), `eq.${userId}`);
  assert.equal(billingUrl.searchParams.get("order"), "processed_at.desc.nullslast,created_at.desc");
  assert.equal(billingUrl.searchParams.get("limit"), "50");
  assert.equal(billingUrl.search.includes("payload"), false);

  const creditUrl = new URL(calls[1].url);
  assert.equal(creditUrl.pathname, "/rest/v1/credit_events");
  assert.equal(
    creditUrl.searchParams.get("select"),
    "id,source,external_event_id,plan,credits_delta,created_at",
  );
  assert.equal(creditUrl.searchParams.get("owner_user_id"), `eq.${userId}`);
  assert.equal(creditUrl.searchParams.get("order"), "created_at.desc");
  assert.equal(creditUrl.searchParams.get("limit"), "50");
  assert.equal(creditUrl.search.includes("payload"), false);

  const latestCreditPlanUrl = new URL(calls[2].url);
  assert.equal(latestCreditPlanUrl.pathname, "/rest/v1/credit_events");
  assert.equal(latestCreditPlanUrl.searchParams.get("select"), "plan,created_at");
  assert.equal(latestCreditPlanUrl.searchParams.get("owner_user_id"), `eq.${userId}`);
  assert.equal(latestCreditPlanUrl.searchParams.get("order"), "created_at.desc");
  assert.equal(latestCreditPlanUrl.searchParams.get("limit"), "1");

  const latestBillingPlanUrl = new URL(calls[3].url);
  assert.equal(latestBillingPlanUrl.pathname, "/rest/v1/billing_events");
  assert.equal(latestBillingPlanUrl.searchParams.get("select"), "plan,event_type,processed_at,created_at");
  assert.equal(latestBillingPlanUrl.searchParams.get("owner_user_id"), `eq.${userId}`);
  assert.equal(latestBillingPlanUrl.searchParams.get("order"), "processed_at.desc.nullslast,created_at.desc");
  assert.equal(latestBillingPlanUrl.searchParams.get("limit"), "20");
});

await run("Supabase history uses anonymous ownership and clamps low limits", async () => {
  const calls = [];
  const result = await listBillingHistoryFromSupabase(
    "anon_client",
    { limit: 0 },
    supabaseEnv,
    async (url, options) => {
      calls.push({ url, options });
      return response([]);
    },
  );

  assert.deepEqual(result, { skipped: false, events: [], latestPaidPlan: null });
  assert.deepEqual(calls.map((call) => new URL(call.url).searchParams.get("limit")), ["1", "1", "1", "20"]);
  for (const call of calls) {
    const url = new URL(call.url);
    assert.equal(url.searchParams.get("anonymous_client_id"), "eq.anon_client");
  }
});

await run("Supabase history skips without configuration", async () => {
  const result = await listBillingHistoryFromSupabase(
    "anon_client",
    { limit: 20 },
    {},
    async () => {
      throw new Error("fetch should not be called");
    },
  );

  assert.deepEqual(result, { skipped: true, events: [], latestPaidPlan: null });
});

await run("Supabase summary plan survives more than 50 newer non-paid events", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/anonymous_clients?")) return response([{ free_credits_remaining: 1, paid_credits_remaining: 20, high_resolution_downloads_unlocked: true }]);
    if (url.includes("/billing_events?")) return response(Array.from({ length: 50 }, (_, index) => ({
      id: `evt_pending_${index}`,
      provider: "creem",
      event_type: "payment.pending",
      plan: "pro-monthly",
      credits: 100,
      processed_at: new Date(Date.UTC(2026, 5, 22, 12, 0, 50 - index)).toISOString(),
      created_at: new Date(Date.UTC(2026, 5, 22, 12, 0, 50 - index)).toISOString(),
    })));
    if (url.includes("/credit_events?") && new URL(url).searchParams.get("select") === "plan,created_at") return response([{ plan: "creator-pack", created_at: "2026-06-21T12:00:00.000Z" }]);
    return response([]);
  };
  try {
    await withProcessEnvironment(supabaseEnv, async () => {
      const history = await getBillingHistory("anon_client", { limit: 1 });
      assert.equal(history.events.length, 1);
      assert.equal(history.events[0].id, "evt_pending_0");
      assert.equal(history.summary.plan, "creator-pack");
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
  const historyCalls = calls.filter((call) => /\/(billing_events|credit_events)\?/.test(call.url));
  assert.equal(historyCalls.length, 4);
  assert.deepEqual(historyCalls.map((call) => new URL(call.url).searchParams.get("limit")), ["50", "50", "1", "20"]);
});

await run("Supabase summary plan uses billing_events paid rows when no credit_events row exists", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(url);
    const select = parsedUrl.searchParams.get("select");

    if (url.includes("/anonymous_clients?")) {
      return response([{ free_credits_remaining: 1, paid_credits_remaining: 20, high_resolution_downloads_unlocked: true }]);
    }

    if (url.includes("/billing_events?") && select === "plan,event_type,processed_at,created_at") {
      return response([{ plan: "creator-pack", event_type: "checkout.completed", processed_at: "2026-06-21T12:00:00.000Z", created_at: "2026-06-21T12:00:00.000Z" }]);
    }

    if (url.includes("/billing_events?")) {
      return response(Array.from({ length: 50 }, (_, index) => ({
        id: `evt_pending_only_${index}`,
        provider: "creem",
        event_type: "payment.pending",
        plan: "pro-monthly",
        credits: 100,
        processed_at: new Date(Date.UTC(2026, 5, 22, 12, 0, 50 - index)).toISOString(),
        created_at: new Date(Date.UTC(2026, 5, 22, 12, 0, 50 - index)).toISOString(),
      })));
    }

    return response([]);
  };

  try {
    await withProcessEnvironment(supabaseEnv, async () => {
      const history = await getBillingHistory("anon_client", { limit: 1 });
      assert.equal(history.events.length, 1);
      assert.equal(history.events[0].id, "evt_pending_only_0");
      assert.equal(history.summary.plan, "creator-pack");
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await run("Supabase latest paid billing query does not let unpaid rows crowd out paid rows", async () => {
  const calls = [];
  const result = await listBillingHistoryFromSupabase("anon_client", { limit: 1 }, supabaseEnv, async (url, options) => {
    calls.push({ url, options });
    const parsedUrl = new URL(url);

    if (parsedUrl.pathname.endsWith("/billing_events") && parsedUrl.searchParams.get("select") === "id,provider,event_type,plan,credits,processed_at,created_at") {
      return response([{
        id: "evt_unpaid_new",
        provider: "creem",
        event_type: "invoice.unpaid",
        plan: "pro-monthly",
        credits: 100,
        processed_at: "2026-06-22T12:00:00.000Z",
        created_at: "2026-06-22T12:00:00.000Z",
      }]);
    }

    if (parsedUrl.pathname.endsWith("/billing_events") && parsedUrl.searchParams.get("select") === "plan,event_type,processed_at,created_at") {
      const decodedQuery = decodeURIComponent(parsedUrl.searchParams.toString());
      assert.equal(decodedQuery.includes("event_type.ilike.*paid*"), false);
      assert.equal(decodedQuery.includes("event_type.eq.invoice.paid"), true);
      return response([{
        plan: "creator-pack",
        event_type: "checkout.completed",
        processed_at: "2026-06-20T12:00:00.000Z",
        created_at: "2026-06-20T12:00:00.000Z",
      }]);
    }

    return response([]);
  });

  assert.equal(result.latestPaidPlan, "creator-pack");
  assert.equal(result.events[0].status, "processing");
});

await run("configured Supabase history errors propagate instead of using local fallback", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes("/anonymous_clients?")) {
      return response([{ free_credits_remaining: 3, paid_credits_remaining: 0, high_resolution_downloads_unlocked: false }]);
    }
    return response({ message: "history read failed" }, { ok: false, status: 500 });
  };
  try {
    await withProcessEnvironment(supabaseEnv, async () => {
      await assert.rejects(() => getBillingHistory("anon_client"), /history read failed/);
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

await run("configured Supabase quota errors propagate when reading billing history", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes("/anonymous_clients?")) {
      return response({ message: "quota read failed" }, { ok: false, status: 500 });
    }

    return response([]);
  };

  try {
    await withProcessEnvironment(supabaseEnv, async () => {
      await assert.rejects(() => getBillingHistory("anon_client"), /quota read failed/);
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});await run("local fallback initializes old stores and returns a paid-plan summary", async () => {
  await withTempStore(async (storePath) => {
    await writeFile(
      storePath,
      `${JSON.stringify({
        version: 1,
        clients: {
          anon_client: {
            id: "anon_client",
            freeCreditsRemaining: 1,
            paidCreditsRemaining: 25,
            highResolutionDownloadsUnlocked: true,
          },
        },
        generations: [],
        creditEvents: {
          legacy: {
            id: "legacy",
            clientId: "anon_client",
            source: "creem",
            plan: "creator-pack",
            credits: 20,
            createdAt: "2026-06-20T09:00:00.000Z",
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const oldStore = await readStore(storePath);
    assert.deepEqual(oldStore.billingEvents, {});

    await recordBillingEvent({
      eventId: "evt_failed",
      eventType: "payment.failed",
      clientId: "anon_client",
      plan: "pro-monthly",
      credits: 100,
      raw: { secret: "must not reach history" },
    });
    await recordBillingEvent({
      eventId: "evt_paid",
      eventType: "checkout.completed",
      clientId: "anon_client",
      plan: "pro-monthly",
      credits: 100,
      raw: { secret: "must not reach history" },
    });

    const history = await getBillingHistory("anon_client", { limit: 50 });
    assert.deepEqual(history.summary, {
      plan: "pro-monthly",
      freeCreditsRemaining: 1,
      paidCreditsRemaining: 25,
      totalCreditsRemaining: 26,
      highResolutionDownloadsUnlocked: true,
      lastPaymentAt: history.events.find((event) => event.status === "paid")?.occurredAt,
      paymentSource: "creem",
    });
    assert.equal(history.events.length, 3);
    assert.equal(history.events.some((event) => Object.hasOwn(event, "raw")), false);
    assert.equal(history.events.some((event) => Object.hasOwn(event, "payload")), false);

    const store = await readStore(storePath);
    assert.equal(Object.keys(store.billingEvents).length, 2);
    assert.equal(store.billingEvents.evt_paid.payload, undefined);
    assert.equal(store.billingEvents.evt_paid.raw, undefined);
  });
});

await run("local history falls back to the free plan and clamps its limit", async () => {
  await withTempStore(async () => {
    await recordBillingEvent({
      eventId: "evt_pending",
      eventType: "payment.pending",
      clientId: "anon_client",
      plan: "pro-monthly",
      credits: 100,
      raw: {},
    });

    const history = await getBillingHistory("anon_client", { limit: 0 });
    assert.equal(history.summary.plan, "free");
    assert.equal(history.summary.paidCreditsRemaining, 0);
    assert.equal(history.summary.highResolutionDownloadsUnlocked, false);
    assert.equal(history.events.length, 1);
  });
});

await run("local summary plan survives more than 50 newer non-paid events", async () => {
  await withTempStore(async (storePath) => {
    const billingEvents = Object.fromEntries(Array.from({ length: 51 }, (_, index) => {
      const id = `evt_pending_${index}`;
      const occurredAt = new Date(Date.UTC(2026, 5, 22, 12, 0, 51 - index)).toISOString();
      return [id, {
        id,
        provider: "creem",
        event_type: "payment.pending",
        clientId: "anon_client",
        plan: "pro-monthly",
        credits: 100,
        processed_at: occurredAt,
        created_at: occurredAt,
        payload: { secret: true },
        owner_user_id: userId,
      }];
    }));
    await writeFile(storePath, `${JSON.stringify({
      version: 1,
      clients: { anon_client: { id: "anon_client", freeCreditsRemaining: 3, paidCreditsRemaining: 20 } },
      generations: [],
      creditEvents: {
        evt_paid_older: {
          id: "evt_paid_older",
          clientId: "anon_client",
          source: "creem",
          plan: "creator-pack",
          credits: 20,
          createdAt: "2026-06-21T12:00:00.000Z",
          payload: { secret: true },
          owner_user_id: userId,
        },
      },
      billingEvents,
    }, null, 2)}\n`, "utf8");

    const history = await getBillingHistory("anon_client", { limit: 1 });
    assert.equal(history.events.length, 1);
    assert.equal(history.events[0].id, "evt_pending_0");
    assert.equal(history.summary.plan, "creator-pack");
    assert.equal(Object.hasOwn(history.events[0], "payload"), false);
    assert.equal(Object.hasOwn(history.events[0], "owner_user_id"), false);
  });
});
await run("local billing event retries are idempotent without overwriting the original event", async () => {
  await withTempStore(async () => {
    const event = {
      eventId: "evt_retry",
      eventType: "checkout.completed",
      clientId: "anon_client",
      source: "creem",
      plan: "creator-pack",
      credits: 20,
      processedAt: "2026-06-20T09:00:00.000Z",
      raw: { secret: "first" },
    };

    await recordBillingEvent(event);
    const retryResult = await recordBillingEvent({
      ...event,
      processedAt: "2026-06-21T09:00:00.000Z",
      raw: { secret: "retry" },
    });

    assert.deepEqual(retryResult, { skipped: false, local: true, idempotent: true });
    const stored = (await readStore()).billingEvents.evt_retry;
    assert.equal(stored.processed_at, "2026-06-20T09:00:00.000Z");
    assert.equal(stored.raw, undefined);
    assert.equal(stored.payload, undefined);
  });
});

await run("local billing event retries reject immutable identity conflicts", async () => {
  await withTempStore(async () => {
    const event = {
      eventId: "evt_conflict",
      eventType: "checkout.completed",
      clientId: "anon_client",
      source: "creem",
      plan: "creator-pack",
      credits: 20,
    };
    await recordBillingEvent(event);

    const conflicts = [
      { clientId: "other_owner" },
      { source: "stripe" },
      { eventType: "payment.refunded" },
      { plan: "pro-monthly" },
      { credits: 100 },
    ];

    for (const conflict of conflicts) {
      await assert.rejects(
        () => recordBillingEvent({ ...event, ...conflict }),
        /Billing event conflict.*evt_conflict/i,
      );
    }

    const stored = (await readStore()).billingEvents.evt_conflict;
    assert.equal(stored.clientId, "anon_client");
    assert.equal(stored.provider, "creem");
    assert.equal(stored.event_type, "checkout.completed");
    assert.equal(stored.plan, "creator-pack");
    assert.equal(stored.credits, 20);
  });
});
await run("recordBillingEvent propagates configured Supabase persistence errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => response(
    { message: "billing insert failed" },
    { ok: false, status: 500 },
  );

  try {
    await withProcessEnvironment(supabaseEnv, async () => {
      await assert.rejects(
        () => recordBillingEvent({
          eventId: "evt_error",
          eventType: "checkout.completed",
          clientId: "anon_client",
          plan: "creator-pack",
          credits: 20,
          raw: {},
        }),
        /billing insert failed/,
      );
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

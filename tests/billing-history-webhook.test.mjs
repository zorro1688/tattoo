import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCreemWebhook } from "../billing-core.mjs";
import {
  addPaidCredits,
  getDownloadAccess,
  readStore,
  recordBillingEvent,
} from "../quota-store.mjs";
import { isCreditGrantingEvent } from "../billing-history-core.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function withTempStore(testBody) {
  const dir = await mkdtemp(join(tmpdir(), "inkfirst-billing-webhook-"));
  const storePath = join(dir, "store.json");
  const previousStorePath = process.env.INKFIRST_STORE_PATH;
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.INKFIRST_STORE_PATH = storePath;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    await testBody(storePath);
  } finally {
    if (previousStorePath === undefined) delete process.env.INKFIRST_STORE_PATH;
    else process.env.INKFIRST_STORE_PATH = previousStorePath;
    if (previousSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseKey;
    await rm(dir, { recursive: true, force: true });
  }
}

function signedWebhookBody({ eventType, clientId = "client-webhook", plan = "creator-pack", credits = 20, eventId }) {
  const rawBody = JSON.stringify({
    id: eventId,
    eventType,
    object: {
      metadata: {
        clientId,
        plan,
        credits: String(credits),
      },
    },
  });
  const signature = createHmac("sha256", "secret").update(rawBody).digest("hex");

  return { rawBody, signature };
}

async function processWebhookLikeHandler({ eventType, eventId, clientId = "client-webhook" }) {
  const { rawBody, signature } = signedWebhookBody({ eventType, eventId, clientId });
  const event = parseCreemWebhook(rawBody, signature, "secret");
  await recordBillingEvent(event);
  const result = isCreditGrantingEvent(event.eventType)
    ? await addPaidCredits(event.clientId, event.credits, {
        source: "creem",
        externalEventId: event.eventId,
        plan: event.plan,
      })
    : null;

  return { received: true, recorded: true, granted: Boolean(result?.granted) };
}

await run("completed webhook records billing event and grants credits once", async () => {
  await withTempStore(async () => {
    const first = await processWebhookLikeHandler({
      eventType: "checkout.completed",
      eventId: "evt_completed_once",
    });
    const second = await processWebhookLikeHandler({
      eventType: "checkout.completed",
      eventId: "evt_completed_once",
    });
    const store = await readStore();
    const access = await getDownloadAccess("client-webhook");

    assert.deepEqual(first, { received: true, recorded: true, granted: true });
    assert.deepEqual(second, { received: true, recorded: true, granted: false });
    assert.equal(Object.keys(store.billingEvents).length, 1);
    assert.equal(Object.keys(store.creditEvents).length, 1);
    assert.equal(store.clients["client-webhook"].paidCreditsRemaining, 20);
    assert.equal(access.highResolution, true);
  });
});

await run("production credit grants use Supabase without writing the read-only local store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "inkfirst-production-credit-"));
  const previousStorePath = process.env.INKFIRST_STORE_PATH;
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = globalThis.fetch;
  const userId = "00000000-0000-4000-8000-000000000099";
  const calls = [];

  process.env.INKFIRST_STORE_PATH = dir;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (url.includes("/credit_events?")) {
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001" }]),
      };
    }

    if (url.includes("/user_entitlements?")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{
          free_credits_remaining: 41,
          paid_credits_remaining: 20,
          high_resolution_downloads_unlocked: true,
        }]),
      };
    }

    throw new Error(`Unexpected Supabase request: ${url}`);
  };

  try {
    const result = await addPaidCredits(userId, 20, {
      source: "creem",
      externalEventId: "evt_production_credit",
      plan: "creator-pack",
    });

    assert.equal(result.granted, true);
    assert.equal(result.quota.freeRemaining, 41);
    assert.equal(result.quota.paidRemaining, 20);
    assert.equal(result.quota.highResolution, true);
    assert.equal(calls.some((call) => call.url.includes("/credit_events?")), true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousStorePath === undefined) delete process.env.INKFIRST_STORE_PATH;
    else process.env.INKFIRST_STORE_PATH = previousStorePath;
    if (previousSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseKey;
    await rm(dir, { recursive: true, force: true });
  }
});

for (const eventType of ["checkout.failed", "checkout.cancelled", "payment.refunded"]) {
  await run(`${eventType} webhook records but does not grant credits`, async () => {
    await withTempStore(async () => {
      const result = await processWebhookLikeHandler({
        eventType,
        eventId: `evt_${eventType.replace(/[^a-z]/g, "_")}`,
      });
      const store = await readStore();
      const access = await getDownloadAccess("client-webhook");

      assert.deepEqual(result, { received: true, recorded: true, granted: false });
      assert.equal(Object.keys(store.billingEvents).length, 1);
      assert.equal(Object.keys(store.creditEvents).length, 0);
      assert.equal(store.clients["client-webhook"]?.paidCreditsRemaining ?? 0, 0);
      assert.equal(access.highResolution, false);
    });
  });
}

await run("webhook handlers record first and grant only credit-granting event types", async () => {
  const [server, nextRoute] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile("server.mjs", "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile("app/api/webhooks/creem/route.js", "utf8")),
  ]);

  for (const source of [server, nextRoute]) {
    assert.match(source, /recordBillingEvent/);
    assert.match(source, /isCreditGrantingEvent/);
    assert.match(source, /recorded:\s*true/);
    assert.match(source, /Boolean\(result\?\.granted\)/);
  }
});

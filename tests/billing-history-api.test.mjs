import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  const directory = await mkdtemp(join(tmpdir(), "inkfirst-billing-api-"));
  const storePath = join(directory, "store.json");
  const previous = {
    INKFIRST_STORE_PATH: process.env.INKFIRST_STORE_PATH,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AUTH_COOKIE_SECRET: process.env.AUTH_COOKIE_SECRET,
  };

  process.env.INKFIRST_STORE_PATH = storePath;
  process.env.AUTH_COOKIE_SECRET = "test-auth-secret";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    await testBody(storePath);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeBillingStore(storePath) {
  await writeFile(storePath, `${JSON.stringify({
    version: 1,
    clients: {
      "00000000-0000-4000-8000-000000000001": {
        id: "00000000-0000-4000-8000-000000000001",
        freeCreditsRemaining: 1,
        paidCreditsRemaining: 20,
        highResolutionDownloadsUnlocked: true,
      },
      other_user: {
        id: "other_user",
        freeCreditsRemaining: 3,
        paidCreditsRemaining: 0,
      },
    },
    generations: [],
    creditEvents: {
      evt_paid_user: {
        id: "evt_paid_user",
        clientId: "00000000-0000-4000-8000-000000000001",
        source: "creem",
        plan: "creator-pack",
        credits: 20,
        createdAt: "2026-06-22T10:00:00.000Z",
        payload: { secret: "must not leak" },
      },
      evt_other: {
        id: "evt_other",
        clientId: "other_user",
        source: "creem",
        plan: "pro-monthly",
        credits: 50,
        createdAt: "2026-06-22T11:00:00.000Z",
      },
    },
    billingEvents: {
      evt_failed_user: {
        id: "evt_failed_user",
        provider: "creem",
        event_type: "checkout.failed",
        clientId: "00000000-0000-4000-8000-000000000001",
        plan: "creator-pack",
        credits: 20,
        processed_at: "2026-06-23T10:00:00.000Z",
        payload: { secret: "must not leak" },
      },
    },
  }, null, 2)}\n`, "utf8");
}

await run("Next billing events API requires a signed-in account", async () => {
  const route = await readFile("app/api/billing-events/route.js", "utf8");

  assert.match(route, /getClientSession/);
  assert.match(route, /session\.isAuthenticated/);
  assert.match(route, /session\.userId/);
  assert.match(route, /Sign in to view billing history/);
  assert.match(route, /status:\s*401/);
});

await run("billing history data contains only the signed-in user's safe history", async () => {
  await withTempStore(async (storePath) => {
    await writeBillingStore(storePath);
    const { getBillingHistory } = await import(`../quota-store.mjs?history=${Date.now()}`);
    const body = await getBillingHistory("00000000-0000-4000-8000-000000000001", { limit: 1 });

    assert.deepEqual(body.summary, {
      plan: "creator-pack",
      freeCreditsRemaining: 1,
      paidCreditsRemaining: 20,
      totalCreditsRemaining: 21,
      highResolutionDownloadsUnlocked: true,
      lastPaymentAt: "2026-06-22T10:00:00.000Z",
      paymentSource: "creem",
    });
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].id, "evt_failed_user");
    assert.equal(body.events.some((event) => event.id === "evt_other"), false);
    assert.equal(JSON.stringify(body).includes("payload"), false);
    assert.equal(JSON.stringify(body).includes("must not leak"), false);
  });
});

await run("static server exposes an authenticated billing events endpoint", async () => {
  const server = await readFile("server.mjs", "utf8");

  assert.match(server, /\/api\/billing-events/);
  assert.match(server, /getBillingHistory/);
  assert.match(server, /session\.isAuthenticated/);
  assert.match(server, /Sign in to view billing history/);
  assert.match(server, /limit:\s*Number\(url\.searchParams\.get\("limit"\) \?\? 20\)/);
});

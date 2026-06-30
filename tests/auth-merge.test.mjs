import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addPaidCredits,
  consumeGenerationCredit,
  getDownloadAccess,
  getQuotaState,
  listGenerations,
  mergeLocalAnonymousClientIntoUser,
  readStore
} from "../quota-store.mjs";
import { mergeAnonymousClientIntoUser } from "../supabase-store.mjs";

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
  const dir = await mkdtemp(join(tmpdir(), "inkfirst-auth-merge-"));
  const storePath = join(dir, "store.json");

  try {
    await testBody(storePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
};

await run("mergeAnonymousClientIntoUser moves quota, history, and credit events to user id", async () => {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });

    if (url.includes("/anonymous_clients?")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([
          {
            free_credits_remaining: 1,
            paid_credits_remaining: 20,
            high_resolution_downloads_unlocked: true
          }
        ])
      };
    }

    if (url.includes("/user_entitlements?")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([])
      };
    }

    return { ok: true, status: 204, text: async () => "" };
  };

  const result = await mergeAnonymousClientIntoUser(
    "anon_123",
    {
      id: "00000000-0000-4000-8000-000000000001",
      email: "user@example.com"
    },
    env,
    fetchMock
  );

  assert.equal(result.merged, true);
  assert.match(calls.find((call) => call.url.includes("/profiles"))?.url, /\/profiles/);
  assert.match(calls.find((call) => call.url.includes("/user_entitlements"))?.url, /\/user_entitlements/);
  assert.match(calls.find((call) => call.url.includes("/generations"))?.url, /anonymous_client_id=eq\.anon_123/);
  assert.match(calls.find((call) => call.url.includes("/credit_events"))?.url, /anonymous_client_id=eq\.anon_123/);
  const billingCall = calls.find((call) => call.url.includes("/billing_events"));
  assert.match(billingCall?.url, /anonymous_client_id=eq\.anon_123/);
  assert.match(billingCall?.url, /owner_user_id=is\.null/);
  assert.equal(billingCall.options.method, "PATCH");
  assert.deepEqual(JSON.parse(billingCall.options.body), {
    owner_user_id: "00000000-0000-4000-8000-000000000001",
    anonymous_client_id: null
  });

  const entitlementCall = calls.find((call) => call.url.includes("/user_entitlements?on_conflict=user_id"));
  const entitlement = JSON.parse(entitlementCall.options.body);
  assert.equal(entitlement.user_id, "00000000-0000-4000-8000-000000000001");
  assert.equal(entitlement.free_credits_remaining, 1);
  assert.equal(entitlement.paid_credits_remaining, 20);
  assert.equal(entitlement.high_resolution_downloads_unlocked, true);
});

await run("local anonymous client data is available under the signed-in user id", async () => {
  await withTempStore(async (storePath) => {
    const anonymousClientId = "anon_local_123";
    const userId = "00000000-0000-4000-8000-000000000001";
    await consumeGenerationCredit(
      anonymousClientId,
      {
        idea: "small rose with moon",
        style: "Fine line",
        placement: "Forearm",
        size: "Small",
        complexity: "Beginner friendly"
      },
      {
        id: "replicate-123",
        provider: "replicate",
        model: "black-forest-labs/flux-schnell",
        status: "succeeded",
        prompt: "fine line rose moon tattoo",
        placementNote: "Forearm guidance",
        images: {
          concept: "https://replicate.delivery/example.webp"
        }
      },
      storePath
    );
    await addPaidCredits(
      anonymousClientId,
      20,
      {
        source: "creem",
        externalEventId: "evt_local_merge",
        plan: "creator-pack"
      },
      storePath
    );
    const store = await readStore(storePath);
    store.billingEvents.evt_local_billing_merge = {
      id: "evt_local_billing_merge",
      provider: "creem",
      event_type: "checkout.completed",
      clientId: anonymousClientId,
      plan: "creator-pack",
      credits: 20,
      processed_at: "2026-06-22T12:00:00.000Z",
      created_at: "2026-06-22T12:00:00.000Z"
    };
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

    const result = await mergeLocalAnonymousClientIntoUser(anonymousClientId, { id: userId }, storePath);
    const quota = await getQuotaState(userId, storePath);
    const history = await listGenerations(userId, { limit: 5 }, storePath);
    const access = await getDownloadAccess(userId, storePath);

    assert.equal(result.merged, true);
    assert.equal(quota.freeRemaining, 2);
    assert.equal(quota.paidRemaining, 20);
    assert.equal(quota.highResolution, true);
    assert.equal(history.length, 1);
    assert.equal(history[0].input.idea, "small rose with moon");
    assert.equal(access.highResolution, true);
    assert.equal((await readStore(storePath)).billingEvents.evt_local_billing_merge.clientId, userId);
  });
});

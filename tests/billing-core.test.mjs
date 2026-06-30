import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createCreemCheckout,
  getPlan,
  parseCreemWebhook
} from "../billing-core.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run("Creator Pack maps to 20 credits", () => {
  assert.equal(getPlan("creator-pack").credits, 20);
  assert.equal(getPlan("pro-monthly").credits, 50);
  assert.equal(getPlan("pro-yearly").credits, 600);
});

await run("createCreemCheckout posts to Creem and returns a checkout URL", async () => {
  const calls = [];
  const result = await createCreemCheckout(
    {
      plan: "creator-pack",
      clientId: "client-a",
      origin: "https://inkfirst.test"
    },
    {
      CREEM_API_KEY: "creem_test_key",
      CREEM_CREATOR_PACK_PRODUCT_ID: "prod_creator"
    },
    async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          checkout_url: "https://checkout.creem.io/test"
        })
      };
    }
  );

  const body = JSON.parse(calls[0].init.body);

  assert.equal(calls[0].url, "https://test-api.creem.io/v1/checkouts");
  assert.equal(calls[0].init.headers["x-api-key"], "creem_test_key");
  assert.equal(body.product_id, "prod_creator");
  assert.match(body.request_id, /^inkfirst_client-a_creator-pack_/);
  assert.equal(body.metadata.clientId, "client-a");
  assert.equal(body.metadata.plan, "creator-pack");
  assert.equal(body.metadata.credits, "20");
  assert.equal(result.checkoutUrl, "https://checkout.creem.io/test");
  assert.equal(body.cancel_url, undefined);
  assert.equal(body.cancelUrl, undefined);
});

await run("createCreemCheckout sends users to success page with optional return path", async () => {
  const calls = [];
  await createCreemCheckout(
    {
      plan: "pro-monthly",
      clientId: "client-a",
      origin: "https://inkfirst.test",
      returnTo: "/design?id=gen_123"
    },
    {
      CREEM_API_KEY: "creem_test_key",
      CREEM_PRO_MONTHLY_PRODUCT_ID: "prod_pro"
    },
    async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          checkout_url: "https://checkout.creem.io/test"
        })
      };
    }
  );

  const body = JSON.parse(calls[0].init.body);

  assert.equal(
    body.success_url,
    "https://inkfirst.test/success?checkout=success&plan=pro-monthly&returnTo=%2Fdesign%3Fid%3Dgen_123"
  );
});

await run("createCreemCheckout rejects missing product ids", async () => {
  await assert.rejects(
    () =>
      createCreemCheckout(
        { plan: "creator-pack", clientId: "client-a", origin: "https://inkfirst.test" },
        { CREEM_API_KEY: "creem_test_key" },
        async () => ({ ok: true, json: async () => ({}) })
      ),
    /CREEM_CREATOR_PACK_PRODUCT_ID/
  );
});

await run("parseCreemWebhook verifies signature and extracts metadata", () => {
  const rawBody = JSON.stringify({
    id: "evt_123",
    eventType: "checkout.completed",
    object: {
      metadata: {
        clientId: "client-a",
        plan: "creator-pack",
        credits: "20"
      }
    }
  });
  const signature = createHmac("sha256", "secret").update(rawBody).digest("hex");
  const parsed = parseCreemWebhook(rawBody, signature, "secret");

  assert.equal(parsed.eventId, "evt_123");
  assert.equal(parsed.clientId, "client-a");
  assert.equal(parsed.plan, "creator-pack");
  assert.equal(parsed.credits, 20);
});

await run("parseCreemWebhook accepts prefixed signature headers", () => {
  const rawBody = JSON.stringify({
    id: "evt_prefixed",
    eventType: "checkout.completed",
    object: {
      metadata: {
        clientId: "client-a",
        plan: "creator-pack",
        credits: "20"
      }
    }
  });
  const signature = createHmac("sha256", "secret").update(rawBody).digest("hex");

  for (const header of [`sha256=${signature}`, `t=123456789,v1=${signature}`, `v1=${signature}`]) {
    const parsed = parseCreemWebhook(rawBody, header, "secret");
    assert.equal(parsed.eventId, "evt_prefixed");
    assert.equal(parsed.clientId, "client-a");
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseCreemWebhook } from "../billing-core.mjs";
import { addPaidCredits, getDownloadAccess, readStore } from "../quota-store.mjs";

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
  const dir = await mkdtemp(join(tmpdir(), "inkfirst-creem-webhook-"));
  const storePath = join(dir, "store.json");

  try {
    await testBody(storePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function signedWebhookBody({ clientId, plan, credits, eventId }) {
  const rawBody = JSON.stringify({
    id: eventId,
    eventType: "checkout.completed",
    object: {
      metadata: {
        clientId,
        plan,
        credits: String(credits)
      }
    }
  });
  const signature = createHmac("sha256", "secret").update(rawBody).digest("hex");

  return { rawBody, signature };
}

await run("Creator Pack webhook unlocks high-resolution downloads", async () => {
  await withTempStore(async (storePath) => {
    const { rawBody, signature } = signedWebhookBody({
      clientId: "client-creator",
      plan: "creator-pack",
      credits: 20,
      eventId: "evt_creator_paid"
    });
    const event = parseCreemWebhook(rawBody, signature, "secret");
    const result = await addPaidCredits(
      event.clientId,
      event.credits,
      {
        source: "creem",
        externalEventId: event.eventId,
        plan: event.plan
      },
      storePath
    );
    const access = await getDownloadAccess("client-creator", storePath);
    const store = await readStore(storePath);

    assert.equal(result.granted, true);
    assert.equal(store.clients["client-creator"].highResolutionDownloadsUnlocked, true);
    assert.equal(access.highResolution, true);
    assert.equal(access.watermarked, false);
  });
});

await run("Pro webhook unlocks high-resolution downloads", async () => {
  await withTempStore(async (storePath) => {
    const { rawBody, signature } = signedWebhookBody({
      clientId: "client-pro",
      plan: "pro-monthly",
      credits: 50,
      eventId: "evt_pro_paid"
    });
    const event = parseCreemWebhook(rawBody, signature, "secret");
    await addPaidCredits(
      event.clientId,
      event.credits,
      {
        source: "creem",
        externalEventId: event.eventId,
        plan: event.plan
      },
      storePath
    );
    const access = await getDownloadAccess("client-pro", storePath);

    assert.equal(access.highResolution, true);
    assert.equal(access.message, "High-resolution downloads are unlocked");
  });
});

await run("static and Next servers accept singular and plural Creem webhook paths", async () => {
  const server = await readFile("server.mjs", "utf8");
  const nextAlias = await readFile("app/api/webhook/creem/route.js", "utf8");

  assert.match(server, /\/api\/webhooks\/creem/);
  assert.match(server, /\/api\/webhook\/creem/);
  assert.match(nextAlias, /webhooks\/creem\/route\.js/);
});

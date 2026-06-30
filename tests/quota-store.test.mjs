import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addPaidCredits,
  buildClientCookie,
  consumeLineworkCredit,
  consumeGenerationCredit,
  getGeneration,
  getClientSession,
  getQuotaState,
  listGenerations,
  readStore
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

async function withTempStore(testBody) {
  const dir = await mkdtemp(join(tmpdir(), "inkfirst-store-"));
  const storePath = join(dir, "store.json");

  try {
    await testBody(storePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const input = {
  idea: "small rose with moon",
  style: "Fine line",
  placement: "Forearm",
  size: "Small",
  complexity: "Beginner friendly"
};

const generation = {
  id: "replicate-123",
  provider: "replicate",
  model: "black-forest-labs/flux-schnell",
  status: "succeeded",
  prompt: "fine line tattoo design of small rose with moon",
  placementNote: "Forearm guidance",
  images: {
    concept: "https://replicate.delivery/example.webp",
    linework: "/assets/hero-linework.png",
    placement: "/assets/hero-placement.png"
  }
};

await run("new client starts with three free credits", async () => {
  await withTempStore(async (storePath) => {
    const quota = await getQuotaState("client-a", storePath);

    assert.equal(quota.freeRemaining, 3);
    assert.equal(quota.paidRemaining, 0);
    assert.equal(quota.totalRemaining, 3);
  });
});

await run("successful generation is saved and consumes one free credit", async () => {
  await withTempStore(async (storePath) => {
    const result = await consumeGenerationCredit("client-a", input, generation, storePath);
    const store = await readStore(storePath);

    assert.equal(result.quota.freeRemaining, 2);
    assert.equal(result.generation.id.startsWith("gen_"), true);
    assert.equal(store.generations.length, 1);
    assert.equal(store.generations[0].clientId, "client-a");
    assert.equal(store.generations[0].input.idea, "small rose with moon");
    assert.equal(store.generations[0].images.concept, "https://replicate.delivery/example.webp");
  });
});

await run("client is blocked after all free credits are consumed", async () => {
  await withTempStore(async (storePath) => {
    await consumeGenerationCredit("client-a", input, generation, storePath);
    await consumeGenerationCredit("client-a", input, generation, storePath);
    await consumeGenerationCredit("client-a", input, generation, storePath);

    await assert.rejects(
      () => consumeGenerationCredit("client-a", input, generation, storePath),
      /No generation credits remaining/
    );
  });
});

await run("client session reuses cookie id and creates a cookie for new visitors", () => {
  const existing = getClientSession("inkfirst_client_id=client-existing; theme=light");
  const fresh = getClientSession("");
  const cookie = buildClientCookie(fresh.clientId);

  assert.equal(existing.clientId, "client-existing");
  assert.equal(existing.isNew, false);
  assert.equal(fresh.isNew, true);
  assert.match(cookie, /inkfirst_client_id=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

await run("paid credits can be granted once per external event", async () => {
  await withTempStore(async (storePath) => {
    const first = await addPaidCredits(
      "client-a",
      20,
      {
        source: "creem",
        externalEventId: "evt_123",
        plan: "creator-pack"
      },
      storePath
    );
    const second = await addPaidCredits(
      "client-a",
      20,
      {
        source: "creem",
        externalEventId: "evt_123",
        plan: "creator-pack"
      },
      storePath
    );

    assert.equal(first.granted, true);
    assert.equal(first.quota.paidRemaining, 20);
    assert.equal(second.granted, false);
    assert.equal(second.quota.paidRemaining, 20);
  });
});

await run("generation history only returns the current client's recent designs", async () => {
  await withTempStore(async (storePath) => {
    await consumeGenerationCredit("client-a", { ...input, idea: "first idea" }, generation, storePath);
    await consumeGenerationCredit("client-b", { ...input, idea: "other user" }, generation, storePath);
    await consumeGenerationCredit("client-a", { ...input, idea: "second idea" }, generation, storePath);

    const history = await listGenerations("client-a", { limit: 5 }, storePath);

    assert.equal(history.length, 2);
    assert.equal(history[0].input.idea, "second idea");
    assert.equal(history[1].input.idea, "first idea");
    assert.equal(history.every((item) => item.clientId === undefined), true);
  });
});

await run("linework generation updates the saved design and consumes one credit", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit("client-a", input, generation, storePath);
    const updated = await consumeLineworkCredit(
      "client-a",
      saved.generation.id,
      {
        id: "linework_123",
        provider: "replicate",
        model: "black-forest-labs/flux-canny-pro",
        status: "succeeded",
        images: {
          linework: "https://replicate.delivery/linework.webp"
        }
      },
      storePath
    );
    const record = await getGeneration("client-a", saved.generation.id, storePath);

    assert.equal(updated.quota.freeRemaining, 1);
    assert.equal(record.images.linework, "https://replicate.delivery/linework.webp");
    assert.equal(record.lineworkProviderGenerationId, "linework_123");
  });
});

await run("linework generation is blocked when no credits remain", async () => {
  await withTempStore(async (storePath) => {
    const first = await consumeGenerationCredit("client-a", { ...input, idea: "first" }, generation, storePath);
    await consumeGenerationCredit("client-a", { ...input, idea: "second" }, generation, storePath);
    await consumeGenerationCredit("client-a", { ...input, idea: "third" }, generation, storePath);

    await assert.rejects(
      () => consumeLineworkCredit(
        "client-a",
        first.generation.id,
        {
          id: "linework_no_credit",
          provider: "replicate",
          model: "black-forest-labs/flux-canny-pro",
          status: "succeeded",
          images: {
            linework: "https://replicate.delivery/blocked-linework.webp"
          }
        },
        storePath
      ),
      /No generation credits remaining/
    );

    const record = await getGeneration("client-a", first.generation.id, storePath);
    assert.equal(record.images.linework, "/assets/hero-linework.png");
  });
});
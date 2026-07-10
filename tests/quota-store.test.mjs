import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addPaidCredits,
  buildClientCookie,
  consumeLineworkCredit,
  consumeGenerationCredit,
  getGeneration,
  updateGenerationConceptSelection,
  updateGenerationPlacementAdjustment,
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

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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


await run("selected concept candidate updates the saved main concept and clears dependent previews", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit(
      "client-a",
      input,
      {
        ...generation,
        conceptCandidates: [
          "https://replicate.delivery/concept-a.webp",
          "https://replicate.delivery/concept-b.webp"
        ],
        images: {
          concept: "https://replicate.delivery/concept-a.webp",
          linework: "https://replicate.delivery/linework-a.webp",
          placement: "https://replicate.delivery/placement-a.webp"
        }
      },
      storePath
    );

    await updateGenerationConceptSelection(
      "client-a",
      saved.generation.id,
      "https://replicate.delivery/concept-b.webp",
      storePath
    );

    const record = await getGeneration("client-a", saved.generation.id, storePath);

    assert.equal(record.images.concept, "https://replicate.delivery/concept-b.webp");
    assert.equal(record.images.linework, undefined);
    assert.equal(record.images.placement, undefined);
    assert.deepEqual(record.conceptCandidates, [
      "https://replicate.delivery/concept-a.webp",
      "https://replicate.delivery/concept-b.webp"
    ]);
  });
});

await run("re-saving the active concept does not clear completed linework", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit(
      "client-a",
      input,
      {
        ...generation,
        conceptCandidates: ["https://replicate.delivery/concept-a.webp"],
        images: {
          concept: "https://replicate.delivery/concept-a.webp",
          linework: "https://replicate.delivery/linework-a.webp",
          placement: "https://replicate.delivery/placement-a.webp"
        }
      },
      storePath
    );

    await updateGenerationConceptSelection(
      "client-a",
      saved.generation.id,
      "https://replicate.delivery/concept-a.webp",
      storePath
    );

    const record = await getGeneration("client-a", saved.generation.id, storePath);

    assert.equal(record.images.linework, "https://replicate.delivery/linework-a.webp");
    assert.equal(record.images.placement, "https://replicate.delivery/placement-a.webp");
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
await run("Supabase-backed generation does not write local store when quota row is missing", async () => {
  await withTempStore(async (storePath) => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET
    };
    const calls = [];

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.SUPABASE_STORAGE_BUCKET = "inkfirst-designs";
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method ?? "GET" });

      if (String(url).includes("/anonymous_clients?") && (options.method ?? "GET") === "GET") {
        return new Response("[]", { status: 200 });
      }

      if (String(url).includes("/generations?select=id")) {
        return Response.json([{ id: "00000000-0000-4000-8000-000000000001" }]);
      }

      return new Response("null", { status: 200 });
    };

    try {
      const localAssetGeneration = {
        ...generation,
        images: {
          concept: "/assets/hero-concept.png",
          linework: "/assets/hero-linework.png",
          placement: "/assets/hero-placement.png"
        }
      };
      const result = await consumeGenerationCredit("client-supabase", input, localAssetGeneration, storePath);

      assert.equal(result.quota.freeRemaining, 2);
      assert.equal(await fileExists(storePath), false);
      assert.equal(calls.some((call) => call.url.includes("/generations?select=id")), true);
      assert.equal(calls.some((call) => call.url.includes("/storage/v1/object/inkfirst-designs/")), true);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});


await run("generation placement adjustment can be saved and reloaded", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit("client-placement", input, generation, storePath);
    const adjustment = { x: 0.62, y: 0.41, scale: 1.28, rotation: -11 };

    const updated = await updateGenerationPlacementAdjustment(
      "client-placement",
      saved.generation.id,
      adjustment,
      storePath
    );
    const reloaded = await getGeneration("client-placement", saved.generation.id, storePath);

    assert.deepEqual(updated.generation.placementAdjustment, adjustment);
    assert.deepEqual(reloaded.placementAdjustment, adjustment);
  });
});

await run("generation placement adjustment rejects unsafe values", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit("client-placement", input, generation, storePath);

    await assert.rejects(
      () => updateGenerationPlacementAdjustment(
        "client-placement",
        saved.generation.id,
        { x: 3, y: 0.5, scale: 99, rotation: 400 },
        storePath
      ),
      /Invalid placement adjustment/
    );
  });
});

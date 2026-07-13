import assert from "node:assert/strict";
import sharp from "sharp";
import {
  fetchOwnedStorageImage,
  getDownloadAccessFromSupabase,
  getGenerationFromSupabase,
  getQuotaFromSupabase,
  listGenerationsFromSupabase,
  prepareConceptCandidatesForSupabase,
  persistConceptSelectionToSupabase,
  persistCreditEventToSupabase,
  persistGenerationToSupabase,
  persistLineworkToSupabase,
  persistPlacementAdjustmentToSupabase
} from "../supabase-store.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_STORAGE_BUCKET: "inkfirst-designs"
};

const savedGeneration = {
  id: "gen_local_123",
  clientId: "anon_client",
  providerGenerationId: "replicate-123",
  provider: "replicate",
  model: "black-forest-labs/flux-schnell",
  status: "succeeded",
  prompt: "fine line tattoo design",
  placementNote: "Forearm guidance",
  placementAdjustment: { x: 0.61, y: 0.37, scale: 1.24, rotation: -14 },
  images: {
    concept: "https://replicate.delivery/concept.webp",
    placement: "/assets/hero-placement.png"
  },
  input: {
    idea: "small rose with moon",
    style: "Fine line",
    placement: "Forearm",
    size: "Small",
    complexity: "Beginner friendly"
  },
  createdAt: "2026-06-17T00:00:00.000Z"
};

function createFetchMock() {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });

    if (url.includes("replicate.delivery")) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => "image/webp"
        },
        arrayBuffer: async () => Buffer.from(`source:${url}`)
      };
    }

    if (url.includes("/storage/v1/object/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ Key: "inkfirst-designs/anonymous/anon_client/gen_local_123/concept.webp" })
      };
    }

    if (url.includes("/generations?select=id")) {
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify([{ id: "00000000-0000-0000-0000-000000000001" }])
      };
    }

    if (url.includes("/generations?") && options.method === "GET") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: "00000000-0000-0000-0000-000000000001" }])
      };
    }

    return {
      ok: true,
      status: 204,
      text: async () => ""
    };
  };

  return { calls, fetchMock };
}

function createLineworkPersistenceFetchMock() {
  const base = createFetchMock();
  const fetchMock = async (url, options = {}) => {
    if (url.includes("generation_assets") && options.method === "GET") {
      base.calls.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "00000000-0000-0000-0000-000000000001", local_generation_id: "gen_local_123", status: "succeeded", input_idea: "small rose with moon", input_style: "Fine line", input_placement: "Forearm", input_size: "Small", input_complexity: "Beginner friendly", created_at: "2026-06-17T00:00:00.000Z", updated_at: "2026-06-17T00:01:00.000Z", generation_assets: [{ asset_type: "linework", storage_bucket: "inkfirst-designs", storage_path: "anonymous/anon_client/gen_local_123/linework.webp", source_url: "https://replicate.delivery/linework.webp" }] }]) };
    }
    return base.fetchMock(url, options);
  };
  return { calls: base.calls, fetchMock };
}

function createReadFetchMock() {
  const calls = [];
  const row = {
    id: "00000000-0000-0000-0000-000000000001",
    local_generation_id: "gen_local_123",
    provider_generation_id: "replicate-123",
    provider: "replicate",
    model: "black-forest-labs/flux-schnell",
    status: "succeeded",
    prompt: "fine line tattoo design",
    placement_note: "Forearm guidance",
    placement_adjustment: { x: 0.61, y: 0.37, scale: 1.24, rotation: -14 },
    input_idea: "small rose with moon",
    input_style: "Fine line",
    input_placement: "Forearm",
    input_size: "Small",
    input_complexity: "Beginner friendly",
    created_at: "2026-06-17T00:00:00.000Z",
    updated_at: "2026-06-17T00:01:00.000Z",
    generation_assets: [
      {
        asset_type: "concept",
        storage_bucket: "inkfirst-designs",
        storage_path: "anonymous/anon_client/gen_local_123/concept.webp",
        source_url: "https://replicate.delivery/concept.webp"
      },
      {
        asset_type: "linework",
        storage_bucket: "inkfirst-designs",
        storage_path: "anonymous/anon_client/gen_local_123/linework.webp",
        source_url: "https://replicate.delivery/linework.webp"
      }
    ]
  };
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([row])
    };
  };

  return { calls, fetchMock };
}

function createQuotaFetchMock() {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
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
  };

  return { calls, fetchMock };
}

await run("Supabase generation persistence is skipped when env is missing", async () => {
  const result = await persistGenerationToSupabase("anon_client", savedGeneration, {}, {}, async () => {
    throw new Error("fetch should not be called");
  });

  assert.equal(result.skipped, true);
});

await run("Supabase generation persistence writes client, generation, and assets", async () => {
  const { calls, fetchMock } = createFetchMock();
  const result = await persistGenerationToSupabase(
    "anon_client",
    savedGeneration,
    { freeRemaining: 2, paidRemaining: 0, highResolution: false },
    env,
    fetchMock
  );

  const serviceCalls = calls.filter((call) => !call.url.includes("replicate.delivery"));
  assert.equal(result.skipped, false);
  assert.equal(serviceCalls.length, 5);
  assert.match(serviceCalls[0].url, /\/anonymous_clients\?on_conflict=id$/);
  assert.match(serviceCalls[1].url, /\/generations\?select=id$/);
  assert.match(serviceCalls[2].url, /\/storage\/v1\/object\/inkfirst-designs\/anonymous\/anon_client\/gen_local_123\/concept\.webp$/);
  assert.match(serviceCalls[3].url, /\/storage\/v1\/object\/inkfirst-designs\/anonymous\/anon_client\/gen_local_123\/placement\.png$/);
  assert.match(serviceCalls[4].url, /\/generation_assets\?on_conflict=generation_id,asset_type,is_watermarked$/);

  const generationBody = JSON.parse(serviceCalls[1].options.body);
  assert.equal(generationBody.local_generation_id, "gen_local_123");
  assert.equal(generationBody.anonymous_client_id, "anon_client");
  assert.equal(generationBody.input_idea, "small rose with moon");
  assert.deepEqual(generationBody.placement_adjustment, { x: 0.61, y: 0.37, scale: 1.24, rotation: -14 });

  const assetsBody = JSON.parse(serviceCalls[4].options.body);
  assert.equal(assetsBody.length, 2);
  assert.equal(assetsBody[0].asset_type, "concept");
  assert.equal(assetsBody[0].storage_path, "anonymous/anon_client/gen_local_123/concept.webp");
});

await run("Supabase generation persistence uploads normalized data URL concept images", async () => {
  const { calls, fetchMock } = createFetchMock();
  const pngDataUrl = `data:image/png;base64,${Buffer.from("normalized-png").toString("base64")}`;
  const result = await persistGenerationToSupabase(
    "anon_client",
    {
      ...savedGeneration,
      images: {
        concept: pngDataUrl
      }
    },
    { freeRemaining: 2, paidRemaining: 0, highResolution: false },
    env,
    fetchMock
  );

  const serviceCalls = calls.filter((call) => !call.url.includes("replicate.delivery"));
  assert.equal(result.skipped, false);
  assert.match(serviceCalls[2].url, /\/storage\/v1\/object\/inkfirst-designs\/anonymous\/anon_client\/gen_local_123\/concept\.png$/);
  assert.equal(serviceCalls[2].options.headers["Content-Type"], "image/png");
  assert.equal(Buffer.from(serviceCalls[2].options.body).toString(), "normalized-png");

  const assetsBody = JSON.parse(serviceCalls[3].options.body);
  assert.equal(assetsBody[0].storage_path, "anonymous/anon_client/gen_local_123/concept.png");
  assert.equal(assetsBody[0].content_type, "image/png");
});

await run("Supabase generation persistence stores signed-in user assets under users prefix", async () => {
  const { calls, fetchMock } = createFetchMock();
  const userId = "00000000-0000-4000-8000-000000000001";
  const result = await persistGenerationToSupabase(
    userId,
    { ...savedGeneration, clientId: userId },
    { freeRemaining: 2, paidRemaining: 0, highResolution: false },
    env,
    fetchMock
  );

  const serviceCalls = calls.filter((call) => !call.url.includes("replicate.delivery"));
  assert.equal(result.skipped, false);
  assert.match(serviceCalls[2].url, /\/storage\/v1\/object\/inkfirst-designs\/users\/00000000-0000-4000-8000-000000000001\/gen_local_123\/concept\.webp$/);

  const generationBody = JSON.parse(serviceCalls[1].options.body);
  assert.equal(generationBody.owner_user_id, userId);
  assert.equal(generationBody.anonymous_client_id, undefined);

  const assetsBody = JSON.parse(serviceCalls[4].options.body);
  assert.equal(assetsBody[0].storage_path, "users/00000000-0000-4000-8000-000000000001/gen_local_123/concept.webp");
});

await run("Supabase concept candidates are normalized, uploaded, and exposed through app image URLs", async () => {
  const blackConcept = await sharp({
    create: {
      width: 24,
      height: 24,
      channels: 3,
      background: "#000000"
    }
  }).png().toBuffer();
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });

    if (url.includes("replicate.delivery")) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => "image/png"
        },
        arrayBuffer: async () => blackConcept
      };
    }

    if (url.includes("/storage/v1/object/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ Key: "stored" })
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const generation = {
    ...savedGeneration,
    images: {
      concept: "https://replicate.delivery/dark-1.png"
    },
    conceptCandidates: [
      "https://replicate.delivery/dark-1.png",
      "https://replicate.delivery/dark-2.png"
    ]
  };

  const result = await prepareConceptCandidatesForSupabase("anon_client", generation, env, fetchMock);
  const storageCalls = calls.filter((call) => call.url.includes("/storage/v1/object/"));

  assert.equal(result.skipped, false);
  assert.equal(generation.conceptCandidates.length, 2);
  assert.equal(generation.conceptCandidates.every((url) => url.startsWith("/api/storage-image?path=")), true);
  assert.equal(generation.conceptCandidates.some((url) => url.startsWith("data:")), false);
  assert.equal(generation.images.concept, generation.conceptCandidates[0]);
  assert.match(decodeURIComponent(generation.conceptCandidates[0]), /anonymous\/anon_client\/gen_local_123\/concept-candidates\/1\.png/);
  assert.equal(storageCalls.length, 2);
  assert.match(storageCalls[0].url, /\/storage\/v1\/object\/inkfirst-designs\/anonymous\/anon_client\/gen_local_123\/concept-candidates\/1\.png$/);
  assert.equal(storageCalls[0].options.headers["Content-Type"], "image/png");

  const uploadedPixel = await sharp(Buffer.from(storageCalls[0].options.body))
    .resize(1, 1)
    .raw()
    .toBuffer();
  assert.ok(uploadedPixel[0] > 240);
});

await run("Supabase owned storage image fetch only serves the current owner prefix", async () => {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: {
        get: () => "image/png"
      },
      arrayBuffer: async () => Buffer.from("stored-image")
    };
  };

  const allowed = await fetchOwnedStorageImage(
    "anon_client",
    "anonymous/anon_client/gen_local_123/concept-candidates/1.png",
    env,
    fetchMock
  );
  const denied = await fetchOwnedStorageImage(
    "anon_client",
    "anonymous/other_client/gen_local_123/concept-candidates/1.png",
    env,
    fetchMock
  );

  assert.equal(allowed.ok, true);
  assert.equal(allowed.contentType, "image/png");
  assert.equal(Buffer.from(allowed.body).toString(), "stored-image");
  assert.equal(denied, null);
  assert.equal(calls.length, 1);
});

await run("Supabase linework persistence updates the saved generation asset", async () => {
  const { calls, fetchMock } = createLineworkPersistenceFetchMock();
  const updated = {
    ...savedGeneration,
    images: {
      ...savedGeneration.images,
      linework: "https://replicate.delivery/linework.webp"
    },
    lineworkStatus: "succeeded",
    updatedAt: "2026-06-17T00:01:00.000Z"
  };

  const result = await persistLineworkToSupabase(
    "anon_client",
    updated,
    { freeRemaining: 1, paidRemaining: 0, highResolution: false },
    env,
    fetchMock
  );

  const serviceCalls = calls.filter((call) => !call.url.includes("replicate.delivery"));
  assert.equal(result.skipped, false);
  assert.equal(serviceCalls.length, 6);
  assert.match(serviceCalls[0].url, /\/generations\?/);
  assert.equal(serviceCalls[1].options.method, "PATCH");
  assert.match(serviceCalls[2].url, /\/storage\/v1\/object\/inkfirst-designs\/anonymous\/anon_client\/gen_local_123\/linework\.webp$/);
  assert.match(serviceCalls[4].url, /generation_assets/);

  const assetsBody = JSON.parse(serviceCalls[3].options.body);
  assert.equal(assetsBody.length, 1);
  assert.equal(assetsBody[0].asset_type, "linework");
  assert.equal(assetsBody[0].storage_path, "anonymous/anon_client/gen_local_123/linework.webp");
});



await run("Supabase linework persistence fails before charging when the saved generation is missing", async () => {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/generations?") && options.method === "GET") {
      return { ok: true, status: 200, text: async () => "[]" };
    }
    return { ok: true, status: 204, text: async () => "" };
  };

  await assert.rejects(
    () => persistLineworkToSupabase(
      "anon_client",
      { ...savedGeneration, images: { ...savedGeneration.images, linework: "https://replicate.delivery/linework.webp" } },
      { freeRemaining: 1, paidRemaining: 0, highResolution: false },
      env,
      fetchMock
    ),
    /Saved generation was not found/
  );

  assert.equal(calls.some((call) => call.url.includes("/user_entitlements")), false);
  assert.equal(calls.some((call) => call.url.includes("/anonymous_clients") && call.options.method === "POST"), false);
});

await run("Supabase placement adjustment persistence patches the saved generation", async () => {
  const { calls, fetchMock } = createFetchMock();
  const result = await persistPlacementAdjustmentToSupabase(
    "anon_client",
    "gen_local_123",
    { x: 0.52, y: 0.44, scale: 1.12, rotation: 6 },
    env,
    fetchMock
  );

  assert.equal(result.skipped, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/generations\?/);
  assert.match(calls[0].url, /local_generation_id=eq\.gen_local_123/);
  assert.equal(calls[0].options.method, "PATCH");
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.placement_adjustment, { x: 0.52, y: 0.44, scale: 1.12, rotation: 6 });
});

await run("Supabase credit persistence writes entitlement state and event", async () => {
  const { calls, fetchMock } = createFetchMock();
  const result = await persistCreditEventToSupabase(
    "anon_client",
    20,
    {
      source: "creem",
      externalEventId: "evt_123",
      plan: "creator-pack"
    },
    { freeRemaining: 2, paidRemaining: 20, highResolution: true },
    env,
    fetchMock
  );

  assert.equal(result.skipped, false);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/anonymous_clients\?on_conflict=id$/);
  assert.match(calls[1].url, /\/credit_events$/);

  const clientBody = JSON.parse(calls[0].options.body);
  assert.equal(clientBody.high_resolution_downloads_unlocked, true);

  const eventBody = JSON.parse(calls[1].options.body);
  assert.equal(eventBody.source, "creem");
  assert.equal(eventBody.plan, "creator-pack");
  assert.equal(eventBody.credits_delta, 20);
});

await run("Supabase generation list maps database rows to saved design shape", async () => {
  const { calls, fetchMock } = createReadFetchMock();
  const result = await listGenerationsFromSupabase("anon_client", { limit: 12 }, env, fetchMock);

  assert.equal(result.skipped, false);
  assert.equal(result.generations.length, 1);
  assert.match(calls[0].url, /select=.*generation_assets/);
  assert.match(calls[0].url, /anonymous_client_id=eq\.anon_client/);

  const design = result.generations[0];
  assert.equal(design.id, "gen_local_123");
  assert.equal(design.input.idea, "small rose with moon");
  assert.equal(design.images.concept, "https://replicate.delivery/concept.webp");
  assert.equal(design.images.linework, "https://replicate.delivery/linework.webp");
  assert.equal(design.assets.concept.storagePath, "anonymous/anon_client/gen_local_123/concept.webp");
  assert.deepEqual(design.placementAdjustment, { x: 0.61, y: 0.37, scale: 1.24, rotation: -14 });
});

await run("Supabase generation detail reads one saved design by local id", async () => {
  const { calls, fetchMock } = createReadFetchMock();
  const result = await getGenerationFromSupabase("anon_client", "gen_local_123", env, fetchMock);

  assert.equal(result.skipped, false);
  assert.equal(result.generation.id, "gen_local_123");
  assert.match(calls[0].url, /local_generation_id=eq\.gen_local_123/);
  assert.match(calls[0].url, /limit=1/);
});

await run("Supabase quota reads anonymous client credit state", async () => {
  const { calls, fetchMock } = createQuotaFetchMock();
  const result = await getQuotaFromSupabase("anon_client", env, fetchMock);

  assert.equal(result.skipped, false);
  assert.equal(result.quota.freeRemaining, 1);
  assert.equal(result.quota.paidRemaining, 20);
  assert.equal(result.quota.totalRemaining, 21);
  assert.equal(result.quota.highResolution, true);
  assert.match(calls[0].url, /\/anonymous_clients\?/);
  assert.match(calls[0].url, /id=eq\.anon_client/);
});

await run("Supabase download access follows high-resolution entitlement", async () => {
  const { fetchMock } = createQuotaFetchMock();
  const result = await getDownloadAccessFromSupabase("anon_client", env, fetchMock);

  assert.equal(result.skipped, false);
  assert.equal(result.downloadAccess.highResolution, true);
  assert.equal(result.downloadAccess.watermarked, false);
  assert.equal(result.downloadAccess.message, "High-resolution downloads are unlocked");
});

await run("Supabase concept selection points at the existing candidate without uploading image bytes", async () => {
  const { calls, fetchMock } = createFetchMock();
  const candidateUrl = "/api/storage-image?path=anonymous%2Fanon_client%2Fgen_local_123%2Fconcept-candidates%2F2.png";
  const result = await persistConceptSelectionToSupabase(
    "anon_client",
    {
      ...savedGeneration,
      images: { ...savedGeneration.images, concept: candidateUrl },
      updatedAt: "2026-07-13T00:00:00.000Z"
    },
    env,
    fetchMock
  );

  assert.equal(result.skipped, false);
  assert.equal(calls.some((call) => call.url.includes("/storage/v1/object/")), false);
  const assetCall = calls.find((call) => call.url.includes("/generation_assets?on_conflict="));
  const assetBody = JSON.parse(assetCall.options.body);
  assert.equal(assetBody[0].asset_type, "concept");
  assert.equal(assetBody[0].storage_path, "anonymous/anon_client/gen_local_123/concept-candidates/2.png");
  assert.equal(assetBody[0].source_url, candidateUrl);
});

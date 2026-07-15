import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { persistGenerationToSupabase } from "../supabase-store.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run("generation routes expose durable ready states", async () => {
  const [generateRoute, lineworkRoute, staticServer] = await Promise.all([
    readFile(new URL("../app/api/generate/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate/linework/route.js", import.meta.url), "utf8"),
    readFile(new URL("../server.mjs", import.meta.url), "utf8")
  ]);

  assert.match(generateRoute, /status: "ready"/);
  assert.match(lineworkRoute, /lineworkStatus: "ready"/);
  assert.match(staticServer, /status: "ready"/);
  assert.match(staticServer, /lineworkStatus: "ready"/);
});

await run("failed concept asset persistence does not write reduced credits", async () => {
  const creditWrites = [];
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_STORAGE_BUCKET: "inkfirst-designs"
  };
  const savedGeneration = {
    id: "gen_failure_boundary",
    providerGenerationId: "provider_123",
    provider: "replicate",
    model: "model",
    status: "succeeded",
    prompt: "wolf tattoo",
    placementNote: "Forearm guidance",
    images: { concept: "https://images.example/concept.png" },
    input: {
      idea: "wolf",
      style: "Fine line",
      placement: "Forearm",
      size: "Medium",
      complexity: "Beginner friendly"
    },
    createdAt: new Date().toISOString()
  };

  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.includes("/anonymous_clients?on_conflict=id")) {
      creditWrites.push(JSON.parse(options.body));
      return new Response("null", { status: 200 });
    }
    if (value.includes("/generations?select=id")) {
      return Response.json([{ id: "00000000-0000-4000-8000-000000000001" }]);
    }
    if (value === savedGeneration.images.concept) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    }
    if (value.includes("/storage/v1/object/")) {
      return Response.json({ message: "storage unavailable" }, { status: 500 });
    }
    return new Response("null", { status: 200 });
  };

  await assert.rejects(
    () => persistGenerationToSupabase(
      "client-failure",
      savedGeneration,
      { freeRemaining: 2, paidRemaining: 0, totalRemaining: 2, highResolution: false },
      env,
      fetchImpl
    )
  );
  assert.equal(creditWrites.length, 0);
});

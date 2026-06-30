import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveDownloadFile } from "../download-core.mjs";
import {
  addPaidCredits,
  consumeGenerationCredit,
  getDownloadAccess,
  getGeneration,
  getQuotaState,
  listGenerations,
  mergeLocalAnonymousClientIntoUser
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
  const dir = await mkdtemp(join(tmpdir(), "inkfirst-login-merge-flow-"));
  const storePath = join(dir, "store.json");

  try {
    await testBody(storePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const anonymousClientId = "anon_browser_client";
const signedInUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "merge-flow@example.com"
};

await run("anonymous generation and Creator Pack access move to the signed-in account", async () => {
  await withTempStore(async (storePath) => {
    const generated = await consumeGenerationCredit(
      anonymousClientId,
      {
        idea: "small rose with moon",
        style: "Fine line",
        placement: "Forearm",
        size: "Small",
        complexity: "Beginner friendly"
      },
      {
        id: "mock-generation-1",
        provider: "mock",
        model: "mock-static-assets",
        status: "succeeded",
        prompt: "fine line small tattoo design of small rose with moon",
        placementNote: "Use a vertical composition with enough spacing.",
        images: {
          concept: "/assets/hero-concept.png",
          linework: "/assets/hero-linework.png",
          placement: "/assets/hero-placement.png"
        }
      },
      storePath
    );

    await addPaidCredits(
      anonymousClientId,
      20,
      {
        source: "creem",
        externalEventId: "evt_creator_pack_merge_flow",
        plan: "creator-pack"
      },
      storePath
    );

    await mergeLocalAnonymousClientIntoUser(anonymousClientId, signedInUser, storePath);

    const history = await listGenerations(signedInUser.id, { limit: 24 }, storePath);
    const detail = await getGeneration(signedInUser.id, generated.generation.id, storePath);
    const downloadAccess = await getDownloadAccess(signedInUser.id, storePath);
    const quota = await getQuotaState(signedInUser.id, storePath);
    const conceptDownload = await resolveDownloadFile(
      {
        clientId: signedInUser.id,
        generationId: generated.generation.id,
        type: "concept",
        storePath
      }
    );

    assert.equal(history.length, 1);
    assert.equal(history[0].input.idea, "small rose with moon");
    assert.equal(detail.id, generated.generation.id);
    assert.equal(downloadAccess.highResolution, true);
    assert.equal(downloadAccess.message, "High-resolution downloads are unlocked");
    assert.equal(quota.freeRemaining, 2);
    assert.equal(quota.paidRemaining, 20);
    assert.equal(quota.totalRemaining, 22);
    assert.equal(quota.highResolution, true);
    assert.notEqual(conceptDownload.watermarked, true);
    assert.match(conceptDownload.filename, /concept/);
  });
});

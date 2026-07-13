import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadStateApi(path) {
  const source = await readFile(path, "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context, { filename: path });
  return context.globalThis.InkFirstGenerationState;
}

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run("generation state prioritizes transient work and durable assets", async () => {
  const { resolveAssetState } = await loadStateApi("generation-state.js");

  assert.equal(resolveAssetState({ phase: "generating", assetUrl: "https://storage/concept.png" }), "generating");
  assert.equal(resolveAssetState({ phase: "saving", assetUrl: "https://storage/concept.png" }), "saving");
  assert.equal(resolveAssetState({ assetUrl: "https://storage/concept.png", failed: true }), "ready");
  assert.equal(resolveAssetState({ failed: true }), "failed");
});

await run("generation state excludes default assets and supports empty states", async () => {
  const { resolveAssetState } = await loadStateApi("generation-state.js");

  assert.equal(
    resolveAssetState({
      assetUrl: "/assets/default-linework.png",
      defaultAsset: "assets/default-linework.png"
    }),
    "not_generated"
  );
  assert.equal(resolveAssetState({}), "not_generated");
  assert.equal(resolveAssetState({ emptyState: "idle" }), "idle");
});

await run("generation state reports only active phases as busy", async () => {
  const { isBusy } = await loadStateApi("generation-state.js");

  assert.equal(isBusy("generating"), true);
  assert.equal(isBusy("saving"), true);
  assert.equal(isBusy("ready"), false);
  assert.equal(isBusy("failed"), false);
});

await run("public state module matches the root module", async () => {
  const rootApi = await loadStateApi("generation-state.js");
  const publicApi = await loadStateApi("public/generation-state.js");

  assert.equal(
    publicApi.resolveAssetState({ assetUrl: "https://storage/linework.png" }),
    rootApi.resolveAssetState({ assetUrl: "https://storage/linework.png" })
  );
});

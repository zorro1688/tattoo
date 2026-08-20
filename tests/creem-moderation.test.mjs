import assert from "node:assert/strict";
import * as generationCore from "../generation-core.mjs";
import { readFile } from "node:fs/promises";

assert.equal(
  typeof generationCore.moderateImagePrompt,
  "function",
  "generation core must expose the Creem prompt moderation gate"
);
assert.equal(
  typeof generationCore.buildCreemModerationPrompt,
  "function",
  "generation core must expose a complete user-input moderation prompt builder"
);

const { buildCreemModerationPrompt, moderateImagePrompt } = generationCore;

const completePrompt = buildCreemModerationPrompt({
  idea: "wolf portrait",
  style: "Fine line",
  placement: "Forearm",
  size: "Small",
  complexity: "Balanced detail",
  advancedPrompt: "add a custom detail"
});
for (const value of ["wolf portrait", "Fine line", "Forearm", "Small", "Balanced detail", "add a custom detail"]) {
  assert.match(completePrompt, new RegExp(value));
}

const bypassCalls = [];
const bypass = await moderateImagePrompt(
  "small rose",
  { GENERATION_PROVIDER: "mock" },
  async (...args) => bypassCalls.push(args)
);
assert.equal(bypass.allowed, true);
assert.equal(bypass.bypassed, true);
assert.equal(bypassCalls.length, 0);

const liveCalls = [];
const allowed = await moderateImagePrompt(
  "fine line wolf",
  { GENERATION_PROVIDER: "replicate", CREEM_API_KEY: "creem_live_key" },
  async (url, options) => {
    liveCalls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        id: "mod_1",
        object: "moderation_result",
        prompt: "fine line wolf",
        decision: "allow",
        usage: { units: 1 }
      })
    };
  },
  { externalId: "generation_123" }
);
assert.equal(allowed.allowed, true);
assert.equal(allowed.decision, "allow");
assert.equal(liveCalls[0].url, "https://api.creem.io/v1/moderation/prompt");
assert.equal(liveCalls[0].options.headers["x-api-key"], "creem_live_key");
assert.deepEqual(JSON.parse(liveCalls[0].options.body), {
  prompt: "fine line wolf",
  external_id: "generation_123"
});

const sandboxCalls = [];
await moderateImagePrompt(
  "minimal rose",
  { GENERATION_PROVIDER: "replicate", CREEM_API_KEY: "creem_test_key" },
  async (url) => {
    sandboxCalls.push(url);
    return {
      ok: true,
      json: async () => ({
        id: "mod_2",
        object: "moderation_result",
        prompt: "minimal rose",
        decision: "allow",
        usage: { units: 1 }
      })
    };
  }
);
assert.equal(sandboxCalls[0], "https://test-api.creem.io/v1/moderation/prompt");

const openAiCalls = [];
const openAiResult = await moderateImagePrompt(
  "safe prompt",
  { GENERATION_PROVIDER: "openai", CREEM_API_KEY: "creem_live_key" },
  async (url) => {
    openAiCalls.push(url);
    return {
      ok: true,
      json: async () => ({
        id: "mod_3",
        object: "moderation_result",
        prompt: "safe prompt",
        decision: "allow",
        usage: { units: 1 }
      })
    };
  }
);
assert.equal(openAiResult.allowed, true);
assert.equal(openAiCalls.length, 1);

for (const decision of ["flag", "deny"]) {
  const blocked = await moderateImagePrompt(
    "blocked prompt",
    { GENERATION_PROVIDER: "replicate", CREEM_API_KEY: "creem_live_key" },
    async () => ({ ok: true, json: async () => ({ decision }) })
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.status, 400);
  assert.equal(blocked.code, "prompt_rejected");
}

for (const fetchImpl of [
  async () => ({ ok: false, status: 500, json: async () => ({}) }),
  async () => ({ ok: true, json: async () => ({ decision: "unexpected" }) }),
  async () => ({ ok: true, json: async () => ({ decision: "ALLOW" }) }),
  async () => ({ ok: true, json: async () => ({ decision: "allow" }) }),
  async () => ({ ok: true, json: async () => ({ id: "mod_4", decision: "allow" }) }),
  async () => { throw new Error("timeout"); }
]) {
  const unavailable = await moderateImagePrompt(
    "safe prompt",
    { GENERATION_PROVIDER: "replicate", CREEM_API_KEY: "creem_live_key" },
    fetchImpl
  );
  assert.equal(unavailable.allowed, false);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.code, "moderation_unavailable");
}

const missingKey = await moderateImagePrompt(
  "safe prompt",
  { GENERATION_PROVIDER: "replicate" },
  async () => ({ ok: true, json: async () => ({ decision: "allow" }) })
);
assert.equal(missingKey.allowed, false);
assert.equal(missingKey.status, 503);
assert.equal(missingKey.code, "moderation_unavailable");

const unknownProvider = await moderateImagePrompt(
  "safe prompt",
  { GENERATION_PROVIDER: "future-provider" },
  async () => ({ ok: true, json: async () => ({ decision: "allow" }) })
);
assert.equal(unknownProvider.allowed, false);
assert.equal(unknownProvider.code, "moderation_unavailable");

const envExample = await readFile(".env.example", "utf8");
assert.match(envExample, /^CREEM_MODERATION_TIMEOUT_MS=5000$/m);

for (const routeFile of ["app/api/generate/route.js", "server.mjs"]) {
  const source = await readFile(routeFile, "utf8");
  assert.match(source, /buildCreemModerationPrompt\(body\)/);
  const moderationIndex = source.indexOf("const moderation = await moderateImagePrompt(");
  const generationIndex = source.indexOf("createGeneration(");
  assert.ok(moderationIndex >= 0, `${routeFile} calls Creem moderation`);
  assert.ok(moderationIndex < generationIndex, `${routeFile} moderates before concept generation`);
  const blockedPath = source.slice(moderationIndex, generationIndex);
  assert.match(blockedPath, /if \(!moderation\.allowed\)/);
  assert.match(blockedPath, /return/);
}

for (const routeFile of ["app/api/generate/linework/route.js", "server.mjs"]) {
  const source = await readFile(routeFile, "utf8");
  assert.match(source, /buildCreemModerationPrompt\(savedGeneration\)/);
  const routeStart = routeFile === "server.mjs"
    ? source.indexOf('if (url.pathname === "/api/generate/linework"')
    : 0;
  const moderationIndex = source.indexOf("const moderation = await moderateImagePrompt(", routeStart);
  const generationIndex = source.indexOf("createLineworkGeneration(", moderationIndex);
  assert.ok(moderationIndex >= 0, `${routeFile} calls Creem moderation for linework`);
  assert.ok(moderationIndex < generationIndex, `${routeFile} moderates before linework generation`);
  const blockedPath = source.slice(moderationIndex, generationIndex);
  assert.match(blockedPath, /if \(!moderation\.allowed\)/);
  assert.match(blockedPath, /return/);
}

console.log("Creem moderation compliance tests passed.");

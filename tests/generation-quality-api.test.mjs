import assert from "node:assert/strict";
import fs from "node:fs";
import { createGeneration } from "../generation-core.mjs";

function generationResponse(id, urls) {
  return {
    ok: true,
    json: async () => ({ id, status: "succeeded", output: urls })
  };
}

const initialUrls = [
  "https://replicate.delivery/initial-1.png",
  "https://replicate.delivery/initial-2.png",
  "https://replicate.delivery/initial-3.png",
  "https://replicate.delivery/initial-4.png"
];

const disabledCalls = [];
const disabled = await createGeneration(
  { idea: "wolf", style: "Fine line" },
  {
    GENERATION_PROVIDER: "replicate",
    REPLICATE_API_TOKEN: "test-token",
    QUALITY_REVIEW_ENABLED: "false"
  },
  async (url, init) => {
    disabledCalls.push({ url, init });
    return generationResponse("initial-prediction", initialUrls);
  }
);
assert.equal(disabledCalls.length, 1);
assert.deepEqual(disabled.conceptCandidates, initialUrls);

const reviewed = await createGeneration(
  { idea: "wolf", style: "Fine line" },
  {
    GENERATION_PROVIDER: "replicate",
    REPLICATE_API_TOKEN: "test-token",
    QUALITY_REVIEW_ENABLED: "true",
    QUALITY_REFILL_ENABLED: "false",
    QUALITY_REVIEW_MIN_SCORE: "70"
  },
  async () => generationResponse("reviewed-prediction", initialUrls),
  {
    analyzeCandidateUrl: async (url) => ({
      passed: true,
      cleanliness: url.includes("-3") ? 95 : 80,
      signature: url,
      reasons: []
    }),
    reviewCandidate: async (candidate) => ({
      review: {
        accepted: candidate.id === "initial-1" || candidate.id === "initial-3",
        score: candidate.id === "initial-3" ? 92 : 82,
        reviewStatus: "complete",
        reasons: []
      }
    })
  }
);
assert.deepEqual(reviewed.conceptCandidates, [initialUrls[2], initialUrls[0]]);
assert.equal(reviewed.images.concept, initialUrls[2]);

let providerCalls = 0;
const refillUrls = [
  "https://replicate.delivery/refill-1.png",
  "https://replicate.delivery/refill-2.png",
  "https://replicate.delivery/refill-3.png",
  "https://replicate.delivery/refill-4.png"
];
const refilled = await createGeneration(
  { idea: "wolf", style: "Fine line" },
  {
    GENERATION_PROVIDER: "replicate",
    REPLICATE_API_TOKEN: "test-token",
    QUALITY_REVIEW_ENABLED: "true",
    QUALITY_REFILL_ENABLED: "true"
  },
  async () => {
    providerCalls += 1;
    return providerCalls === 1
      ? generationResponse("initial-prediction", initialUrls)
      : generationResponse("refill-prediction", refillUrls);
  },
  {
    analyzeCandidateUrl: async (url) => ({ passed: true, cleanliness: 80, signature: url, reasons: [] }),
    reviewCandidate: async (candidate) => ({
      review: {
        accepted: candidate.id === "initial-1" || candidate.id === "refill-1",
        score: candidate.id === "refill-1" ? 95 : 80,
        reviewStatus: "complete",
        reasons: []
      }
    })
  }
);
assert.equal(providerCalls, 2);
assert.deepEqual(refilled.conceptCandidates, [refillUrls[0], initialUrls[0]]);
assert.equal(refilled.images.concept, refillUrls[0]);

const failed = await createGeneration(
  { idea: "wolf", style: "Fine line" },
  {
    GENERATION_PROVIDER: "replicate",
    REPLICATE_API_TOKEN: "test-token",
    QUALITY_REVIEW_ENABLED: "true",
    QUALITY_REFILL_ENABLED: "false"
  },
  async () => generationResponse("failed-quality", initialUrls),
  {
    analyzeCandidateUrl: async (url) => ({ passed: true, cleanliness: 80, signature: url, reasons: [] }),
    reviewCandidate: async () => ({
      review: { accepted: false, score: 10, reviewStatus: "complete", reasons: ["malformed_anatomy"] }
    })
  }
);
assert.equal(failed.code, "quality_no_usable_candidates");
assert.equal(failed.billable, false);
assert.equal(typeof failed.quality.phaseDurations.totalMs, "number");

const routeSource = fs.readFileSync(new URL("../app/api/generate/route.js", import.meta.url), "utf8");
assert.ok(
  routeSource.indexOf('if ("error" in generation)') < routeSource.indexOf("consumeGenerationCredit("),
  "quality and provider failures must return before credit consumption"
);

assert.match(
  routeSource,
  /reportCandidateQualityEvent\(\{/,
  "quality-enabled generations must emit a privacy-safe production quality event"
);
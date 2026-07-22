import assert from "node:assert/strict";
import { runCandidateQualityGate } from "../candidate-quality-orchestrator.mjs";

const initialCandidates = [
  { id: "initial-1", url: "https://example.test/one.png", originalIndex: 0, round: "initial" },
  { id: "initial-2", url: "https://example.test/dark.png", originalIndex: 1, round: "initial" },
  { id: "initial-3", url: "https://example.test/rejected.png", originalIndex: 2, round: "initial" },
  { id: "initial-4", url: "https://example.test/low.png", originalIndex: 3, round: "initial" },
];
const refillCandidates = [
  { id: "refill-1", url: "https://example.test/refill-good.png", originalIndex: 4, round: "refill" },
  { id: "refill-2", url: "https://example.test/duplicate.png", originalIndex: 5, round: "refill" },
  { id: "refill-3", url: "https://example.test/refill-dark.png", originalIndex: 6, round: "refill" },
  { id: "refill-4", url: "https://example.test/refill-rejected.png", originalIndex: 7, round: "refill" },
];
const reviews = {
  "initial-1": { accepted: true, score: 82, reviewStatus: "complete" },
  "initial-3": { accepted: false, score: 90, reviewStatus: "complete" },
  "initial-4": { accepted: true, score: 60, reviewStatus: "complete" },
  "refill-1": { accepted: true, score: 95, reviewStatus: "complete" },
  "refill-2": { accepted: true, score: 99, reviewStatus: "complete" },
  "refill-4": { accepted: false, score: 20, reviewStatus: "complete" },
};
let refillCalls = 0;
const result = await runCandidateQualityGate({
  input: { idea: "wolf", style: "Fine line" },
  initialCandidates,
  generateRefill: async () => {
    refillCalls += 1;
    return refillCandidates;
  },
  analyzeCandidateUrl: async (url) => ({
    passed: !url.includes("dark"),
    cleanliness: 90,
    signature: url.includes("duplicate") ? "sig-one" : url.includes("one.png") ? "sig-one" : url,
    reasons: url.includes("dark") ? ["dark_background"] : [],
  }),
  reviewCandidate: async (candidate) => ({
    review: reviews[candidate.id],
    predictionId: `review-${candidate.id}`,
    durationMs: 2,
  }),
  config: { enabled: true, refillEnabled: true, minScore: 70, maxAccepted: 4 },
});
assert.equal(refillCalls, 1);
assert.equal(result.refillAttempted, true);
assert.deepEqual(result.acceptedCandidates.map((item) => item.id), ["refill-1", "initial-1"]);
assert.equal(result.acceptedCandidates.some((item) => item.url.includes("dark")), false);
assert.equal(result.acceptedCandidates.some((item) => item.id === "initial-3"), false);
assert.ok(result.rejectedCandidates.length >= 4);
assert.equal(result.error, null);

const outageResult = await runCandidateQualityGate({
  input: { idea: "wolf" },
  initialCandidates: [{ id: "outage-1", url: "https://example.test/outage.png" }],
  analyzeCandidateUrl: async () => ({ passed: true, cleanliness: 70, signature: "outage", reasons: [] }),
  reviewCandidate: async () => ({ review: { accepted: false, score: 0, reviewStatus: "unavailable" } }),
  config: { enabled: true, refillEnabled: false, minScore: 70, maxAccepted: 4 },
});
assert.deepEqual(outageResult.acceptedCandidates.map((item) => item.id), ["outage-1"]);
assert.equal(outageResult.reviewUnavailableCount, 1);

const zeroResult = await runCandidateQualityGate({
  input: { idea: "wolf" },
  initialCandidates: [{ id: "zero-1", url: "https://example.test/zero.png" }],
  analyzeCandidateUrl: async () => ({ passed: true, cleanliness: 90, signature: "zero", reasons: [] }),
  reviewCandidate: async () => ({ review: { accepted: false, score: 10, reviewStatus: "complete" } }),
  generateRefill: async () => {
    throw new Error("provider failed");
  },
  config: { enabled: true, refillEnabled: true, minScore: 70, maxAccepted: 4 },
});
assert.equal(zeroResult.refillAttempted, true);
assert.equal(zeroResult.acceptedCandidates.length, 0);
assert.equal(zeroResult.error.code, "quality_no_usable_candidates");

const oneResult = await runCandidateQualityGate({
  input: { idea: "wolf" },
  initialCandidates: [{ id: "one-1", url: "https://example.test/pass.png" }],
  analyzeCandidateUrl: async () => ({ passed: true, cleanliness: 80, signature: "pass", reasons: [] }),
  reviewCandidate: async () => ({ review: { accepted: true, score: 80, reviewStatus: "complete" } }),
  generateRefill: async () => {
    throw new Error("provider failed");
  },
  config: { enabled: true, refillEnabled: true, minScore: 70, maxAccepted: 4 },
});
assert.equal(oneResult.acceptedCandidates.length, 1);
assert.equal(oneResult.error, null);

import assert from "node:assert/strict";

import {
  buildCandidateQualityEvent,
  reportCandidateQualityEvent,
} from "../candidate-quality-telemetry.mjs";

const input = {
  requestId: "quality-request-123",
  ownerId: "person@example.com",
  generationId: "generation-123",
  provider: "replicate",
  providerPredictionId: "prediction-123",
  acceptedCount: 3,
  rejectedCount: 5,
  refillAttempted: true,
  reviewUnavailableCount: 1,
  durationMs: 3210,
  succeeded: true,
  prompt: "private wolf tattoo prompt",
  imageUrl: "https://replicate.delivery/private-image.png?token=secret",
  reviewPredictionIds: ["review-secret-1"],
};

const event = buildCandidateQualityEvent(input, {
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_SHA: "release-123",
});

assert.equal(event.event, "candidate_quality_gate_completed");
assert.equal(event.level, "info");
assert.equal(event.acceptedCount, 3);
assert.equal(event.rejectedCount, 5);
assert.equal(event.refillAttempted, true);
assert.equal(event.hasAtLeastTwoUsable, true);
assert.equal(event.ownerRef.length, 24);
assert.equal(event.ownerId, undefined);
assert.equal(event.prompt, undefined);
assert.equal(event.imageUrl, undefined);
assert.equal(event.reviewPredictionIds, undefined);
assert.equal(JSON.stringify(event).includes("person@example.com"), false);
assert.equal(JSON.stringify(event).includes("replicate.delivery"), false);
assert.equal(JSON.stringify(event).includes("secret"), false);

const lines = [];
const reported = await reportCandidateQualityEvent(input, {
  env: { VERCEL_ENV: "production" },
  logger(line) {
    lines.push(line);
  },
});

assert.equal(reported.logged, true);
assert.equal(lines.length, 1);
assert.deepEqual(JSON.parse(lines[0]), reported.event);

console.log("Candidate quality telemetry tests passed.");
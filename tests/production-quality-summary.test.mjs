import assert from "node:assert/strict";

import {
  parseQualityEventLines,
  summarizeProductionQuality,
} from "../scripts/summarize-production-quality.mjs";

const lines = [
  JSON.stringify({ event: "candidate_quality_gate_completed", acceptedCount: 3, rejectedCount: 1, refillAttempted: false, reviewUnavailableCount: 0, durationMs: 1000, succeeded: true }),
  "prefix " + JSON.stringify({ event: "candidate_quality_gate_completed", acceptedCount: 1, rejectedCount: 7, refillAttempted: true, reviewUnavailableCount: 2, durationMs: 3000, succeeded: true }),
  JSON.stringify({ event: "other_event", acceptedCount: 4 }),
  "not json",
];

const events = parseQualityEventLines(lines.join("\n"));
assert.equal(events.length, 2);

const report = summarizeProductionQuality(events, {
  targetRate: 0.85,
  minimumSampleSize: 100,
});

assert.equal(report.totalBatches, 2);
assert.equal(report.batchesWithAtLeastTwoUsable, 1);
assert.equal(report.atLeastTwoUsableRate, 0.5);
assert.equal(report.refillRate, 0.5);
assert.equal(report.reviewUnavailableCount, 2);
assert.equal(report.averageAcceptedCount, 2);
assert.equal(report.averageRejectedCount, 4);
assert.equal(report.averageDurationMs, 2000);
assert.equal(report.sampleSizeReached, false);
assert.equal(report.targetMet, false);

const passing = summarizeProductionQuality(
  Array.from({ length: 100 }, (_, index) => ({
    event: "candidate_quality_gate_completed",
    acceptedCount: index < 90 ? 2 : 1,
    rejectedCount: 2,
    refillAttempted: false,
    reviewUnavailableCount: 0,
    durationMs: 1000,
    succeeded: true,
  })),
  { targetRate: 0.85, minimumSampleSize: 100 },
);

assert.equal(passing.sampleSizeReached, true);
assert.equal(passing.atLeastTwoUsableRate, 0.9);
assert.equal(passing.targetMet, true);

console.log("Production quality summary tests passed.");
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  analyzeCandidate,
  evaluateBatch,
  formatMarkdownReport,
  summarizeEvaluation,
} from "../quality-evaluation-core.mjs";

async function fixture({
  background = "#ffffff",
  foreground = "#111111",
  left = 32,
  top = 24,
  width = 64,
  height = 80,
} = {}) {
  return sharp({
    create: {
      width: 128,
      height: 128,
      channels: 3,
      background,
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="12" fill="${foreground}"/></svg>`,
        ),
        left,
        top,
      },
    ])
    .png()
    .toBuffer();
}

const clean = await analyzeCandidate(await fixture(), { minDimension: 64 });
assert.equal(clean.decodable, true);
assert.equal(clean.darkBackground, false);
assert.equal(clean.clippingRisk, false);
assert.equal(clean.automatedPass, true);
assert.equal(clean.reasons.length, 0);

const dark = await analyzeCandidate(
  await fixture({ background: "#050505", foreground: "#f5f5f5" }),
  { minDimension: 64 },
);
assert.equal(dark.darkBackground, true);
assert.equal(dark.automatedPass, false);
assert.equal(dark.reasons.includes("dark_background"), true);

const clipped = await analyzeCandidate(
  await fixture({ left: 0, top: 20, width: 70, height: 88 }),
  { minDimension: 64 },
);
assert.equal(clipped.clippingRisk, true);
assert.equal(clipped.automatedPass, false);
assert.equal(clipped.reasons.includes("foreground_touches_edge"), true);

const tooSmall = await analyzeCandidate(await fixture(), { minDimension: 256 });
assert.equal(tooSmall.automatedPass, false);
assert.equal(tooSmall.reasons.includes("image_too_small"), true);

const cleanBuffer = await fixture();
const distinctBuffer = await fixture({ left: 16, top: 40, width: 92, height: 48 });
const batch = await evaluateBatch(
  {
    caseId: "animal-wolf-portrait",
    category: "animal",
    candidates: [
      { id: "candidate-1", buffer: cleanBuffer },
      { id: "candidate-2", buffer: cleanBuffer },
      { id: "candidate-3", buffer: distinctBuffer },
      { id: "candidate-4", buffer: await fixture({ background: "#000000", foreground: "#ffffff" }) },
    ],
  },
  { minDimension: 64 },
);

assert.equal(batch.candidates.length, 4);
assert.equal(batch.hasAutomatedUsableCandidate, true);
assert.equal(batch.candidates[1].duplicateOf, "candidate-1");
assert.equal(batch.metrics.duplicateCandidates, 1);
assert.equal(batch.metrics.automatedPassCandidates, 3);

const reviewedBatch = {
  ...batch,
  manualReview: {
    status: "complete",
    hasUsableCandidate: true,
    unrequestedElements: "pass",
    anatomyComplete: "pass",
    conceptLineworkConsistency: "not_reviewed",
    notes: "Candidate 1 is usable.",
  },
};
const failedBatch = {
  ...batch,
  caseId: "animal-dragon-full-body",
  hasAutomatedUsableCandidate: false,
  metrics: {
    ...batch.metrics,
    automatedPassCandidates: 0,
    darkBackgroundCandidates: 2,
    clippingRiskCandidates: 2,
  },
  manualReview: {
    status: "complete",
    hasUsableCandidate: false,
    unrequestedElements: "fail",
    anatomyComplete: "fail",
    conceptLineworkConsistency: "not_reviewed",
    notes: "No complete dragon.",
  },
};

const report = summarizeEvaluation([reviewedBatch, failedBatch], {
  benchmarkVersion: "2026-07-18",
});
assert.equal(report.summary.totalBatches, 2);
assert.equal(report.summary.batchesWithAutomatedUsableCandidate, 1);
assert.equal(report.summary.automatedBatchSuccessRate, 0.5);
assert.equal(report.summary.manualReviewCompletionRate, 1);
assert.equal(report.summary.reviewedBatchSuccessRate, 0.5);
assert.equal(report.failureReasons.darkBackgroundCandidates, 3);

const markdown = formatMarkdownReport(report);
assert.match(markdown, /Generation Quality Evaluation/);
assert.match(markdown, /50\.0%/);
assert.match(markdown, /animal-wolf-portrait/);

console.log("Quality evaluation core tests passed.");

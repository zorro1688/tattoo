import assert from "node:assert/strict";
import {
  buildCandidateReviewPrompt,
  buildCompositionGuidance,
  classifyCompositionIntent,
  parseCandidateReviewOutput,
  rankAcceptedCandidates
} from "../candidate-quality-core.mjs";

assert.equal(classifyCompositionIntent("wolf"), "portrait");
assert.equal(classifyCompositionIntent("wolf head"), "portrait");
assert.equal(classifyCompositionIntent("half body tiger"), "half_body");
assert.equal(classifyCompositionIntent("full body wolf with all four legs"), "full_body");
assert.match(buildCompositionGuidance({ idea: "wolf", category: "animal" }), /portrait or upper-body/i);
assert.match(buildCompositionGuidance({ idea: "full body wolf", category: "animal" }), /all four legs/i);

const prompt = buildCandidateReviewPrompt({
  candidateId: "candidate-1",
  input: { idea: "wolf", style: "Fine line" },
  composition: "portrait"
});
assert.match(prompt, /candidate-1/);
assert.match(prompt, /wolf/);
assert.match(prompt, /JSON only/i);

const complete = parseCandidateReviewOutput(
  '```json\n{"accepted":false,"score":42,"subjectMatch":true,"anatomyComplete":false,"unrequestedElements":["leaves"],"cropped":false,"tattooUsable":false,"reasons":["missing hind leg","leaves"]}\n```',
  "candidate-2"
);
assert.equal(complete.candidateId, "candidate-2");
assert.equal(complete.reviewStatus, "complete");
assert.equal(complete.score, 42);
assert.deepEqual(complete.reasons, ["missing_hind_leg", "extra_botanical_elements"]);

const tokens = parseCandidateReviewOutput(["{\"accepted\":true,", "\"score\":188}"], "candidate-1");
assert.equal(tokens.reviewStatus, "complete");
assert.equal(tokens.score, 100);

const invalid = parseCandidateReviewOutput("not json", "candidate-3");
assert.equal(invalid.reviewStatus, "invalid_response");
assert.deepEqual(invalid.reasons, []);

const unknownReason = parseCandidateReviewOutput(
  '{"accepted":false,"score":10,"reasons":["the fur looks strange"]}',
  "candidate-4"
);
assert.deepEqual(unknownReason.reasons, ["other_quality_issue"]);

const ranked = rankAcceptedCandidates([
  { id: "candidate-1", deterministic: { passed: true, cleanliness: 80 }, review: { accepted: true, score: 82, reviewStatus: "complete" }, originalIndex: 0 },
  { id: "candidate-2", deterministic: { passed: true, cleanliness: 90 }, review: { accepted: false, score: 91, reviewStatus: "complete" }, originalIndex: 1 },
  { id: "candidate-3", deterministic: { passed: true, cleanliness: 75 }, review: { accepted: false, score: 0, reviewStatus: "unavailable" }, originalIndex: 2 },
  { id: "candidate-4", deterministic: { passed: false, cleanliness: 99 }, review: { accepted: false, score: 0, reviewStatus: "invalid_response" }, originalIndex: 3 }
], { minScore: 70 });
assert.deepEqual(ranked.map((item) => item.id), ["candidate-1", "candidate-3"]);

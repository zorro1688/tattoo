import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [pkgText, envExample, productionCheck, regression, checklist] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile(".env.example", "utf8"),
  readFile("scripts/check-production-setup.mjs", "utf8"),
  readFile("scripts/regression-check.mjs", "utf8"),
  readFile("docs/production-checklist.md", "utf8"),
]);
const pkg = JSON.parse(pkgText);

for (const entry of [
  "QUALITY_REVIEW_ENABLED=false",
  "REPLICATE_QUALITY_MODEL=google/gemini-3-flash",
  "QUALITY_REVIEW_MIN_SCORE=70",
  "QUALITY_REVIEW_TIMEOUT_MS=20000",
  "QUALITY_REFILL_ENABLED=false",
]) {
  assert.match(envExample, new RegExp(entry.replaceAll("/", "\\/")));
}

for (const name of [
  "QUALITY_REVIEW_ENABLED",
  "REPLICATE_QUALITY_MODEL",
  "QUALITY_REVIEW_MIN_SCORE",
  "QUALITY_REVIEW_TIMEOUT_MS",
  "QUALITY_REFILL_ENABLED",
]) {
  assert.match(productionCheck, new RegExp(name));
}

assert.match(pkg.scripts["test:candidate-quality"], /candidate-quality-core\.test\.mjs/);
assert.match(pkg.scripts["test:candidate-quality"], /candidate-quality-provider\.test\.mjs/);
assert.match(pkg.scripts["test:candidate-quality"], /candidate-quality-orchestrator\.test\.mjs/);
assert.match(pkg.scripts["test:candidate-quality"], /candidate-quality-telemetry\.test\.mjs/);
assert.match(pkg.scripts["test:candidate-quality"], /production-quality-summary\.test\.mjs/);
assert.equal(pkg.scripts["quality:summary"], "node scripts/summarize-production-quality.mjs");

for (const test of [
  "candidate-quality-core.test.mjs",
  "candidate-quality-provider.test.mjs",
  "candidate-quality-orchestrator.test.mjs",
  "candidate-quality-telemetry.test.mjs",
  "production-quality-summary.test.mjs",
  "generation-quality-api.test.mjs",
  "candidate-quality-setup.test.mjs",
]) {
  assert.match(regression, new RegExp(test.replaceAll(".", "\\.")));
}

for (const text of [
  "QUALITY_REVIEW_ENABLED",
  "QUALITY_REFILL_ENABLED",
  "google/gemini-3-flash",
  "100 batches",
  "85%",
  "Vercel Runtime Logs",
  "quality:summary",
]) {
  assert.match(checklist, new RegExp(text.replaceAll("/", "\\/"), "i"));
}

console.log("Candidate quality setup tests passed.");
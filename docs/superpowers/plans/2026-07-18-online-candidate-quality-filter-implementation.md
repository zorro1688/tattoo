# Online Candidate Quality Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-safe server-side quality gate that returns ranked, usable tattoo candidates, performs at most one free refill, and measures whether each batch contains at least two usable images.

**Architecture:** Replicate first creates one four-image batch. A provider-neutral quality core performs deterministic checks and normalizes independent vision-review decisions; an orchestrator reviews candidates before Supabase persistence, performs one bounded refill when needed, and returns accepted ranked URLs only. The existing API persists those accepted URLs and consumes exactly one credit only after a successful result.

**Tech Stack:** Node.js ESM, Next.js 15 App Router, Replicate HTTP API, `google/gemini-3-flash`, Sharp, Supabase Storage/Postgres, Node assertion tests.

## Global Constraints

- Generate exactly four candidates in the initial Replicate batch.
- Review candidates independently and in parallel after deterministic checks.
- Use `google/gemini-3-flash` by default; it accepts `prompt` and `images` inputs.
- Run at most one refill batch and never charge a second InkFirst credit for it.
- Default animal requests to portrait or half-body; use full body only for explicit full-body wording.
- Fail open only when the visual reviewer is unavailable; a completed rejection remains rejected.
- Return success with one accepted candidate, but record that the two-candidate target was missed.
- Return a non-billable failure when zero candidates remain after the optional refill.
- Persist accepted candidates only; retain rejected-candidate metadata without storing rejected files.
- Never log API tokens, raw signed URLs, raw reviewer reasoning, or sensitive payment data.
- Keep mock mode deterministic and independent of Replicate.
- Roll out with visual review enabled and refill disabled before enabling refill.
- Measure the 85% two-usable-candidate target only after at least 100 representative production batches.

## File Map

- Create `candidate-quality-core.mjs`: pure composition classification, reviewer prompt, response normalization, acceptance, ranking, and reason aggregation.
- Create `candidate-quality-provider.mjs`: Replicate Gemini vision calls, timeout handling, and prediction metadata.
- Create `candidate-quality-orchestrator.mjs`: deterministic checks, parallel reviews, deduplication, one refill, and final selection.
- Create `candidate-quality-telemetry.mjs`: privacy-safe quality event creation and summary aggregation.
- Modify `generation-core.mjs`: animal composition guidance, reusable Replicate batch generation, and quality orchestration.
- Modify `quality-evaluation-core.mjs`: expose the existing deterministic image analyzer for production orchestration without changing offline reports.
- Modify `app/api/generate/route.js`: report quality failures and pass correlation metadata.
- Modify `quota-store.mjs` and `supabase-store.mjs`: persist accepted candidates independently and ensure zero persisted candidates never consume credit.
- Modify `.env.example` and `scripts/check-production-setup.mjs`: quality feature flags and production validation.
- Add focused tests under `tests/` and extend the existing generation, quota, Supabase, monitoring, and production checks.

---

### Task 1: Composition Intent and Animal Prompt Defaults

**Files:**
- Create: `candidate-quality-core.mjs`
- Create: `tests/candidate-quality-core.test.mjs`
- Modify: `generation-core.mjs`
- Modify: `tests/generation-core.test.mjs`

**Interfaces:**
- Produces: `classifyCompositionIntent(idea) -> "portrait" | "half_body" | "full_body"`
- Produces: `buildCompositionGuidance({ idea, category }) -> string`
- Consumes later: the returned composition value is passed to the reviewer and telemetry.

- [ ] **Step 1: Write classification tests**

```js
import assert from "node:assert/strict";
import { classifyCompositionIntent, buildCompositionGuidance } from "../candidate-quality-core.mjs";

assert.equal(classifyCompositionIntent("wolf"), "portrait");
assert.equal(classifyCompositionIntent("wolf head"), "portrait");
assert.equal(classifyCompositionIntent("half body tiger"), "half_body");
assert.equal(classifyCompositionIntent("full body wolf with all four legs"), "full_body");
assert.match(buildCompositionGuidance({ idea: "wolf", category: "animal" }), /portrait or upper-body/i);
assert.match(buildCompositionGuidance({ idea: "full body wolf", category: "animal" }), /all four legs/i);
```

- [ ] **Step 2: Run tests and confirm the new exports are missing**

Run: `node tests/candidate-quality-core.test.mjs`

Expected: FAIL with an export/module-not-found error.

- [ ] **Step 3: Implement explicit full-body detection and safe defaults**

```js
const FULL_BODY_PATTERN = /\b(full body|whole body|entire body|head to toe|all four legs)\b/i;
const HALF_BODY_PATTERN = /\b(half body|upper body|bust)\b/i;
const PORTRAIT_PATTERN = /\b(head|face|portrait|headshot)\b/i;

export function classifyCompositionIntent(idea = "") {
  const text = String(idea).replace(/\s+/g, " ").trim();
  if (FULL_BODY_PATTERN.test(text)) return "full_body";
  if (HALF_BODY_PATTERN.test(text)) return "half_body";
  if (PORTRAIT_PATTERN.test(text)) return "portrait";
  return "portrait";
}

export function buildCompositionGuidance({ idea = "", category = "general" } = {}) {
  const composition = classifyCompositionIntent(idea);
  if (category !== "animal" && category !== "creature") {
    return "Keep the complete requested motif inside the canvas with generous clean margins.";
  }
  if (composition === "full_body") {
    return "Show one complete full-body subject with anatomically coherent head, torso, all four legs when applicable, paws or feet, and tail fully inside the canvas.";
  }
  if (composition === "half_body") {
    return "Use a complete upper-body composition with a readable head, shoulders, and torso transition; do not add unrelated ornaments.";
  }
  return "Prefer a portrait or upper-body composition with a complete readable head and neck silhouette; hidden legs are expected and must not be invented.";
}
```

Update `subjectCompletenessGuidance()` in `generation-core.mjs` to call this guidance instead of forcing every unqualified creature request into a full-body pose.

- [ ] **Step 4: Add regression assertions for `wolf`, `wolf head`, and explicit full body**

```js
assert.match(buildTattooPrompt({ idea: "wolf", style: "Fine line" }), /portrait or upper-body/i);
assert.doesNotMatch(buildTattooPrompt({ idea: "wolf", style: "Fine line" }), /all four legs/i);
assert.match(buildTattooPrompt({ idea: "full body wolf", style: "Fine line" }), /all four legs/i);
```

- [ ] **Step 5: Run focused generation tests**

Run: `node tests/candidate-quality-core.test.mjs && npm run test:generate`

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add candidate-quality-core.mjs generation-core.mjs tests/candidate-quality-core.test.mjs tests/generation-core.test.mjs
git commit -m "Add composition-aware animal prompts"
```

---

### Task 2: Reviewer Contract, Normalization, and Ranking

**Files:**
- Modify: `candidate-quality-core.mjs`
- Modify: `tests/candidate-quality-core.test.mjs`

**Interfaces:**
- Produces: `buildCandidateReviewPrompt({ candidateId, input, composition }) -> string`
- Produces: `parseCandidateReviewOutput(output, candidateId) -> CandidateReview`
- Produces: `rankAcceptedCandidates(candidates, { minScore }) -> CandidateDecision[]`
- `CandidateReview.reviewStatus`: `"complete" | "unavailable" | "invalid_response"`

- [ ] **Step 1: Add tests for JSON variants and normalized reasons**

```js
const complete = parseCandidateReviewOutput('```json\n{"accepted":false,"score":42,"subjectMatch":true,"anatomyComplete":false,"unrequestedElements":["leaves"],"cropped":false,"tattooUsable":false,"reasons":["missing hind leg","leaves"]}\n```', "candidate-2");
assert.equal(complete.candidateId, "candidate-2");
assert.equal(complete.score, 42);
assert.deepEqual(complete.reasons, ["missing_hind_leg", "extra_botanical_elements"]);

const tokens = parseCandidateReviewOutput(["{\"accepted\":true,", "\"score\":88}"], "candidate-1");
assert.equal(tokens.reviewStatus, "complete");
assert.equal(tokens.score, 88);

const invalid = parseCandidateReviewOutput("not json", "candidate-3");
assert.equal(invalid.reviewStatus, "invalid_response");
```

- [ ] **Step 2: Run the test and confirm parsing functions are missing**

Run: `node tests/candidate-quality-core.test.mjs`

Expected: FAIL naming `parseCandidateReviewOutput`.

- [ ] **Step 3: Implement strict normalization**

Use an allowlist containing:

```js
const ALLOWED_REASONS = new Set([
  "subject_mismatch",
  "missing_front_leg",
  "missing_hind_leg",
  "extra_limb",
  "malformed_anatomy",
  "extra_botanical_elements",
  "extra_celestial_elements",
  "extra_text",
  "duplicate_subject",
  "cropped_subject",
  "dark_background",
  "poor_tattoo_readability",
  "other_quality_issue"
]);
```

Strip Markdown fences, join token arrays, locate the first JSON object, clamp score to `0..100`, coerce booleans, map provider prose to the allowlist, and never retain arbitrary prose.

- [ ] **Step 4: Add acceptance and stable-ranking tests**

```js
const ranked = rankAcceptedCandidates([
  { id: "candidate-1", deterministic: { passed: true, cleanliness: 80 }, review: { accepted: true, score: 82, reviewStatus: "complete" }, originalIndex: 0 },
  { id: "candidate-2", deterministic: { passed: true, cleanliness: 90 }, review: { accepted: false, score: 91, reviewStatus: "complete" }, originalIndex: 1 },
  { id: "candidate-3", deterministic: { passed: true, cleanliness: 75 }, review: { accepted: false, score: 0, reviewStatus: "unavailable" }, originalIndex: 2 }
], { minScore: 70 });
assert.deepEqual(ranked.map((item) => item.id), ["candidate-1", "candidate-3"]);
```

- [ ] **Step 5: Implement fail-open only for unavailable reviews**

Completed reviews require `accepted === true` and `score >= minScore`. `unavailable` and `invalid_response` may pass only when deterministic checks passed; completed rejections can never be overridden. Sort by complete-review score, deterministic cleanliness, then original index.

- [ ] **Step 6: Run tests**

Run: `node tests/candidate-quality-core.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add candidate-quality-core.mjs tests/candidate-quality-core.test.mjs
git commit -m "Add candidate review contract and ranking"
```

---

### Task 3: Replicate Vision Reviewer Adapter

**Files:**
- Create: `candidate-quality-provider.mjs`
- Create: `tests/candidate-quality-provider.test.mjs`

**Interfaces:**
- Produces: `reviewCandidateWithReplicate(candidate, context, options) -> Promise<{ review, predictionId, durationMs, model }>`
- Produces: `reviewCandidatesInParallel(candidates, context, options) -> Promise<ReviewResult[]>`
- Uses injected `fetchImpl` for tests and global `fetch` in production.

- [ ] **Step 1: Write a request-shape test**

```js
const calls = [];
const result = await reviewCandidateWithReplicate(
  { id: "candidate-1", url: "https://replicate.delivery/example.png" },
  { input: { idea: "wolf", style: "Fine line" }, composition: "portrait" },
  {
    token: "test-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "review-1", status: "succeeded", output: ['{"accepted":true,"score":90}'] }), { status: 200 });
    }
  }
);
const body = JSON.parse(calls[0].init.body);
assert.equal(calls[0].url, "https://api.replicate.com/v1/models/google/gemini-3-flash/predictions");
assert.deepEqual(body.input.images, ["https://replicate.delivery/example.png"]);
assert.equal(result.predictionId, "review-1");
```

- [ ] **Step 2: Run the provider test and confirm the module is missing**

Run: `node tests/candidate-quality-provider.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the official Gemini request schema**

Post to `https://api.replicate.com/v1/models/${model}/predictions` with:

```js
{
  input: {
    prompt: buildCandidateReviewPrompt(context),
    images: [candidate.url],
    temperature: 0,
    thinking_level: "low",
    max_output_tokens: 800
  }
}
```

Use headers `Authorization: Bearer ${token}`, `Content-Type: application/json`, `Prefer: wait=30`, and `Cancel-After: ${Math.ceil(timeoutMs / 1000)}s`. Apply `AbortController` with `QUALITY_REVIEW_TIMEOUT_MS`, defaulting to `20000`.

- [ ] **Step 4: Add timeout, HTTP-error, token-array, and parallelism tests**

Assert that timeout and non-2xx responses return `reviewStatus: "unavailable"`, preserve a prediction ID when supplied, and never throw the entire candidate batch. Assert four mocked calls start before any deferred response is released.

- [ ] **Step 5: Run provider tests**

Run: `node tests/candidate-quality-provider.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add candidate-quality-provider.mjs tests/candidate-quality-provider.test.mjs
git commit -m "Add Replicate vision reviewer adapter"
```

---

### Task 4: Bounded Quality Orchestrator and Refill

**Files:**
- Create: `candidate-quality-orchestrator.mjs`
- Create: `tests/candidate-quality-orchestrator.test.mjs`
- Modify: `quality-evaluation-core.mjs`
- Modify: `tests/quality-evaluation-core.test.mjs`

**Interfaces:**
- Produces: `runCandidateQualityGate({ input, initialCandidates, generateRefill, analyzeCandidateUrl, reviewCandidate, config })`
- Returns: `{ acceptedCandidates, rejectedCandidates, refillAttempted, reviewUnavailableCount, phaseDurations, predictionIds }`
- Candidate input: `{ id, url, predictionId, originalIndex, round: "initial" | "refill" }`

- [ ] **Step 1: Expose a URL-based deterministic analyzer**

Add `analyzeCandidateUrl(url, { fetchImpl, minDimension })` to `quality-evaluation-core.mjs`. It fetches the image with a timeout, enforces `image/*`, caps the downloaded body at 10 MB, and passes the buffer to existing `analyzeCandidate()`.

Test a valid image response, a non-image response, an oversized response, and fetch failure.

- [ ] **Step 2: Write the one-refill orchestration test**

```js
let refillCalls = 0;
const result = await runCandidateQualityGate({
  input: { idea: "wolf", style: "Fine line" },
  initialCandidates: fourCandidates,
  generateRefill: async () => {
    refillCalls += 1;
    return refillCandidates;
  },
  analyzeCandidateUrl: async (url) => ({ passed: !url.includes("dark"), cleanliness: 90, reasons: [] }),
  reviewCandidate: async (candidate) => reviewsById[candidate.id],
  config: { enabled: true, refillEnabled: true, minScore: 70, maxAccepted: 4 }
});
assert.equal(refillCalls, 1);
assert.equal(result.refillAttempted, true);
assert.ok(result.acceptedCandidates.length >= 2);
```

- [ ] **Step 3: Run the orchestration test and confirm the module is missing**

Run: `node tests/candidate-quality-orchestrator.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement one-round evaluation and one bounded refill**

The orchestrator must:

1. run deterministic checks with `Promise.allSettled`;
2. skip visual review for deterministic failures;
3. review survivors in parallel;
4. normalize and rank decisions;
5. call `generateRefill()` once only when accepted count is below `2` and refill is enabled;
6. deduplicate candidates using deterministic signatures and normalized URLs;
7. combine initial/refill candidates, rank, and cap at four;
8. return a `quality_no_usable_candidates` error object when zero survive.

- [ ] **Step 5: Add failure-policy tests**

Cover reviewer outage fail-open, completed rejection fail-closed, refill provider failure preserving initial passes, no second refill, zero accepted failure, one accepted success, and rejected URLs absent from `acceptedCandidates`.

- [ ] **Step 6: Run focused tests**

Run: `node tests/quality-evaluation-core.test.mjs && node tests/candidate-quality-orchestrator.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add candidate-quality-orchestrator.mjs quality-evaluation-core.mjs tests/candidate-quality-orchestrator.test.mjs tests/quality-evaluation-core.test.mjs
git commit -m "Add bounded candidate quality orchestration"
```

---

### Task 5: Integrate Quality Gate into Concept Generation

**Files:**
- Modify: `generation-core.mjs`
- Modify: `tests/generation-core.test.mjs`
- Modify: `app/api/generate/route.js`
- Create: `tests/generation-quality-api.test.mjs`

**Interfaces:**
- `createReplicateConceptBatch(body, options) -> { candidates, predictionId, model }`
- `createReplicateGeneration(body, options) -> GenerationResult | QualityFailure`
- Public `conceptCandidates` remains an array of accepted ranked URLs only.

- [ ] **Step 1: Add generation integration tests with injected callbacks**

Assert that:

- review disabled preserves current four-candidate behavior;
- review enabled returns accepted ranked URLs only;
- refill uses the same generation model and creates one additional provider prediction at most;
- `images.concept` equals `conceptCandidates[0]`;
- zero accepted returns `{ error, code: "quality_no_usable_candidates", billable: false }`.

- [ ] **Step 2: Run generation tests and confirm the integration assertions fail**

Run: `npm run test:generate`

Expected: FAIL on missing quality-gate behavior.

- [ ] **Step 3: Extract reusable batch generation**

Move the current Replicate POST/poll/output extraction into `createReplicateConceptBatch()`. Preserve `num_outputs: 4`, existing prompt/negative prompt, output normalization, and black-background processing. Assign stable IDs such as `initial-1` and `refill-1` without exposing internal scores.

- [ ] **Step 4: Wire the quality orchestrator before persistence**

Resolve configuration from environment:

```js
const qualityConfig = {
  enabled: process.env.QUALITY_REVIEW_ENABLED === "true",
  refillEnabled: process.env.QUALITY_REFILL_ENABLED === "true",
  minScore: Number(process.env.QUALITY_REVIEW_MIN_SCORE || 70),
  timeoutMs: Number(process.env.QUALITY_REVIEW_TIMEOUT_MS || 20000),
  model: process.env.REPLICATE_QUALITY_MODEL || "google/gemini-3-flash"
};
```

Call the gate using temporary Replicate output URLs. Return accepted URLs only. Keep mock mode unchanged.

- [ ] **Step 5: Add route tests for credit boundaries**

Mock `createGeneration()` and `consumeGenerationCredit()` so the test proves:

- quality failure never calls `consumeGenerationCredit()`;
- one or more accepted candidates calls it exactly once;
- refill metadata never appears in the public response except the accepted candidate list.

- [ ] **Step 6: Run API and generation tests**

Run: `npm run test:generate && node tests/generation-quality-api.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add generation-core.mjs app/api/generate/route.js tests/generation-core.test.mjs tests/generation-quality-api.test.mjs
git commit -m "Integrate online concept quality gate"
```

---

### Task 6: Persist Accepted Candidates Safely

**Files:**
- Modify: `supabase-store.mjs`
- Modify: `quota-store.mjs`
- Modify: `tests/supabase-store.test.mjs`
- Modify: `tests/quota-store.test.mjs`

**Interfaces:**
- Produces: `prepareAcceptedConceptCandidatesForSupabase(ownerId, generation) -> Promise<{ persisted, failed }>`
- `failed` entries contain candidate ID and normalized `storage_upload_failed`, never raw signed URLs.
- Credit is consumed only when `persisted.length > 0`.

- [ ] **Step 1: Add partial-upload tests**

Create three accepted candidate fixtures. Make candidate two upload throw while one and three succeed. Assert persisted candidates remain ranked `[one, three]`, `images.concept === one`, and failure metadata contains only the candidate ID/reason.

- [ ] **Step 2: Add zero-persisted credit test**

Mock all uploads as failed and assert quota values remain unchanged, no generation row is created, and the function throws `No accepted concept candidate could be persisted.`

- [ ] **Step 3: Run Supabase and quota tests and confirm failure**

Run: `npm run test:supabase && npm run test:quota`

Expected: FAIL on all-or-nothing upload behavior.

- [ ] **Step 4: Implement independent accepted-candidate uploads**

Use `Promise.allSettled` in rank order. Keep successful Storage URLs, drop failed candidates, set the first persisted URL as `images.concept`, and return sanitized failures. Do not upload rejected candidates because they never enter `generation.conceptCandidates`.

- [ ] **Step 5: Move quota mutation after persistence viability**

In both Supabase and local-store paths, validate that at least one accepted candidate is persisted before decrementing quota or writing a generation/credit event. Preserve one-credit behavior regardless of refill count.

- [ ] **Step 6: Run persistence tests**

Run: `npm run test:supabase && npm run test:quota`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase-store.mjs quota-store.mjs tests/supabase-store.test.mjs tests/quota-store.test.mjs
git commit -m "Persist accepted candidates without partial billing"
```

---

### Task 7: Privacy-Safe Quality Telemetry and Reports

**Files:**
- Create: `candidate-quality-telemetry.mjs`
- Create: `tests/candidate-quality-telemetry.test.mjs`
- Create: `scripts/summarize-production-quality.mjs`
- Create: `tests/production-quality-summary.test.mjs`
- Modify: `app/api/generate/route.js`
- Modify: `monitoring-core.mjs`

**Interfaces:**
- Produces: `buildQualityGateEvent(result, context) -> SanitizedQualityEvent`
- Produces: `summarizeQualityEvents(events) -> QualitySummary`
- Event name: `candidate_quality_gate_completed`.

- [ ] **Step 1: Write sanitization tests**

```js
const event = buildQualityGateEvent(result, {
  generationId: "gen-1",
  ownerId: "user-secret",
  input: { idea: "wolf" }
});
const serialized = JSON.stringify(event);
assert.doesNotMatch(serialized, /replicate\.delivery|token=|user-secret/);
assert.equal(event.finalAcceptedCount, 2);
assert.deepEqual(event.rejectionReasons, { missing_hind_leg: 1, extra_botanical_elements: 1 });
```

- [ ] **Step 2: Run telemetry tests and confirm the module is missing**

Run: `node tests/candidate-quality-telemetry.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement sanitized events**

Include hashed owner reference using the existing monitoring helper, generation/reviewer prediction IDs, category, composition, candidate counts, refill flag, degraded count, normalized reason counts, phase durations, model names, and timestamp. Exclude image URLs and provider prose.

- [ ] **Step 4: Add summary-metric tests**

Provide 100 fixture events and assert:

- `initialTwoUsableRate`;
- `finalTwoUsableRate`;
- `zeroUsableRate`;
- `refillRate`;
- `degradedReviewerRate`;
- average accepted count;
- target status is `insufficient_sample` below 100 and `met` only when final rate is at least `0.85`.

- [ ] **Step 5: Implement JSONL summary CLI**

`scripts/summarize-production-quality.mjs` reads a local JSONL export, filters `candidate_quality_gate_completed`, calls `summarizeQualityEvents()`, and prints JSON plus a concise Markdown summary. It must reject malformed lines with line numbers and never echo raw line content.

- [ ] **Step 6: Emit quality events from the generation route**

After the gate completes, send the sanitized event through the existing structured monitoring output. On quality failure, report normalized code `quality_no_usable_candidates` and preserve the request ID.

- [ ] **Step 7: Run telemetry, monitoring, and summary tests**

Run: `node tests/candidate-quality-telemetry.test.mjs && node tests/production-quality-summary.test.mjs && node tests/monitoring-core.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add candidate-quality-telemetry.mjs monitoring-core.mjs app/api/generate/route.js scripts/summarize-production-quality.mjs tests/candidate-quality-telemetry.test.mjs tests/production-quality-summary.test.mjs
git commit -m "Add candidate quality telemetry and reports"
```

---

### Task 8: Production Configuration, Rollout Checks, and Full Verification

**Files:**
- Modify: `.env.example`
- Modify: `scripts/check-production-setup.mjs`
- Modify: `tests/production-setup.test.mjs`
- Modify: `docs/PRODUCTION_CHECKLIST.md`
- Modify: `package.json`
- Modify: `scripts/regression-check.mjs`

**Interfaces:**
- Adds script: `test:candidate-quality`
- Adds script: `quality:summary`
- Production checker validates values only when `QUALITY_REVIEW_ENABLED=true`.

- [ ] **Step 1: Add failing configuration tests**

Assert these cases:

- review disabled requires no reviewer model;
- review enabled requires `REPLICATE_API_TOKEN` and an HTTPS-capable Replicate model ID;
- score must be `0..100`;
- timeout must be `5000..50000` milliseconds;
- refill cannot be enabled while review is disabled;
- default model resolves to `google/gemini-3-flash`.

- [ ] **Step 2: Run production setup tests and confirm failure**

Run: `node tests/production-setup.test.mjs`

Expected: FAIL on missing quality configuration checks.

- [ ] **Step 3: Add documented environment variables**

```dotenv
QUALITY_REVIEW_ENABLED=false
REPLICATE_QUALITY_MODEL=google/gemini-3-flash
QUALITY_REVIEW_MIN_SCORE=70
QUALITY_REVIEW_TIMEOUT_MS=20000
QUALITY_REFILL_ENABLED=false
```

Document rollout order: deploy disabled, enable review with refill off, inspect at least 100 events, then enable refill if schema validity and latency are acceptable.

- [ ] **Step 4: Add package scripts**

```json
{
  "test:candidate-quality": "node tests/candidate-quality-core.test.mjs && node tests/candidate-quality-provider.test.mjs && node tests/candidate-quality-orchestrator.test.mjs && node tests/candidate-quality-telemetry.test.mjs && node tests/generation-quality-api.test.mjs",
  "quality:summary": "node scripts/summarize-production-quality.mjs"
}
```

Add `npm run test:candidate-quality` to `scripts/regression-check.mjs`.

- [ ] **Step 5: Run all automated verification**

Run:

```bash
npm run test:candidate-quality
npm run test:quality
npm run test:generate
npm run test:quota
npm run test:supabase
npm run test:regression
npm run build
```

Expected: every command exits `0`; Next.js build completes with all routes generated.

- [ ] **Step 6: Run a controlled provider smoke test**

With review enabled and refill disabled in a non-production environment, generate `wolf`, `rose`, `geometric compass`, and `lettering Hope`. Verify four independent Gemini review prediction IDs are recorded per surviving batch, rejected candidates are absent from the browser, accepted images persist to Supabase, and quota decreases by one only after success.

- [ ] **Step 7: Verify failure modes manually**

Temporarily use an invalid reviewer model and confirm deterministic survivors still return with `review_unavailable`. Then restore the valid model, force four completed rejections with mocked fixtures, and confirm the API returns a non-billable quality error.

- [ ] **Step 8: Commit**

```bash
git add .env.example package.json scripts/check-production-setup.mjs scripts/regression-check.mjs scripts/summarize-production-quality.mjs tests/production-setup.test.mjs docs/PRODUCTION_CHECKLIST.md
git commit -m "Add candidate quality rollout controls"
```

---

## Final Review Gate

- [ ] Confirm `conceptCandidates` contains accepted ranked Storage URLs only.
- [ ] Confirm rejected images are neither returned nor uploaded.
- [ ] Confirm one refill maximum in tests and production telemetry.
- [ ] Confirm one successful browser request consumes exactly one credit.
- [ ] Confirm zero accepted or zero persisted candidates consume no credit.
- [ ] Confirm reviewer outage degrades safely and completed rejection remains rejected.
- [ ] Confirm default animal prompts no longer force full-body anatomy.
- [ ] Confirm no raw URLs, reviewer prose, tokens, or payment data appear in logs.
- [ ] Confirm the quality target remains `insufficient_sample` until 100 events exist.
- [ ] Confirm all verification commands pass before enabling production review.

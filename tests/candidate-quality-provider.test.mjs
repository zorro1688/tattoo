import assert from "node:assert/strict";
import {
  reviewCandidateWithReplicate,
  reviewCandidatesInParallel
} from "../candidate-quality-provider.mjs";

const calls = [];
const result = await reviewCandidateWithReplicate(
  { id: "candidate-1", url: "https://replicate.delivery/example.png" },
  { input: { idea: "wolf", style: "Fine line" }, composition: "portrait" },
  {
    token: "test-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        id: "review-1",
        status: "succeeded",
        output: ['{"accepted":true,"score":90}']
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  }
);
const body = JSON.parse(calls[0].init.body);
assert.equal(calls[0].url, "https://api.replicate.com/v1/models/google/gemini-3-flash/predictions");
assert.deepEqual(body.input.images, ["https://replicate.delivery/example.png"]);
assert.equal(body.input.temperature, 0);
assert.equal(body.input.thinking_level, "low");
assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
assert.equal(result.predictionId, "review-1");
assert.equal(result.review.reviewStatus, "complete");
assert.equal(result.review.score, 90);

const unavailable = await reviewCandidateWithReplicate(
  { id: "candidate-2", url: "https://replicate.delivery/bad.png" },
  { input: { idea: "wolf" }, composition: "portrait" },
  {
    token: "test-token",
    fetchImpl: async () => new Response(JSON.stringify({ id: "review-2", detail: "busy" }), {
      status: 503,
      headers: { "content-type": "application/json" }
    })
  }
);
assert.equal(unavailable.predictionId, "review-2");
assert.equal(unavailable.review.reviewStatus, "unavailable");

const timedOut = await reviewCandidateWithReplicate(
  { id: "candidate-3", url: "https://replicate.delivery/slow.png" },
  { input: { idea: "wolf" }, composition: "portrait" },
  {
    token: "test-token",
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })
  }
);
assert.equal(timedOut.review.reviewStatus, "unavailable");

let started = 0;
const releases = [];
const parallelPromise = reviewCandidatesInParallel(
  Array.from({ length: 4 }, (_, index) => ({
    id: `candidate-${index + 1}`,
    url: `https://replicate.delivery/${index + 1}.png`
  })),
  { input: { idea: "wolf" }, composition: "portrait" },
  {
    token: "test-token",
    fetchImpl: async () => {
      started += 1;
      return new Promise((resolve) => {
        releases.push(() => resolve(new Response(
          JSON.stringify({ id: `review-${started}`, output: ['{"accepted":true,"score":80}'] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )));
      });
    }
  }
);
await Promise.resolve();
assert.equal(started, 4);
releases.forEach((release) => release());
const parallel = await parallelPromise;
assert.equal(parallel.length, 4);
assert.ok(parallel.every((item) => item.review.reviewStatus === "complete"));

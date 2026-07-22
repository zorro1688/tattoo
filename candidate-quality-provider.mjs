import {
  buildCandidateReviewPrompt,
  parseCandidateReviewOutput
} from "./candidate-quality-core.mjs";

export const defaultCandidateReviewModel = "google/gemini-3-flash";
const defaultTimeoutMs = 20_000;

function unavailableReview(candidateId) {
  return {
    candidateId,
    reviewStatus: "unavailable",
    accepted: false,
    score: 0,
    reasons: []
  };
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function reviewCandidateWithReplicate(candidate, context = {}, options = {}) {
  const startedAt = Date.now();
  const model = options.model || defaultCandidateReviewModel;
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || defaultTimeoutMs);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = options.token || process.env.REPLICATE_API_TOKEN || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let predictionId = null;

  try {
    if (!token || typeof fetchImpl !== "function" || !candidate?.url) {
      return {
        review: unavailableReview(candidate?.id || ""),
        predictionId,
        durationMs: Date.now() - startedAt,
        model
      };
    }

    const response = await fetchImpl(
      `https://api.replicate.com/v1/models/${model}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait=30",
          "Cancel-After": `${Math.ceil(timeoutMs / 1000)}s`
        },
        body: JSON.stringify({
          input: {
            prompt: buildCandidateReviewPrompt({
              candidateId: candidate.id,
              input: context.input,
              composition: context.composition
            }),
            images: [candidate.url],
            temperature: 0,
            thinking_level: "low",
            max_output_tokens: 800
          }
        }),
        signal: controller.signal
      }
    );

    const payload = await readJsonSafely(response);
    predictionId = payload?.id || null;
    if (!response.ok || payload?.status === "failed" || payload?.status === "canceled") {
      return {
        review: unavailableReview(candidate.id),
        predictionId,
        durationMs: Date.now() - startedAt,
        model
      };
    }

    if (payload?.status && payload.status !== "succeeded") {
      return {
        review: unavailableReview(candidate.id),
        predictionId,
        durationMs: Date.now() - startedAt,
        model
      };
    }

    return {
      review: parseCandidateReviewOutput(payload?.output, candidate.id),
      predictionId,
      durationMs: Date.now() - startedAt,
      model
    };
  } catch {
    return {
      review: unavailableReview(candidate?.id || ""),
      predictionId,
      durationMs: Date.now() - startedAt,
      model
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function reviewCandidatesInParallel(candidates = [], context = {}, options = {}) {
  return Promise.all(
    candidates.map((candidate) => reviewCandidateWithReplicate(candidate, context, options))
  );
}

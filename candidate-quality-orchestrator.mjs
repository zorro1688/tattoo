import {
  classifyCompositionIntent,
  rankAcceptedCandidates
} from "./candidate-quality-core.mjs";

function normalizeUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = "";
    return url.toString();
  } catch {
    return String(value || "").trim();
  }
}

function unavailableReview(candidateId) {
  return {
    candidateId,
    accepted: false,
    score: 0,
    reviewStatus: "unavailable",
    reasons: []
  };
}

function normalizeReviewResult(candidate, result) {
  if (result?.review) return result;
  if (result?.reviewStatus) return { review: result, predictionId: null, durationMs: 0 };
  return { review: unavailableReview(candidate.id), predictionId: null, durationMs: 0 };
}

export async function runCandidateQualityGate({
  input = {},
  initialCandidates = [],
  generateRefill,
  analyzeCandidateUrl,
  reviewCandidate,
  config = {}
} = {}) {
  const settings = {
    enabled: config.enabled !== false,
    refillEnabled: config.refillEnabled === true,
    minScore: Number(config.minScore) || 70,
    maxAccepted: Math.max(1, Number(config.maxAccepted) || 4)
  };
  const startedAt = Date.now();
  const phaseDurations = { deterministicMs: 0, reviewMs: 0, refillMs: 0, totalMs: 0 };
  const predictionIds = [];
  const rejectedCandidates = [];
  const evaluatedCandidates = [];
  const seenUrls = new Set();
  const seenSignatures = new Set();

  if (!settings.enabled) {
    return {
      acceptedCandidates: initialCandidates.slice(0, settings.maxAccepted),
      rejectedCandidates: [],
      refillAttempted: false,
      reviewUnavailableCount: 0,
      phaseDurations: { ...phaseDurations, totalMs: Date.now() - startedAt },
      predictionIds: [],
      error: initialCandidates.length ? null : {
        code: "quality_no_usable_candidates",
        message: "No usable tattoo concepts were generated."
      }
    };
  }

  const composition = classifyCompositionIntent(input.idea);

  async function evaluateRound(candidates, round) {
    const normalized = candidates.map((candidate, index) => ({
      ...candidate,
      id: candidate.id || `${round}-${index + 1}`,
      originalIndex: Number.isFinite(Number(candidate.originalIndex))
        ? Number(candidate.originalIndex)
        : evaluatedCandidates.length + index,
      round: candidate.round || round
    }));

    const deterministicStartedAt = Date.now();
    const analyses = await Promise.allSettled(
      normalized.map(async (candidate) => {
        const urlKey = normalizeUrl(candidate.url);
        if (!urlKey || seenUrls.has(urlKey)) {
          return { candidate, duplicate: true, duplicateReason: "duplicate_url", urlKey };
        }
        seenUrls.add(urlKey);
        const deterministic = await analyzeCandidateUrl(candidate.url);
        const signature = deterministic?.signature || null;
        if (signature && seenSignatures.has(signature)) {
          return { candidate, deterministic, duplicate: true, duplicateReason: "duplicate_signature", urlKey };
        }
        if (signature) seenSignatures.add(signature);
        return { candidate, deterministic, duplicate: false, urlKey };
      })
    );
    phaseDurations.deterministicMs += Date.now() - deterministicStartedAt;

    const survivors = [];
    for (let index = 0; index < analyses.length; index += 1) {
      const settled = analyses[index];
      const candidate = normalized[index];
      if (settled.status === "rejected") {
        rejectedCandidates.push({
          ...candidate,
          rejectionStage: "deterministic",
          reasons: ["image_analysis_failed"]
        });
        continue;
      }
      const item = settled.value;
      if (item.duplicate) {
        rejectedCandidates.push({
          ...candidate,
          deterministic: item.deterministic,
          rejectionStage: "deduplication",
          reasons: [item.duplicateReason]
        });
        continue;
      }
      const deterministic = {
        ...item.deterministic,
        passed: item.deterministic?.passed === true
      };
      if (!deterministic.passed) {
        rejectedCandidates.push({
          ...candidate,
          deterministic,
          rejectionStage: "deterministic",
          reasons: deterministic.reasons || ["deterministic_check_failed"]
        });
        continue;
      }
      survivors.push({ ...candidate, deterministic });
    }

    const reviewStartedAt = Date.now();
    const reviews = await Promise.all(
      survivors.map(async (candidate) => {
        try {
          return normalizeReviewResult(
            candidate,
            await reviewCandidate(candidate, { input, composition })
          );
        } catch {
          return { review: unavailableReview(candidate.id), predictionId: null, durationMs: 0 };
        }
      })
    );
    phaseDurations.reviewMs += Date.now() - reviewStartedAt;

    survivors.forEach((candidate, index) => {
      const providerResult = reviews[index];
      if (providerResult.predictionId) predictionIds.push(providerResult.predictionId);
      evaluatedCandidates.push({
        ...candidate,
        review: providerResult.review,
        reviewPredictionId: providerResult.predictionId || null,
        reviewDurationMs: Number(providerResult.durationMs) || 0
      });
    });
  }

  await evaluateRound(initialCandidates, "initial");
  let acceptedCandidates = rankAcceptedCandidates(evaluatedCandidates, {
    minScore: settings.minScore
  });

  let refillAttempted = false;
  if (acceptedCandidates.length < 2 && settings.refillEnabled && typeof generateRefill === "function") {
    refillAttempted = true;
    const refillStartedAt = Date.now();
    try {
      const refillCandidates = await generateRefill();
      if (Array.isArray(refillCandidates) && refillCandidates.length) {
        await evaluateRound(refillCandidates, "refill");
      }
    } catch {
      // Preserve initial accepted candidates when the single refill provider call fails.
    } finally {
      phaseDurations.refillMs += Date.now() - refillStartedAt;
    }
    acceptedCandidates = rankAcceptedCandidates(evaluatedCandidates, {
      minScore: settings.minScore
    });
  }

  const acceptedIds = new Set(acceptedCandidates.map((candidate) => candidate.id));
  for (const candidate of evaluatedCandidates) {
    if (!acceptedIds.has(candidate.id)) {
      rejectedCandidates.push({
        ...candidate,
        rejectionStage: "visual_review",
        reasons: candidate.review?.reasons || []
      });
    }
  }

  acceptedCandidates = acceptedCandidates.slice(0, settings.maxAccepted);
  const reviewUnavailableCount = evaluatedCandidates.filter(
    (candidate) => candidate.review?.reviewStatus === "unavailable"
      || candidate.review?.reviewStatus === "invalid_response"
  ).length;
  phaseDurations.totalMs = Date.now() - startedAt;

  return {
    acceptedCandidates,
    rejectedCandidates,
    refillAttempted,
    reviewUnavailableCount,
    phaseDurations,
    predictionIds: [...new Set(predictionIds)],
    error: acceptedCandidates.length ? null : {
      code: "quality_no_usable_candidates",
      message: "No usable tattoo concepts were generated."
    }
  };
}

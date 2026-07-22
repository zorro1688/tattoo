import { hashOwnerId } from "./monitoring-core.mjs";

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""),
  );
}

function normalizeInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

export function buildCandidateQualityEvent(input = {}, env = process.env) {
  const acceptedCount = normalizeInteger(input.acceptedCount, { max: 8 }) ?? 0;
  const timestamp = input.timestamp instanceof Date
    ? input.timestamp.toISOString()
    : typeof input.timestamp === "string"
      ? input.timestamp
      : new Date().toISOString();

  return compactObject({
    timestamp,
    level: "info",
    service: "inkfirst",
    environment: env.VERCEL_ENV || env.NODE_ENV || "development",
    release: env.VERCEL_GIT_COMMIT_SHA || env.APP_RELEASE,
    event: "candidate_quality_gate_completed",
    requestId: input.requestId,
    generationId: input.generationId,
    ownerRef: hashOwnerId(input.ownerId),
    provider: input.provider,
    providerPredictionId: input.providerPredictionId,
    acceptedCount,
    rejectedCount: normalizeInteger(input.rejectedCount, { max: 16 }) ?? 0,
    refillAttempted: input.refillAttempted === true,
    reviewUnavailableCount: normalizeInteger(input.reviewUnavailableCount, { max: 16 }) ?? 0,
    durationMs: normalizeInteger(input.durationMs),
    succeeded: input.succeeded === true,
    hasAtLeastTwoUsable: acceptedCount >= 2,
  });
}

export async function reportCandidateQualityEvent(
  input,
  {
    env = process.env,
    logger = console.info,
  } = {},
) {
  const event = buildCandidateQualityEvent(input, env);

  try {
    logger(JSON.stringify(event));
    return { event, logged: true };
  } catch {
    return { event, logged: false };
  }
}
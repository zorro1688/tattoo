import { createHash, randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 1500;
const MAX_TIMEOUT_MS = 5000;
const MAX_MESSAGE_LENGTH = 1000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

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

function scrubErrorMessage(value) {
  return String(value || "Unknown error")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|signature|sig)=([^\s&#]+)/gi,
      "$1=[redacted]",
    )
    .replace(/https?:\/\/[^\s?#]+\?[^\s]+/gi, (url) => `${url.split("?")[0]}?[redacted]`)
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function createRequestId(request) {
  const forwarded = request?.headers?.get?.("x-request-id")?.trim();
  return forwarded && REQUEST_ID_PATTERN.test(forwarded) ? forwarded : randomUUID();
}

export function hashOwnerId(ownerId) {
  if (!ownerId) return undefined;
  return createHash("sha256").update(String(ownerId)).digest("hex").slice(0, 24);
}

export function buildErrorEvent(input = {}, env = process.env) {
  const error = input.error instanceof Error ? input.error : new Error(String(input.error || "Unknown error"));
  const timestamp = input.timestamp instanceof Date
    ? input.timestamp.toISOString()
    : typeof input.timestamp === "string"
      ? input.timestamp
      : new Date().toISOString();

  return compactObject({
    timestamp,
    level: "error",
    service: "inkfirst",
    environment: env.VERCEL_ENV || env.NODE_ENV || "development",
    release: env.VERCEL_GIT_COMMIT_SHA || env.APP_RELEASE,
    event: input.event,
    stage: input.stage,
    route: input.route,
    requestId: input.requestId,
    generationId: input.generationId,
    ownerRef: hashOwnerId(input.ownerId),
    provider: input.provider,
    providerPredictionId: input.providerPredictionId,
    errorName: scrubErrorMessage(error.name),
    errorMessage: scrubErrorMessage(error.message),
    statusCode: normalizeInteger(input.statusCode, { min: 100, max: 599 }),
    durationMs: normalizeInteger(input.durationMs),
    retryable: typeof input.retryable === "boolean" ? input.retryable : undefined,
  });
}

export async function reportError(
  input,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    logger = console.error,
    warnLogger = console.warn,
  } = {},
) {
  const event = buildErrorEvent(input, env);
  try {
    logger(JSON.stringify(event));
  } catch {
    // Monitoring must never replace the original business error.
  }

  const webhookUrl = env.ERROR_MONITOR_WEBHOOK_URL?.trim();
  if (!webhookUrl || typeof fetchImpl !== "function") {
    return { event, delivered: false };
  }

  const timeoutMs = normalizeInteger(env.ERROR_MONITOR_TIMEOUT_MS, {
    min: 100,
    max: MAX_TIMEOUT_MS,
  }) || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { "content-type": "application/json" };
    const token = env.ERROR_MONITOR_WEBHOOK_TOKEN?.trim();
    if (token) headers.authorization = `Bearer ${token}`;

    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    if (!response?.ok) {
      throw new Error(`Monitoring endpoint returned ${response?.status || "unknown"}`);
    }

    return { event, delivered: true };
  } catch {
    warnLogger(JSON.stringify(compactObject({
      timestamp: new Date().toISOString(),
      level: "warn",
      service: "inkfirst",
      event: "monitor_delivery_failed",
      requestId: event.requestId,
    })));
    return { event, delivered: false };
  } finally {
    clearTimeout(timeout);
  }
}

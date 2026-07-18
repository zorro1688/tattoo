import assert from "node:assert/strict";

import {
  buildErrorEvent,
  createRequestId,
  hashOwnerId,
  reportError,
} from "../monitoring-core.mjs";

const ownerId = "user_123@example.com";
const ownerRef = hashOwnerId(ownerId);

assert.equal(ownerRef, hashOwnerId(ownerId));
assert.equal(ownerRef.length, 24);
assert.equal(ownerRef.includes(ownerId), false);
assert.equal(hashOwnerId(""), undefined);

const forwardedRequestId = createRequestId({
  headers: new Headers({ "x-request-id": "request-production-123" }),
});
assert.equal(forwardedRequestId, "request-production-123");
assert.match(createRequestId({ headers: new Headers() }), /^[0-9a-f-]{36}$/i);

const event = buildErrorEvent(
  {
    event: "concept_generation_failed",
    stage: "provider",
    route: "/api/generate",
    requestId: forwardedRequestId,
    generationId: "generation-123",
    ownerId,
    provider: "replicate",
    providerPredictionId: "prediction-123",
    statusCode: 502,
    retryable: true,
    durationMs: 245,
    error: new Error(
      "Failed for user_123@example.com with Bearer secret-token and api_key=top-secret at https://example.com/file.png?token=secret&signature=value",
    ),
    prompt: "private tattoo prompt",
    imageUrl: "https://example.com/private.png?token=secret",
    authorization: "Bearer do-not-log",
  },
  {
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_SHA: "release-abc",
  },
);

assert.equal(event.level, "error");
assert.equal(event.service, "inkfirst");
assert.equal(event.environment, "production");
assert.equal(event.release, "release-abc");
assert.equal(event.ownerRef, ownerRef);
assert.equal(event.ownerId, undefined);
assert.equal(event.prompt, undefined);
assert.equal(event.imageUrl, undefined);
assert.equal(event.authorization, undefined);
assert.equal(JSON.stringify(event).includes("user_123@example.com"), false);
assert.equal(JSON.stringify(event).includes("secret-token"), false);
assert.equal(JSON.stringify(event).includes("token=secret"), false);
assert.match(event.errorMessage, /\[redacted-email\]/);
assert.equal(JSON.stringify(event).includes("top-secret"), false);
assert.match(event.errorMessage, /Bearer \[redacted\]/);
assert.match(event.errorMessage, /https:\/\/example\.com\/file\.png\?\[redacted\]/);

const logLines = [];
const webhookCalls = [];
const delivered = await reportError(
  {
    event: "linework_persistence_failed",
    stage: "storage",
    route: "/api/generate/linework",
    requestId: "request-linework-123",
    generationId: "generation-456",
    ownerId,
    error: new Error("Storage failed for user_123@example.com"),
  },
  {
    env: {
      ERROR_MONITOR_WEBHOOK_URL: "https://monitor.example.com/events",
      ERROR_MONITOR_WEBHOOK_TOKEN: "monitor-secret",
      ERROR_MONITOR_TIMEOUT_MS: "50",
      VERCEL_ENV: "production",
    },
    logger(line) {
      logLines.push(line);
    },
    fetchImpl: async (url, options) => {
      webhookCalls.push({ url, options });
      return new Response(null, { status: 202 });
    },
  },
);

assert.equal(delivered.delivered, true);
assert.equal(logLines.length, 1);
assert.doesNotThrow(() => JSON.parse(logLines[0]));
assert.equal(webhookCalls.length, 1);
assert.equal(webhookCalls[0].url, "https://monitor.example.com/events");
assert.equal(webhookCalls[0].options.headers.authorization, "Bearer monitor-secret");
assert.equal(webhookCalls[0].options.body.includes("monitor-secret"), false);
assert.equal(webhookCalls[0].options.body.includes(ownerId), false);

const warningLines = [];
const notDelivered = await reportError(
  {
    event: "download_failed",
    stage: "download",
    requestId: "request-download-123",
    error: new Error("Network unavailable"),
  },
  {
    env: {
      ERROR_MONITOR_WEBHOOK_URL: "https://monitor.example.com/events",
      ERROR_MONITOR_TIMEOUT_MS: "10",
    },
    logger() {},
    warnLogger(line) {
      warningLines.push(line);
    },
    fetchImpl: async () => {
      throw new Error("monitor-secret delivery failure");
    },
  },
);

assert.equal(notDelivered.delivered, false);
assert.equal(warningLines.length, 1);
assert.equal(warningLines[0].includes("monitor-secret"), false);

const loggerFailure = await reportError(
  {
    event: "logger_failed",
    stage: "monitoring",
    requestId: "request-logger-123",
    error: new Error("Original business error"),
  },
  {
    env: {},
    logger() {
      throw new Error("Logger unavailable");
    },
    warnLogger() {},
  },
);

assert.equal(loggerFailure.delivered, false);
assert.equal(loggerFailure.event.event, "logger_failed");

console.log("Monitoring core tests passed.");

export const maxDuration = 180;

import { NextResponse } from "next/server";
import { createGeneration } from "../../../generation-core.mjs";
import { createRequestId, reportError } from "../../../monitoring-core.mjs";
import {
  buildClientCookie,
  consumeGenerationCredit,
  getClientSession,
  getQuotaState
} from "../../../quota-store.mjs";

function json(body, status, session, requestId) {
  const headers = {
    ...(session?.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {}),
    "X-Request-Id": requestId
  };
  return NextResponse.json(body, { status, headers });
}

export async function POST(request) {
  const requestId = createRequestId(request);
  const startedAt = Date.now();
  let session = null;
  let providerPredictionId;

  try {
    session = getClientSession(request.headers.get("cookie") ?? "");
    const body = await request.json();

    if (!body.idea?.trim()) {
      return json({ error: "Tattoo idea is required." }, 400, session, requestId);
    }

    const quota = await getQuotaState(session.ownerId);

    if (quota.totalRemaining <= 0) {
      return json(
        {
          error: "No free generations remaining. Upgrade to continue generating tattoo ideas.",
          quota
        },
        402,
        session,
        requestId
      );
    }

    const generation = await createGeneration({ ...body, idea: body.idea.trim() });
    providerPredictionId = generation.predictionId;

    if ("error" in generation) {
      const qualityFailure = generation.code === "quality_no_usable_candidates";
      const failureStatus = qualityFailure ? 422 : 501;
      await reportError({
        event: "concept_generation_failed",
        stage: qualityFailure ? "quality_gate" : "provider",
        route: "/api/generate",
        requestId,
        ownerId: session.ownerId,
        provider: generation.provider,
        providerPredictionId: generation.predictionId,
        error: new Error(generation.error),
        statusCode: failureStatus,
        durationMs: Date.now() - startedAt,
        retryable: !qualityFailure
      });
      return json(generation, failureStatus, session, requestId);
    }

    const saved = await consumeGenerationCredit(session.ownerId, body, generation);

    return json(
      {
        ...generation,
        status: "ready",
        images: saved.generation.images ?? generation.images,
        conceptCandidates: saved.generation.conceptCandidates ?? generation.conceptCandidates,
        savedGenerationId: saved.generation.id,
        quota: saved.quota
      },
      200,
      session,
      requestId
    );
  } catch (error) {
    await reportError({
      event: "concept_route_failed",
      stage: "route",
      route: "/api/generate",
      requestId,
      ownerId: session?.ownerId,
      provider: providerPredictionId ? "replicate" : undefined,
      providerPredictionId,
      error,
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      retryable: true
    });
    return json(
      { error: error.message ?? "Could not complete generation. Please try again." },
      500,
      session,
      requestId
    );
  }
}

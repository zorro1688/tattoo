export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createLineworkGeneration } from "../../../../generation-core.mjs";
import { createRequestId, reportError } from "../../../../monitoring-core.mjs";
import { createSignedConceptUrlForLinework } from "../../../../supabase-store.mjs";
import {
  buildClientCookie,
  consumeLineworkCredit,
  getClientSession,
  getGeneration,
  getQuotaState,
  updateGenerationConceptSelection
} from "../../../../quota-store.mjs";

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
  let generationId;
  let providerPredictionId;

  try {
    session = getClientSession(request.headers.get("cookie") ?? "");
    const body = await request.json();
    generationId = body.generationId;

    if (!body.generationId) {
      return json({ error: "Saved generation id is required." }, 400, session, requestId);
    }

    let savedGeneration = await getGeneration(session.ownerId, body.generationId);

    if (!savedGeneration) {
      return json({ error: "Saved generation was not found." }, 404, session, requestId);
    }

    if (body.selectedConceptUrl) {
      const selected = await updateGenerationConceptSelection(session.ownerId, body.generationId, body.selectedConceptUrl);
      savedGeneration = selected.generation;
    }

    const quota = await getQuotaState(session.ownerId);

    if (quota.totalRemaining <= 0) {
      return json(
        {
          error: "No generation credits remaining. Upgrade to create linework.",
          quota
        },
        402,
        session,
        requestId
      );
    }

    const signedConceptUrl = await createSignedConceptUrlForLinework(
      session.ownerId,
      savedGeneration.images?.concept
    );
    const lineworkGeneration = {
      ...savedGeneration,
      images: {
        ...savedGeneration.images,
        concept: signedConceptUrl
      }
    };
    const linework = await createLineworkGeneration(lineworkGeneration);
    providerPredictionId = linework.predictionId;

    if ("error" in linework) {
      await reportError({
        event: "linework_generation_failed",
        stage: "provider",
        route: "/api/generate/linework",
        requestId,
        generationId,
        ownerId: session.ownerId,
        provider: linework.provider,
        providerPredictionId: linework.predictionId,
        error: new Error(linework.error),
        statusCode: 501,
        durationMs: Date.now() - startedAt,
        retryable: true
      });
      return json(linework, 501, session, requestId);
    }

    const updated = await consumeLineworkCredit(session.ownerId, body.generationId, linework);

    return json(
      {
        ...linework,
        lineworkStatus: "ready",
        generation: updated.generation,
        quota: updated.quota
      },
      200,
      session,
      requestId
    );
  } catch (error) {
    await reportError({
      event: "linework_route_failed",
      stage: "route",
      route: "/api/generate/linework",
      requestId,
      generationId,
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

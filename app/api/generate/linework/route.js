export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createLineworkGeneration } from "../../../../generation-core.mjs";
import {
  buildClientCookie,
  consumeLineworkCredit,
  getClientSession,
  getGeneration,
  getQuotaState,
  updateGenerationConceptSelection
} from "../../../../quota-store.mjs";

function json(body, status, session) {
  const headers = session?.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
  return NextResponse.json(body, { status, headers });
}

export async function POST(request) {
  try {
    const session = getClientSession(request.headers.get("cookie") ?? "");
    const body = await request.json();

    if (!body.generationId) {
    return json({ error: "Saved generation id is required." }, 400, session);
  }

    let savedGeneration = await getGeneration(session.ownerId, body.generationId);

    if (!savedGeneration) {
    return json({ error: "Saved generation was not found." }, 404, session);
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
      session
    );
  }

    const linework = await createLineworkGeneration(savedGeneration);

    if ("error" in linework) {
    return json(linework, 501, session);
  }

    const updated = await consumeLineworkCredit(session.ownerId, body.generationId, linework);

    return json(
    {
      ...linework,
      generation: updated.generation,
      quota: updated.quota
    },
    200,
    session
    );
  } catch (error) {
    return json(
      { error: error.message ?? "Could not complete generation. Please try again." },
      500,
      typeof session !== "undefined" ? session : null
    );
  }
}

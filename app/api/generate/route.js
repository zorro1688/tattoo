export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createGeneration } from "../../../generation-core.mjs";
import {
  buildClientCookie,
  consumeGenerationCredit,
  getClientSession,
  getQuotaState
} from "../../../quota-store.mjs";

function json(body, status, session) {
  const headers = session?.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
  return NextResponse.json(body, { status, headers });
}

export async function POST(request) {
  try {
    const session = getClientSession(request.headers.get("cookie") ?? "");
    const body = await request.json();

    if (!body.idea?.trim()) {
    return json({ error: "Tattoo idea is required." }, 400, session);
  }

    const quota = await getQuotaState(session.ownerId);

    if (quota.totalRemaining <= 0) {
    return json(
      {
        error: "No free generations remaining. Upgrade to continue generating tattoo ideas.",
        quota
      },
      402,
      session
    );
  }

    const generation = await createGeneration({ ...body, idea: body.idea.trim() });

    if ("error" in generation) {
    return json(generation, 501, session);
  }

    const saved = await consumeGenerationCredit(session.ownerId, body, generation);

    return json(
    {
      ...generation,
      images: saved.generation.images ?? generation.images,
      conceptCandidates: saved.generation.conceptCandidates ?? generation.conceptCandidates,
      savedGenerationId: saved.generation.id,
      quota: saved.quota
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

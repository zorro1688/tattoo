import { NextResponse } from "next/server";
import { buildClientCookie, getClientSession, getGeneration, updateGenerationConceptSelection, updateGenerationPlacementAdjustment } from "../../../quota-store.mjs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = { "Cache-Control": "private, no-store", ...(session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {}) };
  const generationId = searchParams.get("id");

  if (!generationId) {
    return NextResponse.json({ error: "Saved generation id is required." }, { status: 400, headers });
  }

  const generation = await getGeneration(session.ownerId, generationId);

  if (!generation) {
    return NextResponse.json({ error: "Saved generation was not found." }, { status: 404, headers });
  }

  return NextResponse.json({ generation }, { status: 200, headers });
}


export async function PATCH(request) {
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = { "Cache-Control": "private, no-store", ...(session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {}) };
  const body = await request.json().catch(() => ({}));

  if (!body.generationId) {
    return NextResponse.json({ error: "Saved generation id is required." }, { status: 400, headers });
  }

  try {
    const updated = body.selectedConceptUrl
      ? await updateGenerationConceptSelection(session.ownerId, body.generationId, body.selectedConceptUrl)
      : await updateGenerationPlacementAdjustment(
          session.ownerId,
          body.generationId,
          body.placementAdjustment ?? null
        );

    return NextResponse.json({ generation: updated.generation }, { status: 200, headers });
  } catch (error) {
    const message = error.message ?? "Could not update saved generation.";
    const status = message === "Saved generation was not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status, headers });
  }
}

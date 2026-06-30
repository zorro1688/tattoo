import { NextResponse } from "next/server";
import { buildClientCookie, getClientSession, getGeneration } from "../../../quota-store.mjs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
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

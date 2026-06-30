import { NextResponse } from "next/server";
import { buildClientCookie, getClientSession, listGenerations } from "../../../quota-store.mjs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
  const generations = await listGenerations(session.ownerId, {
    limit: Number(searchParams.get("limit") ?? 6)
  });

  return NextResponse.json({ generations }, { status: 200, headers });
}

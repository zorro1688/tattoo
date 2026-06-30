import { NextResponse } from "next/server";
import { buildClientCookie, getClientSession, getQuotaState } from "../../../quota-store.mjs";

export async function GET(request) {
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const quota = await getQuotaState(session.ownerId);
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};

  return NextResponse.json({ quota }, { status: 200, headers });
}

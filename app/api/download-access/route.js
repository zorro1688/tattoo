import { NextResponse } from "next/server";
import { buildClientCookie, getClientSession, getDownloadAccess } from "../../../quota-store.mjs";

export async function GET(request) {
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
  const downloadAccess = await getDownloadAccess(session.ownerId);

  return NextResponse.json({ downloadAccess }, { status: 200, headers });
}

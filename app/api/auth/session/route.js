import { NextResponse } from "next/server";
import { buildClientCookie, getClientSession } from "../../../../quota-store.mjs";

export async function GET(request) {
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};

  return NextResponse.json(
    {
      authenticated: Boolean(session.userId),
      user: session.userId ? { id: session.userId, email: session.email } : null
    },
    { status: 200, headers }
  );
}

import { NextResponse } from "next/server";
import { buildClientCookie, getBillingHistory, getClientSession } from "../../../quota-store.mjs";

export async function GET(request) {
  const url = new URL(request.url);
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};

  if (!session.isAuthenticated || !session.userId) {
    return NextResponse.json(
      { error: "Sign in to view billing history." },
      { status: 401, headers }
    );
  }

  const history = await getBillingHistory(session.userId, {
    limit: Number(url.searchParams.get("limit") ?? 20)
  });

  return NextResponse.json(history, { status: 200, headers });
}

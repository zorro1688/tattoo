import { NextResponse } from "next/server";
import { requestEmailOtp } from "../../../../auth-core.mjs";
import { buildClientCookie, getClientSession } from "../../../../quota-store.mjs";

export async function POST(request) {
  try {
    const session = getClientSession(request.headers.get("cookie") ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
    const body = await request.json();
    const { origin } = new URL(request.url);
    const result = await requestEmailOtp(body.email, origin);

    return NextResponse.json({ sent: true, email: result.email }, { status: 200, headers });
  } catch (error) {
    return NextResponse.json(
      { error: error.message ?? "Could not send verification code." },
      { status: 400 }
    );
  }
}

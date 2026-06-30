import { NextResponse } from "next/server";
import { buildAuthCookie, verifyEmailOtp } from "../../../../auth-core.mjs";
import {
  buildClientCookie,
  getClientSession,
  mergeLocalAnonymousClientIntoUser
} from "../../../../quota-store.mjs";
import { mergeAnonymousClientIntoUser } from "../../../../supabase-store.mjs";

export async function POST(request) {
  try {
    const session = getClientSession(request.headers.get("cookie") ?? "");
    const body = await request.json();
    const result = await verifyEmailOtp(body.email, body.token);
    await mergeLocalAnonymousClientIntoUser(session.clientId, result.user);
    await mergeAnonymousClientIntoUser(session.clientId, result.user);
    const headers = new Headers();

    headers.append("Set-Cookie", buildClientCookie(session.clientId));
    headers.append("Set-Cookie", buildAuthCookie(result.user));

    return NextResponse.json(
      {
        authenticated: true,
        user: result.user
      },
      { status: 200, headers }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error.message ?? "Could not verify code." },
      { status: 400 }
    );
  }
}

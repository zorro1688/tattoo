import { NextResponse } from "next/server";
import { createCreemCheckout } from "../../../../billing-core.mjs";
import { buildClientCookie, getClientSession } from "../../../../quota-store.mjs";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const plan = searchParams.get("plan") ?? "creator-pack";
  const returnTo = searchParams.get("returnTo") ?? "";
  const provider = process.env.PAYMENT_PROVIDER ?? "creem";

  if (provider !== "creem") {
    return NextResponse.json(
      { error: `Payment provider "${provider}" is not enabled yet.` },
      { status: 400 }
    );
  }

  try {
    const session = getClientSession(request.headers.get("cookie") ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};

    if (!session.isAuthenticated) {
      return NextResponse.json(
        { error: "Sign in before upgrading so your credits and download access stay with your account." },
        { status: 401, headers }
      );
    }

    const checkout = await createCreemCheckout({
      plan,
      clientId: session.ownerId,
      origin: process.env.NEXT_PUBLIC_APP_URL?.trim() || origin,
      returnTo
    });

    return NextResponse.json(checkout, { status: 200, headers });
  } catch (error) {
    return NextResponse.json({ error: error.message, plan }, { status: 501 });
  }
}

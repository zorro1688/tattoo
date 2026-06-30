import { createGoogleOAuthStart } from "../../../../../auth-core.mjs";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || url.origin;
    const oauth = createGoogleOAuthStart({
      origin,
      returnTo: url.searchParams.get("returnTo") ?? "/my-designs"
    });
    const headers = new Headers({ Location: oauth.redirectUrl });

    for (const cookie of oauth.cookies) {
      headers.append("Set-Cookie", cookie);
    }

    return new Response(null, { status: 302, headers });
  } catch (error) {
    return Response.json(
      { error: error.message ?? "Google sign in is not configured." },
      { status: 400 }
    );
  }
}
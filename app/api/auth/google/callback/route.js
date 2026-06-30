import {
  buildAuthCookie,
  clearOAuthCookies,
  exchangeGoogleOAuthCode,
  getOAuthState
} from "../../../../../auth-core.mjs";
import {
  buildClientCookie,
  getClientSession,
  mergeLocalAnonymousClientIntoUser
} from "../../../../../quota-store.mjs";
import { mergeAnonymousClientIntoUser } from "../../../../../supabase-store.mjs";

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(null, { status: 302, headers });
}

export async function GET(request) {
  const url = new URL(request.url);
  const oauthState = getOAuthState(request.headers.get("cookie") ?? "");
  const session = getClientSession(request.headers.get("cookie") ?? "");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return redirect("/?auth=google_cancelled", clearOAuthCookies());
  }

  try {
    const result = await exchangeGoogleOAuthCode({ code, verifier: oauthState.verifier });
    await mergeLocalAnonymousClientIntoUser(session.clientId, result.user);
    await mergeAnonymousClientIntoUser(session.clientId, result.user);

    return redirect(oauthState.returnTo, [
      buildClientCookie(session.clientId),
      buildAuthCookie(result.user),
      ...clearOAuthCookies()
    ]);
  } catch (error) {
    return redirect(
      `/?auth=google_error&message=${encodeURIComponent(error.message ?? "Google sign in failed")}`,
      clearOAuthCookies()
    );
  }
}
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const authCookieName = "inkfirst_auth";

function getSupabaseAuthConfig(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase Auth is not configured.");
  }

  return {
    authUrl: `${url.replace(/\/$/, "")}/auth/v1`,
    key
  };
}

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function authHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
}
function randomBase64Url(byteLength = 32, randomBytesImpl = randomBytes) {
  return randomBytesImpl(byteLength).toString("base64url");
}

function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function safeReturnTo(value = "") {
  const returnTo = String(value || "");
  return returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/my-designs";
}

export function buildOAuthCookie(name, value, maxAge = 600) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

export function clearOAuthCookies() {
  return [
    "inkfirst_oauth_verifier=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    "inkfirst_oauth_return_to=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
  ];
}

export function getOAuthState(cookieHeader = "") {
  const cookies = parseCookies(cookieHeader);

  return {
    verifier: cookies.inkfirst_oauth_verifier ?? "",
    returnTo: safeReturnTo(cookies.inkfirst_oauth_return_to)
  };
}

export function createGoogleOAuthStart({ origin, returnTo = "/my-designs", env = process.env, randomBytesImpl = randomBytes }) {
  const config = getSupabaseAuthConfig(env);
  const verifier = randomBase64Url(32, randomBytesImpl);
  const challenge = sha256Base64Url(verifier);
  const callbackUrl = `${String(origin).replace(/\/$/, "")}/api/auth/google/callback`;
  const redirect = new URL(`${config.authUrl}/authorize`);

  redirect.searchParams.set("provider", "google");
  redirect.searchParams.set("redirect_to", callbackUrl);
  redirect.searchParams.set("flow_type", "pkce");
  redirect.searchParams.set("code_challenge", challenge);
  redirect.searchParams.set("code_challenge_method", "s256");

  const safePath = safeReturnTo(returnTo);

  return {
    redirectUrl: redirect.toString(),
    returnTo: safePath,
    cookies: [
      buildOAuthCookie("inkfirst_oauth_verifier", verifier),
      buildOAuthCookie("inkfirst_oauth_return_to", safePath)
    ]
  };
}


async function readAuthResponse(response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body.error_description || body.msg || body.message || "Supabase Auth request failed.");
  }

  return body;
}

export async function requestEmailOtp(email, origin, env = process.env, fetchImpl = fetch) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  const config = getSupabaseAuthConfig(env);
  const response = await fetchImpl(`${config.authUrl}/otp`, {
    method: "POST",
    headers: authHeaders(config.key),
    body: JSON.stringify({
      email: normalizedEmail,
      type: "email",
      create_user: true,
      options: {
        email_redirect_to: origin
      }
    })
  });

  await readAuthResponse(response);

  return { email: normalizedEmail };
}

export async function exchangeGoogleOAuthCode({ code, verifier, env = process.env, fetchImpl = fetch }) {
  const normalizedCode = String(code ?? "").trim();
  const normalizedVerifier = String(verifier ?? "").trim();

  if (!normalizedCode || !normalizedVerifier) {
    throw new Error("Google sign in could not be verified. Please try again.");
  }

  const config = getSupabaseAuthConfig(env);
  const response = await fetchImpl(`${config.authUrl}/token?grant_type=pkce`, {
    method: "POST",
    headers: authHeaders(config.key),
    body: JSON.stringify({
      auth_code: normalizedCode,
      code_verifier: normalizedVerifier
    })
  });
  const body = await readAuthResponse(response);

  if (!body.user?.id) {
    throw new Error("Supabase Auth did not return a user.");
  }

  return {
    user: {
      id: body.user.id,
      email: body.user.email ?? ""
    },
    session: body.session
  };
}
export async function verifyEmailOtp(email, token, env = process.env, fetchImpl = fetch) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = String(token ?? "").trim();

  if (!normalizedEmail || !normalizedToken) {
    throw new Error("Email and verification code are required.");
  }

  const config = getSupabaseAuthConfig(env);
  const response = await fetchImpl(`${config.authUrl}/verify`, {
    method: "POST",
    headers: authHeaders(config.key),
    body: JSON.stringify({
      email: normalizedEmail,
      token: normalizedToken,
      type: "email"
    })
  });
  const body = await readAuthResponse(response);

  if (!body.user?.id) {
    throw new Error("Supabase Auth did not return a user.");
  }

  return {
    user: {
      id: body.user.id,
      email: body.user.email ?? normalizedEmail
    },
    session: body.session
  };
}

function cookieSecret(env = process.env) {
  return env.AUTH_COOKIE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "inkfirst-local-auth-secret";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload, env = process.env) {
  return createHmac("sha256", cookieSecret(env)).update(payload).digest("base64url");
}

export function buildAuthCookie(user, env = process.env) {
  const payload = base64UrlEncode(JSON.stringify({
    userId: user.id,
    email: user.email ?? "",
    issuedAt: Date.now()
  }));
  const signature = signPayload(payload, env);
  const maxAge = 60 * 60 * 24 * 30;

  return `${authCookieName}=${payload}.${signature}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

export function signOutCookie() {
  return `${authCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...valueParts] = part.split("=");
        return [key, decodeURIComponent(valueParts.join("="))];
      })
  );
}

export function getAuthSession(cookieHeader = "", env = process.env) {
  const value = parseCookies(cookieHeader)[authCookieName];

  if (!value || !value.includes(".")) {
    return null;
  }

  const [payload, signature] = value.split(".");
  const expected = signPayload(payload, env);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const parsed = JSON.parse(base64UrlDecode(payload));

  if (!parsed.userId) {
    return null;
  }

  return parsed;
}

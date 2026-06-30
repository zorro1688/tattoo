import assert from "node:assert/strict";
import {
  buildAuthCookie,
  getAuthSession,
  requestEmailOtp,
  signOutCookie,
  verifyEmailOtp,
  createGoogleOAuthStart,
  exchangeGoogleOAuthCode
} from "../auth-core.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  AUTH_COOKIE_SECRET: "cookie-secret"
};

await run("requestEmailOtp calls Supabase Auth OTP endpoint", async () => {
  const calls = [];
  const result = await requestEmailOtp(
    "USER@Example.COM ",
    "http://localhost:3000",
    env,
    async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => "{}" };
    }
  );

  assert.equal(result.email, "user@example.com");
  assert.match(calls[0].url, /\/auth\/v1\/otp$/);
  assert.equal(calls[0].options.headers.apikey, "publishable-key");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: "user@example.com",
    type: "email",
    create_user: true,
    options: {
      email_redirect_to: "http://localhost:3000"
    }
  });
});

await run("verifyEmailOtp returns the authenticated Supabase user", async () => {
  const result = await verifyEmailOtp(
    "user@example.com",
    "123456",
    env,
    async (url, options) => {
      assert.match(url, /\/auth\/v1\/verify$/);
      assert.equal(JSON.parse(options.body).token, "123456");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "user@example.com"
          }
        })
      };
    }
  );

  assert.equal(result.user.id, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.user.email, "user@example.com");
});

await run("signed auth cookie round trips and rejects tampering", () => {
  const cookie = buildAuthCookie(
    {
      id: "00000000-0000-4000-8000-000000000001",
      email: "user@example.com"
    },
    env
  );
  const session = getAuthSession(cookie, env);
  const tampered = getAuthSession(cookie.replace(/\.[^.;]+/, ".bad-signature"), env);

  assert.equal(session.userId, "00000000-0000-4000-8000-000000000001");
  assert.equal(session.email, "user@example.com");
  assert.equal(tampered, null);
  assert.match(signOutCookie(), /Max-Age=0/);
});

await run("createGoogleOAuthStart builds a Supabase Google OAuth URL with PKCE cookies", async () => {
  const result = await createGoogleOAuthStart({
    origin: "http://localhost:3000",
    returnTo: "/billing",
    env,
    randomBytesImpl: () => Buffer.from("0123456789abcdef0123456789abcdef"),
  });

  assert.match(result.redirectUrl, /^http:\/\/127\.0\.0\.1:54321\/auth\/v1\/authorize\?/);
  const url = new URL(result.redirectUrl);
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(url.searchParams.get("redirect_to"), "http://localhost:3000/api/auth/google/callback");
  assert.equal(url.searchParams.get("flow_type"), "pkce");
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.equal(result.returnTo, "/billing");
  assert.equal(result.cookies.length, 2);
  assert.match(result.cookies.join("\n"), /inkfirst_oauth_verifier=/);
  assert.match(result.cookies.join("\n"), /inkfirst_oauth_return_to=%2Fbilling/);
});

await run("exchangeGoogleOAuthCode exchanges a callback code for a Supabase user", async () => {
  const calls = [];
  const result = await exchangeGoogleOAuthCode({
    code: "oauth-code",
    verifier: "pkce-verifier",
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          user: {
            id: "00000000-0000-4000-8000-000000000002",
            email: "google@example.com"
          },
          session: { access_token: "token" }
        })
      };
    }
  });

  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=pkce$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    auth_code: "oauth-code",
    code_verifier: "pkce-verifier"
  });
  assert.equal(result.user.id, "00000000-0000-4000-8000-000000000002");
  assert.equal(result.user.email, "google@example.com");
});
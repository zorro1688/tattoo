import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createCreemCheckout, parseCreemWebhook } from "./billing-core.mjs";
import { isCreditGrantingEvent } from "./billing-history-core.mjs";
import { resolveDownloadFile } from "./download-core.mjs";
import { createGeneration, createLineworkGeneration } from "./generation-core.mjs";
import {
  buildAuthCookie,
  clearOAuthCookies,
  createGoogleOAuthStart,
  exchangeGoogleOAuthCode,
  getOAuthState,
  requestEmailOtp,
  signOutCookie,
  verifyEmailOtp
} from "./auth-core.mjs";
import {
  addPaidCredits,
  buildClientCookie,
  consumeGenerationCredit,
  consumeLineworkCredit,
  getClientSession,
  getDownloadAccess,
  getBillingHistory,
  getGeneration,
  updateGenerationConceptSelection,
  updateGenerationPlacementAdjustment,
  getQuotaState,
  listGenerations,
  mergeLocalAnonymousClientIntoUser,
  recordBillingEvent
} from "./quota-store.mjs";
import { fetchOwnedStorageImage, mergeAnonymousClientIntoUser } from "./supabase-store.mjs";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

loadLocalEnv();

const root = process.cwd();
const port = Number(process.env.PORT ?? 3000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

async function readRawBody(request) {
  let raw = "";

  for await (const chunk of request) {
    raw += chunk;
  }

  return raw;
}

async function readJsonBody(request) {
  const raw = await readRawBody(request);

  return raw ? JSON.parse(raw) : {};
}

function writeJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function writeDownload(response, file, headers = {}) {
  if (file.error) {
    writeJson(response, file.status, { error: file.error }, headers);
    return;
  }

  response.writeHead(file.status, {
    "Content-Type": file.contentType,
    "Content-Disposition": `attachment; filename="${file.filename}"`,
    "Cache-Control": "private, no-store",
    ...headers
  });
  response.end(file.body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);

  if (url.pathname === "/api/quota" && request.method === "GET") {
    const session = getClientSession(request.headers.cookie ?? "");
    const quota = await getQuotaState(session.ownerId);
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};

    writeJson(response, 200, { quota }, headers);
    return;
  }

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const session = getClientSession(request.headers.cookie ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};

    writeJson(response, 200, {
      authenticated: Boolean(session.userId),
      user: session.userId ? { id: session.userId, email: session.email } : null
    }, headers);
    return;
  }

  if (url.pathname === "/api/auth/google/start" && request.method === "GET") {
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || `http://${request.headers.host ?? `localhost:${port}`}`;
      const oauth = createGoogleOAuthStart({
        origin,
        returnTo: url.searchParams.get("returnTo") ?? "/my-designs"
      });

      response.writeHead(302, {
        Location: oauth.redirectUrl,
        "Set-Cookie": oauth.cookies
      });
      response.end();
    } catch (error) {
      writeJson(response, 400, { error: error.message ?? "Google sign in is not configured." });
    }
    return;
  }

  if (url.pathname === "/api/auth/google/callback" && request.method === "GET") {
    const oauthState = getOAuthState(request.headers.cookie ?? "");
    const session = getClientSession(request.headers.cookie ?? "");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      response.writeHead(302, {
        Location: "/?auth=google_cancelled",
        "Set-Cookie": clearOAuthCookies()
      });
      response.end();
      return;
    }

    try {
      const result = await exchangeGoogleOAuthCode({ code, verifier: oauthState.verifier });
      await mergeLocalAnonymousClientIntoUser(session.clientId, result.user);
      await mergeAnonymousClientIntoUser(session.clientId, result.user);
      response.writeHead(302, {
        Location: oauthState.returnTo,
        "Set-Cookie": [
          buildClientCookie(session.clientId),
          buildAuthCookie(result.user),
          ...clearOAuthCookies()
        ]
      });
      response.end();
    } catch (error) {
      response.writeHead(302, {
        Location: `/?auth=google_error&message=${encodeURIComponent(error.message ?? "Google sign in failed")}`,
        "Set-Cookie": clearOAuthCookies()
      });
      response.end();
    }
    return;
  }
  if (url.pathname === "/api/auth/request-otp" && request.method === "POST") {
    try {
      const session = getClientSession(request.headers.cookie ?? "");
      const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
      const body = await readJsonBody(request);
      const result = await requestEmailOtp(body.email, `http://${request.headers.host ?? `localhost:${port}`}`);

      writeJson(response, 200, { sent: true, email: result.email }, headers);
    } catch (error) {
      writeJson(response, 400, { error: error.message ?? "Could not send verification code." });
    }
    return;
  }

  if (url.pathname === "/api/auth/verify-otp" && request.method === "POST") {
    try {
      const session = getClientSession(request.headers.cookie ?? "");
      const body = await readJsonBody(request);
      const result = await verifyEmailOtp(body.email, body.token);
      await mergeLocalAnonymousClientIntoUser(session.clientId, result.user);
      await mergeAnonymousClientIntoUser(session.clientId, result.user);
      const headers = [
        buildClientCookie(session.clientId),
        buildAuthCookie(result.user)
      ];

      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "Set-Cookie": headers
      });
      response.end(JSON.stringify({
        authenticated: true,
        user: result.user
      }));
    } catch (error) {
      writeJson(response, 400, { error: error.message ?? "Could not verify code." });
    }
    return;
  }

  if (url.pathname === "/api/auth/sign-out" && request.method === "POST") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "Set-Cookie": signOutCookie()
    });
    response.end(JSON.stringify({ authenticated: false }));
    return;
  }

  if (url.pathname === "/api/generations" && request.method === "GET") {
    const session = getClientSession(request.headers.cookie ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
    const generations = await listGenerations(session.ownerId, {
      limit: Number(url.searchParams.get("limit") ?? 6)
    });

    writeJson(response, 200, { generations }, headers);
    return;
  }

  if (url.pathname === "/api/generation" && request.method === "PATCH") {
    const session = getClientSession(request.headers.cookie);
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
    const body = await readJson(request);

    if (!body.generationId) {
      writeJson(response, 400, { error: "Saved generation id is required." }, headers);
      return;
    }

    try {
      const updated = body.selectedConceptUrl
        ? await updateGenerationConceptSelection(session.ownerId, body.generationId, body.selectedConceptUrl)
        : await updateGenerationPlacementAdjustment(
            session.ownerId,
            body.generationId,
            body.placementAdjustment ?? null
          );
      writeJson(response, 200, { generation: updated.generation }, headers);
    } catch (error) {
      const message = error.message ?? "Could not update saved generation.";
      writeJson(response, message === "Saved generation was not found" ? 404 : 400, { error: message }, headers);
    }
    return;
  }

  if (url.pathname === "/api/generation" && request.method === "GET") {
    const session = getClientSession(request.headers.cookie ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
    const generationId = url.searchParams.get("id");

    if (!generationId) {
      writeJson(response, 400, { error: "Saved generation id is required." }, headers);
      return;
    }

    const generation = await getGeneration(session.ownerId, generationId);

    if (!generation) {
      writeJson(response, 404, { error: "Saved generation was not found." }, headers);
      return;
    }

    writeJson(response, 200, { generation }, headers);
    return;
  }

  if (url.pathname === "/api/storage-image" && request.method === "GET") {
    const session = getClientSession(request.headers.cookie ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
    const image = await fetchOwnedStorageImage(session.ownerId, url.searchParams.get("path"));

    if (!image?.ok) {
      writeJson(response, 404, { error: "Image was not found." }, headers);
      return;
    }

    response.writeHead(200, {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=300",
      ...headers
    });
    response.end(image.body);
    return;
  }

  if (url.pathname === "/api/download-access" && request.method === "GET") {
    const session = getClientSession(request.headers.cookie ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
    const downloadAccess = await getDownloadAccess(session.ownerId);

    writeJson(response, 200, { downloadAccess }, headers);
    return;
  }

  if (url.pathname === "/api/billing-events" && request.method === "GET") {
    const session = getClientSession(request.headers.cookie ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};

    if (!session.isAuthenticated || !session.userId) {
      writeJson(response, 401, { error: "Sign in to view billing history." }, headers);
      return;
    }

    const history = await getBillingHistory(session.userId, {
      limit: Number(url.searchParams.get("limit") ?? 20)
    });

    writeJson(response, 200, history, headers);
    return;
  }

  if (url.pathname === "/api/download" && request.method === "GET") {
    const session = getClientSession(request.headers.cookie ?? "");
    const headers = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
    const file = await resolveDownloadFile({
      clientId: session.ownerId,
      generationId: url.searchParams.get("generationId"),
      type: url.searchParams.get("type"),
      selectedConceptUrl: url.searchParams.get("selectedConceptUrl") ?? "",
      publicBaseUrl: request.headers.host ? `http://${request.headers.host}` : `http://localhost:${PORT}`
    });

    writeDownload(response, file, headers);
    return;
  }

  if (url.pathname === "/api/generate" && request.method === "POST") {
    try {
      const session = getClientSession(request.headers.cookie ?? "");
      const cookieHeaders = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
      const body = await readJsonBody(request);

      if (!body.idea?.trim()) {
        writeJson(response, 400, { error: "Tattoo idea is required." }, cookieHeaders);
        return;
      }


      const quota = await getQuotaState(session.ownerId);

      if (quota.totalRemaining <= 0) {
        writeJson(
          response,
          402,
          {
            error: "No free generations remaining. Upgrade to continue generating tattoo ideas.",
            quota
          },
          cookieHeaders
        );
        return;
      }

      const generation = await createGeneration(body);

      if (generation.error) {
        writeJson(response, 501, generation, cookieHeaders);
        return;
      }

      const saved = await consumeGenerationCredit(session.ownerId, body, generation);

      writeJson(
        response,
        200,
        {
          ...generation,
          images: saved.generation.images ?? generation.images,
          conceptCandidates: saved.generation.conceptCandidates ?? generation.conceptCandidates,
          savedGenerationId: saved.generation.id,
          quota: saved.quota
        },
        cookieHeaders
      );
    } catch {
      writeJson(response, 400, { error: "Invalid generation request." });
    }
    return;
  }

  if (url.pathname === "/api/generate/linework" && request.method === "POST") {
    try {
      const session = getClientSession(request.headers.cookie ?? "");
      const cookieHeaders = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};
      const body = await readJsonBody(request);

      if (!body.generationId) {
        writeJson(response, 400, { error: "Saved generation id is required." }, cookieHeaders);
        return;
      }

      let savedGeneration = await getGeneration(session.ownerId, body.generationId);

      if (!savedGeneration) {
        writeJson(response, 404, { error: "Saved generation was not found." }, cookieHeaders);
        return;
      }

      if (body.selectedConceptUrl) {
        const selected = await updateGenerationConceptSelection(session.ownerId, body.generationId, body.selectedConceptUrl);
        savedGeneration = selected.generation;
      }

      const quota = await getQuotaState(session.ownerId);

      if (quota.totalRemaining <= 0) {
        writeJson(
          response,
          402,
          {
            error: "No generation credits remaining. Upgrade to create linework.",
            quota
          },
          cookieHeaders
        );
        return;
      }

      const linework = await createLineworkGeneration(savedGeneration);

      if (linework.error) {
        writeJson(response, 502, { ...linework, quota }, cookieHeaders);
        return;
      }

      const updated = await consumeLineworkCredit(session.ownerId, body.generationId, linework);

      writeJson(
        response,
        200,
        {
          ...linework,
          generation: updated.generation,
          quota: updated.quota
        },
        cookieHeaders
      );
    } catch (error) {
      writeJson(response, 400, { error: error.message ?? "Invalid linework request." });
    }
    return;
  }

  if (url.pathname === "/api/billing/checkout") {
    const provider = process.env.PAYMENT_PROVIDER ?? "creem";
    const plan = url.searchParams.get("plan") ?? "creator-pack";
    const returnTo = url.searchParams.get("returnTo") ?? "";

    if (provider !== "creem") {
      writeJson(response, 400, { error: `Payment provider "${provider}" is not enabled yet.` });
      return;
    }

    try {
      const session = getClientSession(request.headers.cookie ?? "");
      const cookieHeaders = session.isNew ? { "Set-Cookie": buildClientCookie(session.clientId) } : {};

      if (!session.isAuthenticated) {
        writeJson(
          response,
          401,
          { error: "Sign in before upgrading so your credits and download access stay with your account." },
          cookieHeaders
        );
        return;
      }

      const checkout = await createCreemCheckout({
        plan,
        clientId: session.ownerId,
        origin: process.env.NEXT_PUBLIC_APP_URL?.trim() || `http://${request.headers.host ?? `localhost:${port}`}`,
        returnTo
      });

      writeJson(response, 200, checkout, cookieHeaders);
    } catch (error) {
      writeJson(response, 501, { error: error.message, plan });
    }
    return;
  }

  if (
    (url.pathname === "/api/webhooks/creem" || url.pathname === "/api/webhook/creem") &&
    request.method === "POST"
  ) {
    try {
      const rawBody = await readRawBody(request);
      const signature = request.headers["creem-signature"] || request.headers["x-creem-signature"];
      const event = parseCreemWebhook(rawBody, signature, process.env.CREEM_WEBHOOK_SECRET);
      await recordBillingEvent(event);
      const result = isCreditGrantingEvent(event.eventType)
        ? await addPaidCredits(event.clientId, event.credits, {
            source: "creem",
            externalEventId: event.eventId,
            plan: event.plan
          })
        : null;

      writeJson(response, 200, { received: true, recorded: true, granted: Boolean(result?.granted) });
    } catch (error) {
      writeJson(response, 400, { error: error.message });
    }
    return;
  }

  const filePath =
    url.pathname === "/"
      ? "index.html"
      : url.pathname === "/my-designs"
        ? "my-designs.html"
        : url.pathname === "/design"
          ? "design.html"
          : url.pathname === "/success"
            ? "success.html"
            : url.pathname === "/billing"
              ? "billing.html"
              : url.pathname === "/qa-checklist"
                ? "qa-checklist.html"
                : url.pathname === "/billing-cancelled"
              ? "billing-cancelled.html"
              : url.pathname.slice(1);

  try {
    const body = await readFile(join(root, filePath));
    response.writeHead(200, { "content-type": types[extname(filePath)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`InkFirst running at http://localhost:${port}`);
});

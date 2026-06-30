import { createHmac, timingSafeEqual } from "node:crypto";

const plans = {
  "creator-pack": {
    name: "Creator Pack",
    credits: 20,
    productEnv: "CREEM_CREATOR_PACK_PRODUCT_ID",
    fallbackProductEnv: "CREEM_PRO_PRODUCT_ID"
  },
  "pro-monthly": {
    name: "Pro",
    credits: 50,
    productEnv: "CREEM_PRO_MONTHLY_PRODUCT_ID",
    fallbackProductEnv: "CREEM_PRO_PRODUCT_ID"
  },
  "pro-yearly": {
    name: "Pro Yearly",
    credits: 600,
    productEnv: "CREEM_PRO_YEARLY_PRODUCT_ID",
    fallbackProductEnv: "CREEM_PRO_PRODUCT_ID"
  }
};

export function getPlan(planId) {
  const plan = plans[planId];
  if (!plan) {
    throw new Error(`Unknown billing plan "${planId}".`);
  }

  return { id: planId, ...plan };
}

function getCreemApiBase(env = process.env) {
  if (env.CREEM_API_BASE_URL) {
    return env.CREEM_API_BASE_URL.replace(/\/$/, "");
  }

  return env.CREEM_API_KEY?.startsWith("creem_test_")
    ? "https://test-api.creem.io"
    : "https://api.creem.io";
}

function getProductId(plan, env = process.env) {
  return env[plan.productEnv] || env[plan.fallbackProductEnv];
}

function normalizeCheckoutUrl(payload) {
  return payload.checkout_url || payload.checkoutUrl || payload.url || payload.checkout?.url || "";
}

function buildSuccessUrl(origin, selectedPlan, returnTo = "") {
  const url = new URL("/success", origin);
  url.searchParams.set("checkout", "success");
  url.searchParams.set("plan", selectedPlan.id);

  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    url.searchParams.set("returnTo", returnTo);
  }

  return url.toString();
}

function buildCancelUrl(origin, selectedPlan) {
  const url = new URL("/billing-cancelled", origin);
  url.searchParams.set("plan", selectedPlan.id);

  return url.toString();
}

export async function createCreemCheckout({ plan, clientId, origin, returnTo }, env = process.env, fetchImpl = fetch) {
  const selectedPlan = getPlan(plan);
  const apiKey = env.CREEM_API_KEY;
  const productId = getProductId(selectedPlan, env);

  if (!apiKey) {
    throw new Error("CREEM_API_KEY is missing.");
  }

  if (!productId) {
    throw new Error(`${selectedPlan.productEnv} is missing.`);
  }

  const successUrl = buildSuccessUrl(origin, selectedPlan, returnTo);
  const requestId = `inkfirst_${clientId}_${selectedPlan.id}_${Date.now()}`;
  const response = await fetchImpl(`${getCreemApiBase(env)}/v1/checkouts`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      product_id: productId,
      request_id: requestId,
      success_url: successUrl,
      metadata: {
        app: "inkfirst",
        clientId,
        plan: selectedPlan.id,
        credits: String(selectedPlan.credits)
      }
    })
  });

  const payload = await response.json().catch(async () => ({ error: await response.text() }));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Creem checkout creation failed.");
  }

  const checkoutUrl = normalizeCheckoutUrl(payload);

  if (!checkoutUrl) {
    throw new Error("Creem checkout response did not include a checkout URL.");
  }

  return {
    checkoutUrl,
    plan: selectedPlan.id,
    credits: selectedPlan.credits
  };
}

function signatureCandidates(signature) {
  return String(signature ?? "")
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => {
      const [, value] = part.match(/^(?:v1|sha256)=([a-f0-9]+)$/i) ?? [];
      return value ? [value] : [part];
    })
    .filter((part) => /^[a-f0-9]+$/i.test(part));
}

function verifySignature(rawBody, signature, secret) {
  if (!secret) {
    throw new Error("CREEM_WEBHOOK_SECRET is missing.");
  }

  if (!signature) {
    throw new Error("Missing Creem webhook signature.");
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);

  const isValid = signatureCandidates(signature).some((candidate) => {
    const signatureBuffer = Buffer.from(candidate);
    return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
  });

  if (!isValid) {
    throw new Error("Invalid Creem webhook signature.");
  }
}

function getMetadata(payload) {
  return payload.object?.metadata || payload.data?.metadata || payload.metadata || {};
}

export function parseCreemWebhook(rawBody, signature, secret) {
  verifySignature(rawBody, signature, secret);

  const payload = JSON.parse(rawBody);
  const metadata = getMetadata(payload);
  const plan = metadata.plan;
  const selectedPlan = getPlan(plan);
  const credits = Number(metadata.credits || selectedPlan.credits);

  if (!metadata.clientId) {
    throw new Error("Creem webhook metadata is missing clientId.");
  }

  if (!Number.isFinite(credits) || credits <= 0) {
    throw new Error("Creem webhook metadata has invalid credits.");
  }

  return {
    eventId: payload.id || payload.eventId || payload.event_id,
    eventType: payload.eventType || payload.type || payload.event_type,
    clientId: metadata.clientId,
    plan,
    credits,
    raw: payload
  };
}

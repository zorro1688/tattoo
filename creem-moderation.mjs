const productionBaseUrl = "https://api.creem.io";
const sandboxBaseUrl = "https://test-api.creem.io";
const defaultTimeoutMs = 5000;

function unavailableResult() {
  return {
    allowed: false,
    decision: "unavailable",
    status: 503,
    code: "moderation_unavailable",
    error: "Safety review is temporarily unavailable. Please try again."
  };
}

function rejectedResult(decision) {
  return {
    allowed: false,
    decision,
    status: 400,
    code: "prompt_rejected",
    error: "This prompt cannot be processed under our Acceptable Use Policy. Please revise it and try again."
  };
}

function resolveTimeoutMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 15000) : defaultTimeoutMs;
}

export function buildCreemModerationPrompt(input) {
  if (typeof input === "string") {
    return input.trim();
  }

  const fields = [
    ["Idea", input?.idea],
    ["Style", input?.style],
    ["Placement", input?.placement],
    ["Size", input?.size],
    ["Complexity", input?.complexity],
    ["Additional instructions", input?.advancedPrompt],
    ["Generated prompt", input?.prompt]
  ];

  return fields
    .map(([label, value]) => [label, String(value ?? "").trim()])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export async function moderateImagePrompt(prompt, env = process.env, fetchImpl = fetch, options = {}) {
  if ((env.GENERATION_PROVIDER ?? "mock") === "mock") {
    return { allowed: true, decision: "allow", bypassed: true };
  }

  const apiKey = String(env.CREEM_API_KEY ?? "").trim();
  const normalizedPrompt = String(prompt ?? "").trim();

  if (!apiKey || !normalizedPrompt) {
    return unavailableResult();
  }

  const baseUrl = apiKey.startsWith("creem_test_") ? sandboxBaseUrl : productionBaseUrl;
  const payload = {
    prompt: normalizedPrompt,
    ...(options.externalId ? { external_id: String(options.externalId) } : {})
  };

  try {
    const response = await fetchImpl(`${baseUrl}/v1/moderation/prompt`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(resolveTimeoutMs(env.CREEM_MODERATION_TIMEOUT_MS))
    });

    if (!response.ok) {
      return unavailableResult();
    }

    const result = await response.json();
    const decision = result?.decision;

    if (
      decision === "allow" &&
      typeof result?.id === "string" &&
      result.id.trim() &&
      result?.object === "moderation_result"
    ) {
      return { allowed: true, decision, moderationId: result?.id };
    }

    if (decision === "flag" || decision === "deny") {
      return rejectedResult(decision);
    }

    return unavailableResult();
  } catch {
    return unavailableResult();
  }
}

export const defaultMockModel = "mock-static-assets";
export const defaultReplicateModel = "black-forest-labs/flux-schnell";
export const defaultReplicateLineworkModel = "black-forest-labs/flux-canny-pro";

export function resolveGenerationModel(env = process.env) {
  if (env.GENERATION_PROVIDER === "replicate") {
    return env.GENERATION_MODEL && env.GENERATION_MODEL !== defaultMockModel
      ? env.GENERATION_MODEL
      : defaultReplicateModel;
  }

  if (env.GENERATION_MODEL) {
    return env.GENERATION_MODEL;
  }

  return defaultMockModel;
}

export function resolveLineworkModel(env = process.env) {
  return env.REPLICATE_LINEWORK_MODEL || defaultReplicateLineworkModel;
}

export function getPlacementGuidance(placement = "Forearm", size = "Small", complexity = "Beginner friendly") {
  const notes = {
    Wrist: "Keep the design compact and readable. Thin lines work well, but very tiny details should be reduced.",
    Forearm: "Use a vertical composition with enough spacing so the design reads clearly from a distance.",
    "Upper arm": "A medium composition works well here, with room for stronger contrast and more detail.",
    Chest: "Centered or lightly symmetrical layouts usually feel more intentional on the chest.",
    Back: "The back can support larger designs, but the first version should still keep a clear focal point.",
    Ankle: "Small, clean shapes are safer for ankle placement because details can blur at small sizes.",
    Shoulder: "Curved or circular compositions fit the shoulder better than flat square layouts.",
    Rib: "Simple linework is usually easier to place on the rib area, especially for a first tattoo."
  };

  return `${notes[placement] ?? notes.Forearm} Recommended direction: ${size.toLowerCase()} size with ${complexity.toLowerCase()} complexity.`;
}

export function buildTattooPrompt(body) {
  const idea = body.idea.trim();
  const style = body.style ?? "Fine line";
  const placement = body.placement ?? "Forearm";
  const size = body.size ?? "Small";
  const complexity = body.complexity ?? "Beginner friendly";

  return `${style.toLowerCase()} ${size.toLowerCase()} tattoo design of ${idea}, suitable for ${placement.toLowerCase()} placement, ${complexity.toLowerCase()}, clean linework, white background, tattoo-ready composition, no skin, no mockup, no text`;
}

export function extractFirstImageUrl(output) {
  if (!output) {
    return "";
  }

  if (typeof output === "string") {
    return output.startsWith("http") ? output : "";
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      const url = extractFirstImageUrl(item);
      if (url) {
        return url;
      }
    }
    return "";
  }

  if (typeof output === "object") {
    if (typeof output.url === "string" && output.url.startsWith("http")) {
      return output.url;
    }

    for (const value of Object.values(output)) {
      const url = extractFirstImageUrl(value);
      if (url) {
        return url;
      }
    }
  }

  return "";
}

function createBaseGeneration(body, env = process.env) {
  const placement = body.placement ?? "Forearm";
  const size = body.size ?? "Small";
  const complexity = body.complexity ?? "Beginner friendly";

  return {
    prompt: buildTattooPrompt(body),
    placementNote: getPlacementGuidance(placement, size, complexity),
    images: {
      concept: "/assets/hero-concept.png",
      linework: "/assets/hero-linework.png",
      placement: "/assets/hero-placement.png"
    },
    concepts: [
      { id: "concept-1", label: "Clean Concept" },
      { id: "concept-2", label: "Bold Option" },
      { id: "concept-3", label: "Small Tattoo" },
      { id: "concept-4", label: "Stencil Draft" }
    ],
    model: resolveGenerationModel(env)
  };
}

export function createMockGeneration(body, env = process.env) {
  return {
    id: `mock-${Date.now()}`,
    provider: "mock",
    status: "mock",
    ...createBaseGeneration(body, env)
  };
}

async function createReplicateGeneration(body, env = process.env, fetchImpl = fetch) {
  const token = env.REPLICATE_API_TOKEN;
  const model = resolveGenerationModel(env);

  if (!token) {
    return {
      error: "Replicate image generation is selected, but REPLICATE_API_TOKEN is missing.",
      provider: "replicate",
      model,
      status: "not_configured"
    };
  }

  const base = createBaseGeneration(body, env);
  const modelEndpoint = model.includes("/") && !/^[a-f0-9]{32,}$/i.test(model)
    ? `https://api.replicate.com/v1/models/${model}/predictions`
    : "https://api.replicate.com/v1/predictions";
  const requestBody = {
    input: {
      prompt: base.prompt,
      aspect_ratio: "1:1",
      output_format: "webp",
      output_quality: 90,
      num_outputs: 1
    }
  };

  if (modelEndpoint.endsWith("/v1/predictions")) {
    requestBody.version = model;
  }

  const response = await fetchImpl(modelEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60"
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(async () => ({ error: await response.text() }));

  if (!response.ok) {
    return {
      error: payload.detail ?? payload.error ?? "Replicate generation failed.",
      provider: "replicate",
      model,
      status: "failed"
    };
  }

  const conceptImage = extractFirstImageUrl(payload.output);

  if (!conceptImage) {
    return {
      error: `Replicate prediction did not return an image yet. Status: ${payload.status ?? "unknown"}.`,
      provider: "replicate",
      model,
      status: payload.status ?? "processing",
      predictionId: payload.id
    };
  }

  return {
    id: payload.id ?? `replicate-${Date.now()}`,
    provider: "replicate",
    status: payload.status ?? "succeeded",
    ...base,
    images: {
      concept: conceptImage
    }
  };
}

function createReplicatePredictionBody(model, input) {
  const modelEndpoint = model.includes("/") && !/^[a-f0-9]{32,}$/i.test(model)
    ? `https://api.replicate.com/v1/models/${model}/predictions`
    : "https://api.replicate.com/v1/predictions";
  const requestBody = { input };

  if (modelEndpoint.endsWith("/v1/predictions")) {
    requestBody.version = model;
  }

  return { modelEndpoint, requestBody };
}

function buildLineworkPrompt(generation) {
  const idea = generation.input?.idea ?? "tattoo concept";
  const style = generation.input?.style ?? "fine line";
  const placement = generation.input?.placement ?? "skin placement";
  const size = generation.input?.size ?? "small";

  return [
    `Create clean black tattoo stencil linework from this ${style.toLowerCase()} ${size.toLowerCase()} tattoo concept of ${idea}.`,
    `preserve the original subject and composition for ${placement.toLowerCase()} placement.`,
    "black ink only, white background, crisp thin outlines, tattoo flash stencil style.",
    "no shading, no grey, no gradients, no color, no skin, no mockup, no text.",
    "do not add new symbols, do not change the subject, do not add extra decorative elements.",
    "keep it readable as a tattoo artist reference and stencil draft."
  ].join(" ");
}

function createLineworkFailure({ provider, model, status = "failed", providerError, predictionId } = {}) {
  return {
    error: "Could not create linework. Your credit was not used. Try again in a moment.",
    provider,
    model,
    status,
    providerError,
    predictionId,
    creditUsed: false
  };
}

async function createReplicateLineworkGeneration(generation, env = process.env, fetchImpl = fetch) {
  const token = env.REPLICATE_API_TOKEN;
  const model = resolveLineworkModel(env);
  const conceptImage = generation.images?.concept;

  if (!token) {
    return {
      error: "Replicate linework generation is selected, but REPLICATE_API_TOKEN is missing.",
      provider: "replicate",
      model,
      status: "not_configured",
      creditUsed: false
    };
  }

  if (!conceptImage || !conceptImage.startsWith("http")) {
    return {
      error: "Linework generation requires a saved concept image URL.",
      provider: "replicate",
      model,
      status: "not_configured",
      creditUsed: false
    };
  }

  const { modelEndpoint, requestBody } = createReplicatePredictionBody(model, {
    prompt: buildLineworkPrompt(generation),
    control_image: conceptImage,
    aspect_ratio: "1:1",
    output_format: "webp",
    output_quality: 90
  });

  const response = await fetchImpl(modelEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60"
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(async () => ({ error: await response.text() }));

  if (!response.ok) {
    return createLineworkFailure({
      provider: "replicate",
      model,
      status: "failed",
      providerError: payload.detail ?? payload.error ?? "Replicate linework generation failed."
    });
  }

  const lineworkImage = extractFirstImageUrl(payload.output);

  if (!lineworkImage) {
    return createLineworkFailure({
      provider: "replicate",
      model,
      status: payload.status ?? "processing",
      providerError: `Replicate linework prediction did not return an image yet. Status: ${payload.status ?? "unknown"}.`,
      predictionId: payload.id
    });
  }

  return {
    id: payload.id ?? `linework-${Date.now()}`,
    provider: "replicate",
    model,
    status: payload.status ?? "succeeded",
    prompt: requestBody.input.prompt,
    images: {
      linework: lineworkImage
    }
  };
}

export async function createLineworkGeneration(generation, env = process.env, fetchImpl = fetch) {
  const provider = env.GENERATION_PROVIDER ?? "mock";

  if (provider === "mock") {
    return {
      id: `mock-linework-${Date.now()}`,
      provider: "mock",
      model: defaultMockModel,
      status: "mock",
      prompt: buildLineworkPrompt(generation),
      images: {
        linework: "/assets/mock-linework.svg"
      }
    };
  }

  if (provider === "replicate") {
    return createReplicateLineworkGeneration(generation, env, fetchImpl);
  }

  return {
    error: `Linework provider "${provider}" is not enabled yet.`,
    provider,
    model: resolveLineworkModel(env),
    status: "not_configured"
  };
}

export async function createGeneration(body, env = process.env, fetchImpl = fetch) {
  const provider = env.GENERATION_PROVIDER ?? "mock";
  const model = resolveGenerationModel(env);

  if (provider === "mock") {
    return createMockGeneration(body, env);
  }

  if (provider === "replicate") {
    return createReplicateGeneration(body, env, fetchImpl);
  }

  if (provider === "openai" && !env.OPENAI_API_KEY) {
    return {
      error: "OpenAI image generation is selected, but OPENAI_API_KEY is missing.",
      provider,
      model,
      status: "not_configured"
    };
  }

  return {
    error: `Generation provider "${provider}" is not enabled yet.`,
    provider,
    model,
    status: "not_configured"
  };
}

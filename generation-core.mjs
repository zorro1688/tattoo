export const defaultMockModel = "mock-static-assets";
export const defaultReplicateModel = "black-forest-labs/flux-schnell";
export const defaultReplicateLineworkModel = "black-forest-labs/flux-canny-pro";

const stylePromptPresets = {
  "fine line": "fine line: delicate thin outlines, elegant negative space, minimal shading, refined contour detail, polished tattoo flash finish.",
  minimalist: "minimalist: simple iconic silhouette, very few lines, balanced empty space, instantly readable at small size.",
  blackwork: "blackwork: solid black shapes, high contrast, controlled negative space, bold tattoo readability, no grey wash.",
  geometric: "geometric: clean symmetrical geometry, precise line weight, balanced sacred-geometry inspired structure, crisp edges.",
  japanese: "japanese: bold irezumi-inspired flow, strong readable silhouette, dynamic curves, tattoo-ready traditional composition.",
  lettering: "lettering: clean custom tattoo lettering, readable letterforms, balanced spacing, no random extra words."
};

const negativePrompt = [
  "person, human, model, hand, arm, forearm, wrist, skin, body parts, clothing",
  "photo, mockup, placement preview, shadow, grey background, paper texture",
  "black background, transparent background, dark canvas, alpha channel, inverted white lines",
  "realistic scene, studio photo, product photo, drop shadow, canvas texture, noisy background",
  "poster art, logo design, sticker, clipart, 3d render, photorealism",
  "watermark, signature, text, letters, words, typography unless the selected style is lettering",
  "frame, border, extra background objects, duplicate subjects, cropped design",
  "cropped, cut off, out of frame, missing limbs, missing legs, missing tail, missing wings"
].join(", ");

function stylePresetFor(style = "Fine line") {
  const key = normalizePromptText(style).toLowerCase();
  return stylePromptPresets[key] ?? `${key}: clean tattoo flash style, readable silhouette, balanced line weight, artist-ready reference.`;
}

function sizeGuidance(size = "Small") {
  const key = normalizePromptText(size).toLowerCase();
  if (key === "large") {
    return "large readable tattoo composition with strong focal point, enough detail for a larger body area, clear silhouette from distance.";
  }
  if (key === "medium") {
    return "medium tattoo composition with readable details, clear focal point, enough spacing between lines.";
  }
  return "small tattoo composition with simplified details, clean readable silhouette, avoid tiny fragile details.";
}

function complexityGuidance(complexity = "Beginner friendly") {
  const key = normalizePromptText(complexity).toLowerCase();
  if (key.includes("detailed")) {
    return "controlled detail, still stencil-friendly, avoid visual noise or overly dense micro-lines.";
  }
  if (key.includes("moderate")) {
    return "moderate detail, balanced contrast, clean artist-ready line hierarchy.";
  }
  return "beginner friendly complexity, simple enough to explain to a tattoo artist, clean and not overcrowded.";
}

export const conceptVariantOrder = ["simple", "balanced", "ornamental", "bold"];

const conceptVariantDirections = {
  simple: "Candidate direction: simple. Minimal clean silhouette, fewer internal marks, strong readable outline, beginner friendly and easy to tattoo.",
  balanced: "Candidate direction: balanced. Complete classic tattoo flash composition, medium line detail, clear anatomy, strong focal point, practical artist reference.",
  ornamental: "Candidate direction: ornamental. Decorative line flow on the requested subject only, elegant curves, refined contour detail, no extra flowers, leaves, moons, stars, or symbols unless requested.",
  bold: "Candidate direction: bold. Stronger contrast, thicker confident outline, dynamic pose, powerful silhouette, readable from a distance."
};
function allowsDecorativeElement(idea = "", pattern) {
  return pattern.test(normalizePromptText(idea).toLowerCase());
}

export function buildNegativePrompt(body = {}) {
  const idea = body?.idea ?? "";
  const extraNegative = [];

  if (!allowsDecorativeElement(idea, /\b(flower|flowers|floral|rose|roses|lotus|peony|petal|petals)\b/)) {
    extraNegative.push("flowers, floral ornaments");
  }

  if (!allowsDecorativeElement(idea, /\b(leaf|leaves|plant|plants|vine|vines|branch|branches)\b/)) {
    extraNegative.push("leaves, vines, plants");
  }

  if (!allowsDecorativeElement(idea, /\b(moon|crescent|star|stars|sun|celestial)\b/)) {
    extraNegative.push("moon, stars");
  }

  extraNegative.push("extra decorative objects, unrelated symbols");

  return [negativePrompt, ...extraNegative].join(", ");
}

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

function normalizePromptText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function subjectCompletenessGuidance(idea = "") {
  const text = normalizePromptText(idea).toLowerCase();
  const isPortrait = /\b(head|face|portrait|bust|skull)\b/.test(text);
  const isCreature = /\b(dragon|eagle|bird|wolf|tiger|lion|cat|dog|fox|snake|fish|butterfly|moth|phoenix|animal|creature|wings|tail|claws)\b/.test(text);

  if (isCreature && !isPortrait) {
    return "Full body complete subject: show the whole creature in one tattoo motif, with feet, claws, wings, and tail fully inside the artwork. Do not crop or hide any body part.";
  }

  return "Complete tattoo motif: keep the full design visible inside the canvas, with no cropped edges or missing important elements.";
}

export function buildTattooPrompt(body) {
  const idea = normalizePromptText(body.idea);
  const style = normalizePromptText(body.style ?? "Fine line");
  const placement = normalizePromptText(body.placement ?? "Forearm");
  const size = normalizePromptText(body.size ?? "Small");
  const complexity = normalizePromptText(body.complexity ?? "Beginner friendly");
  const advancedPrompt = normalizePromptText(body.advancedPrompt);
  const parts = [
    `Create an isolated ${style.toLowerCase()} tattoo design reference of ${idea}.`,
    "professional tattoo flash reference, single complete tattoo motif, artist-ready design sheet.",
    stylePresetFor(style),
    sizeGuidance(size),
    complexityGuidance(complexity),
    `This is only the tattoo artwork for later ${placement.toLowerCase()} placement preview; do not show the placement itself.`,
    `Design target: ${size.toLowerCase()} size, ${complexity.toLowerCase()} complexity.`,
    "Clean black ink linework, centered tattoo flash sheet composition, opaque pure white background only.",
    "Keep the entire tattoo design fully visible and uncropped, with generous white margin around all edges.",
    "Black ink on white background only; no black background, no transparent background, no inverted white lines.",
    "Only include the requested subject and explicitly requested elements. Do not add flowers, leaves, plants, moons, stars, jewelry, ornaments, or extra symbols unless the user asked for them.",
    subjectCompletenessGuidance(idea),
    "For animals, dragons, and creatures, include all limbs, legs, claws, wings, horns, and tail inside the canvas unless the user asks for a portrait.",
    "Use clean contour lines and controlled contrast so the design can become a stencil or artist reference.",
    "Avoid poster art, logo design, sticker, clipart, 3d render, photorealism.",
    "No person, no model, no hand, no arm, no forearm, no wrist, no skin, no body parts, no clothing.",
    "No photo, no mockup, no placement preview, no shadows, no grey background, no paper texture, no text.",
    "No extra background objects, no frame, no border, no watermark, no signature."
  ];

  if (advancedPrompt) {
    parts.push(`Additional user instructions: ${advancedPrompt}.`);
  }

  return parts.join(" ");
}

export function buildConceptVariantPrompt(body, variant = "balanced") {
  const key = conceptVariantOrder.includes(variant) ? variant : "balanced";
  return buildTattooPrompt(body) + " " + conceptVariantDirections[key];
}

export function extractImageUrls(output) {
  if (!output) {
    return [];
  }

  if (typeof output === "string") {
    return output.startsWith("http") ? [output] : [];
  }

  if (Array.isArray(output)) {
    return output.flatMap((item) => extractImageUrls(item));
  }

  if (typeof output === "object") {
    const directUrl = typeof output.url === "string" && output.url.startsWith("http") ? [output.url] : [];
    return [...directUrl, ...Object.values(output).flatMap((value) => extractImageUrls(value))];
  }

  return [];
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

  async function requestConceptVariant(variant) {
    const { modelEndpoint, requestBody } = createReplicatePredictionBody(model, {
      prompt: buildConceptVariantPrompt(body, variant),
      negative_prompt: buildNegativePrompt(body),
      aspect_ratio: "1:1",
      output_format: "webp",
      output_quality: 90,
      num_outputs: 1
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
      return {
        variant,
        error: payload.detail ?? payload.error ?? "Replicate generation failed.",
        status: "failed"
      };
    }

    return {
      variant,
      payload,
      urls: extractImageUrls(payload.output)
    };
  }

  const variantResults = await Promise.all(
    conceptVariantOrder.map((variant) => requestConceptVariant(variant))
  );
  const conceptCandidates = [
    ...new Set(variantResults.flatMap((result) => result.urls ?? []))
  ];
  const conceptImage = conceptCandidates[0];
  const firstPayload = variantResults.find((result) => result.payload)?.payload;

  if (!conceptImage) {
    const firstError = variantResults.find((result) => result.error)?.error;
    return {
      error: firstError ?? `Replicate prediction did not return an image yet. Status: ${firstPayload?.status ?? "unknown"}.`,
      provider: "replicate",
      model,
      status: firstPayload?.status ?? "failed",
      predictionId: firstPayload?.id
    };
  }

  return {
    id: firstPayload?.id ?? `replicate-${Date.now()}`,
    provider: "replicate",
    status: firstPayload?.status ?? "succeeded",
    ...base,
    images: {
      concept: conceptImage
    },
    conceptCandidates
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
  const size = generation.input?.size ?? "small";

  return [
    `Create clean black tattoo stencil linework from this isolated ${style.toLowerCase()} ${size.toLowerCase()} tattoo concept of ${idea}.`,
    "stencil-ready transfer drawing, preserve only the tattoo subject and composition, not any body or placement context.",
    "black ink only, pure white background, uniform black outlines, crisp thin contours, tattoo flash stencil style.",
    "closed contours where possible, clean line hierarchy, readable at tattoo scale, no broken messy sketch lines.",
    "only black vector-like contour lines; remove all lighting, shadows, paper texture, skin tones, and tonal background.",
    "no shading, no grey, no gradients, no color, no filled paper shadows, no person, no hand, no arm, no forearm, no wrist, no skin, no body parts, no clothing, no mockup, no text, no background rectangle.",
    "do not redraw it as a new illustration, do not add new symbols, do not change the subject, do not add extra decorative elements.",
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
    output_format: "png",
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

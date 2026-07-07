import assert from "node:assert/strict";
import {
  buildTattooPrompt,
  createGeneration,
  createLineworkGeneration,
  extractFirstImageUrl,
  resolveGenerationModel
} from "../generation-core.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}


await run("tattoo prompt avoids body and placement mockup language", () => {
  const prompt = buildTattooPrompt({
    idea: "small rose with moon",
    style: "Fine line",
    placement: "Forearm",
    size: "Medium",
    complexity: "Beginner friendly",
    advancedPrompt: "make the rose more delicate"
  });

  assert.match(prompt, /isolated fine line tattoo design reference/);
  assert.match(prompt, /do not show the placement itself/i);
  assert.match(prompt, /No person, no model, no hand, no arm, no forearm, no wrist, no skin/i);
  assert.match(prompt, /Additional user instructions: make the rose more delicate\./);
  assert.doesNotMatch(prompt, /suitable for forearm placement/i);
});



await run("tattoo prompt applies style-specific professional reference templates", () => {
  const fineLinePrompt = buildTattooPrompt({
    idea: "small rose with moon",
    style: "Fine line",
    placement: "Chest",
    size: "Small",
    complexity: "Beginner friendly"
  });
  const japanesePrompt = buildTattooPrompt({
    idea: "tiger head",
    style: "Japanese",
    placement: "Back",
    size: "Large",
    complexity: "Detailed"
  });

  assert.match(fineLinePrompt, /professional tattoo flash reference/i);
  assert.match(fineLinePrompt, /single complete tattoo motif/i);
  assert.match(fineLinePrompt, /fine line: delicate thin outlines, elegant negative space, minimal shading/i);
  assert.match(fineLinePrompt, /avoid poster art, logo design, sticker, clipart, 3d render, photorealism/i);
  assert.match(fineLinePrompt, /no extra background objects, no frame, no border/i);
  assert.match(japanesePrompt, /japanese: bold irezumi-inspired flow, strong readable silhouette/i);
  assert.match(japanesePrompt, /large readable tattoo composition with strong focal point/i);
});

await run("replicate concept requests include negative prompt when the model supports it", async () => {
  const calls = [];

  await createGeneration(
    {
      idea: "wolf head",
      style: "Blackwork",
      placement: "Shoulder",
      size: "Medium",
      complexity: "Moderate"
    },
    {
      GENERATION_PROVIDER: "replicate",
      REPLICATE_API_TOKEN: "r8_test",
      GENERATION_MODEL: "black-forest-labs/flux-schnell"
    },
    async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          id: "negative_123",
          status: "succeeded",
          output: ["https://replicate.delivery/pbxt/wolf.webp"]
        })
      };
    }
  );

  const body = JSON.parse(calls[0].init.body);

  assert.match(body.input.prompt, /blackwork: solid black shapes, high contrast, controlled negative space/i);
  assert.match(body.input.negative_prompt, /person, human, model, hand, arm, forearm, wrist, skin/i);
  assert.match(body.input.negative_prompt, /photo, mockup, placement preview, shadow, grey background, paper texture/i);
  assert.match(body.input.negative_prompt, /watermark, signature, text, letters, words/i);
});

await run("linework prompt is stricter about stencil cleanup and stable outlines", async () => {
  const linework = await createLineworkGeneration(
    {
      id: "gen_linework_quality",
      images: {
        concept: "/assets/hero-concept.png"
      },
      input: {
        idea: "small rose with moon",
        style: "Fine line",
        placement: "Forearm",
        size: "Small"
      }
    },
    {
      GENERATION_PROVIDER: "mock"
    }
  );

  assert.match(linework.prompt, /stencil-ready transfer drawing/i);
  assert.match(linework.prompt, /uniform black outlines/i);
  assert.match(linework.prompt, /closed contours where possible/i);
  assert.match(linework.prompt, /no filled paper shadows/i);
  assert.match(linework.prompt, /do not redraw it as a new illustration/i);
});

await run("replicate provider requires an API token", async () => {
  const generation = await createGeneration(
    { idea: "small rose with moon", style: "Fine line", placement: "Forearm" },
    { GENERATION_PROVIDER: "replicate" },
    async () => {
      throw new Error("fetch should not be called without a token");
    }
  );

  assert.equal(generation.status, "not_configured");
  assert.match(generation.error, /REPLICATE_API_TOKEN/);
});

await run("replicate provider returns the generated concept image URL", async () => {
  const calls = [];
  const generation = await createGeneration(
    {
      idea: "small rose with moon",
      style: "Fine line",
      placement: "Forearm",
      size: "Small",
      complexity: "Beginner friendly"
    },
    {
      GENERATION_PROVIDER: "replicate",
      REPLICATE_API_TOKEN: "r8_test",
      GENERATION_MODEL: "black-forest-labs/flux-schnell"
    },
    async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          id: "abc123",
          status: "succeeded",
          output: ["https://replicate.delivery/pbxt/example.webp"]
        })
      };
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer r8_test");
  assert.equal(calls[0].init.headers.Prefer, "wait=60");
  assert.equal(JSON.parse(calls[0].init.body).version, undefined);
  assert.equal(generation.provider, "replicate");
  assert.equal(generation.model, "black-forest-labs/flux-schnell");
  assert.equal(generation.images.concept, "https://replicate.delivery/pbxt/example.webp");
  assert.equal(generation.images.linework, undefined);
  assert.equal(generation.images.placement, undefined);
  assert.match(generation.prompt, /isolated fine line tattoo design reference/);
  assert.match(generation.prompt, /No person, no model, no hand, no arm, no forearm, no wrist, no skin/);
});

await run("extractFirstImageUrl handles nested Replicate outputs", () => {
  assert.equal(
    extractFirstImageUrl({ images: [{ url: "https://example.com/tattoo.png" }] }),
    "https://example.com/tattoo.png"
  );
});

await run("replicate provider uses a real default model", () => {
  assert.equal(resolveGenerationModel({ GENERATION_PROVIDER: "replicate" }), "black-forest-labs/flux-schnell");
  assert.equal(
    resolveGenerationModel({ GENERATION_PROVIDER: "replicate", GENERATION_MODEL: "mock-static-assets" }),
    "black-forest-labs/flux-schnell"
  );
});

await run("replicate linework generation uses the saved concept image", async () => {
  const calls = [];
  const linework = await createLineworkGeneration(
    {
      id: "gen_123",
      images: {
        concept: "https://replicate.delivery/concept.webp"
      },
      input: {
        idea: "small rose with moon",
        style: "Fine line",
        placement: "Forearm",
        size: "Small"
      }
    },
    {
      GENERATION_PROVIDER: "replicate",
      REPLICATE_API_TOKEN: "r8_test"
    },
    async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          id: "linework_123",
          status: "succeeded",
          output: ["https://replicate.delivery/linework.webp"]
        })
      };
    }
  );

  const body = JSON.parse(calls[0].init.body);

  assert.equal(calls[0].url, "https://api.replicate.com/v1/models/black-forest-labs/flux-canny-pro/predictions");
  assert.equal(body.input.control_image, "https://replicate.delivery/concept.webp");
  assert.equal(body.input.output_format, "png");
  assert.match(body.input.prompt, /clean black tattoo stencil linework/);
  assert.match(body.input.prompt, /black ink only/);
  assert.match(body.input.prompt, /no grey/);
  assert.match(body.input.prompt, /no background rectangle/);
  assert.match(body.input.prompt, /remove all lighting, shadows, paper texture/);
  assert.match(body.input.prompt, /preserve only the tattoo subject and composition/);
  assert.match(body.input.prompt, /no person, no hand, no arm, no forearm, no wrist, no skin/);
  assert.match(body.input.prompt, /do not add new symbols/);
  assert.equal(linework.images.linework, "https://replicate.delivery/linework.webp");
  assert.equal(linework.provider, "replicate");
});

await run("mock linework generation returns a downloadable linework asset", async () => {
  const linework = await createLineworkGeneration(
    {
      id: "gen_mock",
      images: {
        concept: "/assets/hero-concept.png"
      },
      input: {
        idea: "small rose with moon",
        style: "Fine line",
        placement: "Forearm",
        size: "Small"
      }
    },
    {
      GENERATION_PROVIDER: "mock"
    }
  );

  assert.equal(linework.provider, "mock");
  assert.equal(linework.images.linework, "/assets/mock-linework.svg");
});

await run("replicate linework failures are clear and do not consume credit", async () => {
  const linework = await createLineworkGeneration(
    {
      id: "gen_failed_linework",
      images: {
        concept: "https://replicate.delivery/concept.webp"
      },
      input: {
        idea: "small cat",
        style: "Fine line",
        placement: "Forearm",
        size: "Small"
      }
    },
    {
      GENERATION_PROVIDER: "replicate",
      REPLICATE_API_TOKEN: "r8_test"
    },
    async () => ({
      ok: false,
      json: async () => ({ detail: "model overloaded" })
    })
  );

  assert.equal(linework.status, "failed");
  assert.equal(linework.creditUsed, false);
  assert.match(linework.error, /Could not create linework/);
  assert.match(linework.error, /credit was not used/);
  assert.match(linework.providerError, /model overloaded/);
});
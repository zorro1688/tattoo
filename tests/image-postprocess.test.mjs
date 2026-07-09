import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeConceptImage, normalizeConceptImageUrl } from "../image-postprocess.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function averageLuminance(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(16, 16, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let total = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
  }
  return total / (data.length / info.channels);
}

await run("black-background white-line concepts are inverted to white-background black-line PNG", async () => {
  const blackConcept = await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 3,
      background: "#000000"
    }
  })
    .composite([
      {
        input: Buffer.from('<svg width="96" height="96"><path d="M18 78 L48 18 L78 78" stroke="white" stroke-width="8" fill="none" stroke-linecap="round"/></svg>'),
        top: 0,
        left: 0
      }
    ])
    .png()
    .toBuffer();

  const result = await normalizeConceptImage({ body: blackConcept, contentType: "image/png" });
  const luminance = await averageLuminance(result.body);

  assert.equal(result.contentType, "image/png");
  assert.equal(result.normalized, true);
  assert.ok(luminance > 220, `expected white background after normalization, got ${luminance}`);
});

await run("URL normalization never returns base64 image data to the frontend", async () => {
  const blackConcept = await sharp({
    create: {
      width: 24,
      height: 24,
      channels: 3,
      background: "#000000"
    }
  }).png().toBuffer();

  const result = await normalizeConceptImageUrl("https://replicate.delivery/dark.png", async () => ({
    ok: true,
    headers: {
      get: () => "image/png"
    },
    arrayBuffer: async () => blackConcept
  }));

  assert.equal(result.normalized, true);
  assert.equal(result.url, "https://replicate.delivery/dark.png");
  assert.equal(result.url.startsWith("data:"), false);
  assert.equal(result.image.contentType, "image/png");
});

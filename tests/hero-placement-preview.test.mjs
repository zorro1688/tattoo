import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run("homepage hero placement preview has a clean skin mockup and tattoo overlay", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /heroPlacementMockup/);
  assert.match(html, /heroPlacementTattoo/);
  assert.match(html, /assets\/hero-forearm-clean\.png/);
});

await run("homepage script drives placement overlay from generated images", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /heroPlacementMockup/);
  assert.match(script, /heroPlacementTattoo/);
  assert.match(script, /updatePlacementPreview/);
  assert.match(script, /getGeneratedImage\("linework"\) \|\| getConceptPreviewImage\(\)/);
});


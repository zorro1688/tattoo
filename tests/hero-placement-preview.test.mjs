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
  assert.match(html, /assets\/placement-forearm\.svg/);
});

await run("homepage script drives placement overlay from generated images", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /heroPlacementMockup/);
  assert.match(script, /heroPlacementTattoo/);
  assert.match(script, /updatePlacementPreview/);
  assert.match(script, /getPlacementSkinAsset/);
  assert.match(script, /getGeneratedImage\("linework"\) \|\| getConceptPreviewImage\(\)/);
  assert.doesNotMatch(script, /loadDrawableImage\(skinUrl\)/);
});


await run("homepage placement mockup shows skin image assets instead of CSS-only body shapes", async () => {
  const styles = await readFile("styles.css", "utf8");

  assert.ok(styles.includes(`hero-placement-skin {\n  position: absolute;`));
  assert.ok(styles.includes("object-fit: cover;"));
  assert.ok(styles.includes(`hero-placement-mockup::before,\n.hero-placement-mockup::after {\n  display: none;`));
});

await run("homepage placement preview uses placement-specific skin assets", async () => {
  const script = await readFile("script.js", "utf8");
  const html = await readFile("index.html", "utf8");

  assert.match(html, /id="heroPlacementSkin"/);
  assert.match(script, /placementSkinAssets/);
  assert.match(script, /heroPlacementSkin.src = getPlacementSkinAsset/);
  assert.match(script, /createTransparentTattooUrl/);
  assert.match(script, /applyTransparentTattooOverlay/);
});

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
  assert.match(html, /assets\/placement-forearm\.jpg/);
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

  assert.match(styles, /hero-placement-skin \{\s+position: absolute;/);
  assert.ok(styles.includes("object-fit: cover;"));
  assert.match(styles, /hero-placement-mockup::before,\s*\.hero-placement-mockup::after \{\s+display: none;/);
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

await run("homepage placement overlay uses skin-embedded ink treatment", async () => {
  const styles = await readFile("styles.css", "utf8");
  const script = await readFile("script.js", "utf8");

  assert.match(styles, /mix-blend-mode: multiply/);
  assert.match(styles, /blur\(0\.35px\)/);
  assert.match(styles, /opacity: 0\.72/);
  assert.match(styles, /scaleX\(0\.9\)/);
  assert.match(script, /function drawSkinEmbeddedTattoo/);
  assert.match(script, /globalAlpha = 0\.58/);
  assert.match(script, /blur\(0\.8px\)/);
  assert.doesNotMatch(script, /globalAlpha = 0\.82/);
});
await run("homepage placement preview uses body-part-specific fit points", async () => {
  const styles = await readFile("styles.css", "utf8");
  const script = await readFile("script.js", "utf8");

  assert.match(script, /placementTattooFits/);
  assert.match(script, /chest:\s*\{ x: 0\.5, y: 0\.42, rotation: 0, scale: 0\.78, squash: 0\.95 \}/);
  assert.match(script, /rib:\s*\{ x: 0\.57, y: 0\.5, rotation: 5, scale: 0\.62, squash: 0\.86 \}/);
  assert.match(script, /applyPlacementTattooFit\(heroPlacementMockup, selectedPlacement\)/);
  assert.match(styles, /--tattoo-x/);
  assert.match(styles, /--tattoo-fit-scale/);
});

await run("homepage placement preview uses a lower, larger chest default fit", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /chest:\s*\{ x: 0\.5, y: 0\.42, rotation: 0, scale: 0\.78/);
});

await run("homepage placement overlay removes edge-colored image backgrounds", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /estimateTattooBackgroundColor/);
  assert.match(script, /isNearTattooBackground/);
  assert.match(script, /backgroundDistance/);
  assert.match(script, /const background = estimateTattooBackgroundColor/);
  assert.match(script, /data\[index \+ 3\] = 0/);
  assert.doesNotMatch(script, /Math\.max\(28, Math\.round\(\(235 - brightness\) \* 3\.2\)\)/);
});
await run("homepage placement preview uses clearer size scale for larger body areas", async () => {
  const script = await readFile("script.js", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(script, /shoulder:\s*\{ x: 0\.58, y: 0\.34, rotation: -8, scale: 0\.92, squash: 0\.9 \}/);
  assert.match(script, /small:\s*0\.22/);
  assert.match(script, /medium:\s*0\.31/);
  assert.match(script, /large:\s*0\.42/);
  assert.match(styles, /width: 150px/);
  assert.match(styles, /width: 208px/);
});

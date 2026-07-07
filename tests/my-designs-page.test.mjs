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

await run("homepage links to My Designs but does not render history section", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /href="\/my-designs"/);
  assert.doesNotMatch(html, /Your Recent Tattoo Designs/);
  assert.doesNotMatch(html, /id="myDesignsGrid"/);
});

await run("My Designs page has history container and generator CTA", async () => {
  const html = await readFile("my-designs.html", "utf8");

  assert.match(html, /<title>My Designs \| InkFirst<\/title>/);
  assert.match(html, /id="myDesignsGrid"/);
  assert.match(html, /No saved designs yet\. Generate your first tattoo idea to see it here\./);
  assert.match(html, /href="\/#generator"/);
  assert.match(html, /src="my-designs.js"/);
});


await run("My Designs cards render saved placement previews instead of only concept thumbnails", async () => {
  const script = await readFile("my-designs.js", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(script, /const placementSkinAssets = \{/);
  assert.match(script, /function renderPlacementPreview\(design, title\)/);
  assert.match(script, /design\.placementAdjustment \?\? getDefaultPlacementAdjustment\(design\)/);
  assert.match(script, /--tattoo-x:\s*\$\{Math\.round\(adjustment\.x \* 1000\) \/ 10\}%/);
  assert.match(script, /--tattoo-y:\s*\$\{Math\.round\(adjustment\.y \* 1000\) \/ 10\}%/);
  assert.match(script, /class="my-design-placement-preview"/);
  assert.match(script, /class="my-design-placement-skin"/);
  assert.match(script, /class="my-design-placement-tattoo"/);
  assert.doesNotMatch(script, /const image = design\.images\?\.concept \|\| "assets\/hero-concept\.png";/);
  assert.match(styles, /\.my-design-placement-preview \{/);
  assert.match(styles, /\.my-design-placement-tattoo \{/);
});


await run("My Designs placement previews remove square artwork backgrounds", async () => {
  const script = await readFile("my-designs.js", "utf8");
  const publicScript = await readFile("public/my-designs.js", "utf8");

  for (const source of [script, publicScript]) {
    assert.match(source, /createTransparentTattooUrl/);
    assert.match(source, /applyTransparentTattooOverlay/);
    assert.match(source, /data-placement-tattoo-source/);
    assert.match(source, /hydratePlacementPreviewTattooImages/);
    assert.match(source, /estimateTattooBackgroundColor/);
    assert.match(source, /isNearTattooBackground/);
  }
});

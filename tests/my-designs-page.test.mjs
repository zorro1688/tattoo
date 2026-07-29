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
  assert.match(script, /const fit = getDefaultPlacementAdjustment\(design\)/);
  assert.match(script, /design\.placementAdjustment \?\? fit/);
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

await run("My Designs placement thumbnails preserve detail-page sizing and body fit", async () => {
  const scripts = [
    await readFile("my-designs.js", "utf8"),
    await readFile("public/my-designs.js", "utf8")
  ];
  const styleSources = [
    await readFile("styles.css", "utf8"),
    await readFile("app/globals.css", "utf8")
  ];

  for (const script of scripts) {
    assert.match(script, /chest:\s*\{ x: 0\.5, y: 0\.42, rotation: 0, scale: 0\.78, squash: 0\.95 \}/);
    assert.match(script, /shoulder:\s*\{ x: 0\.58, y: 0\.34, rotation: -8, scale: 0\.92, squash: 0\.9 \}/);
    assert.match(script, /data-size="\$\{escapeHtml\(normalizePlacementValue\(design\.input\?\.size \?\? "Small"\)\)\}"/);
    assert.match(script, /--tattoo-squash:\s*\$\{fit\.squash\}/);
  }

  for (const styles of styleSources) {
    assert.match(styles, /\.my-design-placement-preview\[data-size="small"\] \.my-design-placement-tattoo/);
    assert.match(styles, /\.my-design-placement-preview\[data-size="medium"\] \.my-design-placement-tattoo/);
    assert.match(styles, /\.my-design-placement-preview\[data-size="large"\] \.my-design-placement-tattoo/);
    assert.doesNotMatch(styles, /\.my-design-placement-tattoo \{[\s\S]*?width: 72%;[\s\S]*?height: 72%;/);
  }
});

await run("My Designs refreshes stale placement data after returning from details", async () => {
  const scripts = [
    await readFile("my-designs.js", "utf8"),
    await readFile("public/my-designs.js", "utf8")
  ];
  const route = await readFile("app/api/generations/route.js", "utf8");

  for (const script of scripts) {
    assert.match(script, /fetch\("\/api\/generations\?limit=24", \{ cache: "no-store" \}\)/);
    assert.match(script, /function refreshDesignsAfterReturn\(\)/);
    assert.match(script, /window\.addEventListener\("pageshow", refreshDesignsAfterReturn\)/);
    assert.match(script, /window\.addEventListener\("focus", refreshDesignsAfterReturn\)/);
  }

  assert.match(route, /Cache-Control/);
  assert.match(route, /private, no-store/);
});
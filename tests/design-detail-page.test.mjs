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

await run("design detail page exposes concept linework placement and prompt sections", async () => {
  const html = await readFile("design.html", "utf8");

  assert.match(html, /id="designDetail"/);
  assert.match(html, /id="detailConceptImage"/);
  assert.match(html, /id="detailLineworkImage"/);
  assert.match(html, /id="detailLineworkEmpty"/);
  assert.match(html, /id="detailPlacementMockup"/);
  assert.match(html, /id="detailPrompt"/);
  assert.match(html, /id="detailUpgradeConcept"/);
  assert.match(html, /id="detailUpgradeLinework"/);
  assert.match(html, /id="detailUpgradePlacement"/);
  assert.match(html, /href="\/#pricing"/);
  assert.match(html, /script src="design\.js"/);
});

await run("design detail script loads one saved generation and supports linework", async () => {
  const script = await readFile("design.js", "utf8");

  assert.match(script, /\/api\/generation\?id=/);
  assert.match(script, /\/api\/generate\/linework/);
  assert.match(script, /downloadPlacementPreview/);
  assert.match(script, /getPlacementSkinAsset/);
  assert.match(script, /renderDesign/);
  assert.match(script, /renderDownloadAccessActions/);
  assert.match(script, /Download high-res/);
  assert.match(script, /Download watermarked/);
  assert.match(script, /detailUpgradeConcept/);
  assert.match(script, /\/api\/billing\/checkout/);
  assert.match(script, /returnTo/);
  assert.match(script, /handleCheckoutReturn/);
  assert.match(script, /pageshow/);
  assert.match(script, /refreshDownloadAccessAfterReturn/);
  assert.match(script, /lineworkReady \? design\.images\?\.linework : ""/);
  assert.match(script, /Creating stencil linework/);
  assert.match(script, /1 generation credit/);
});

await run("my designs links cards to design detail page", async () => {
  const script = await readFile("my-designs.js", "utf8");

  assert.match(script, /\/design\?id=/);
  assert.match(script, /View details/);
});

await run("static and next servers expose the design detail API and page", async () => {
  const server = await readFile("server.mjs", "utf8");
  const nextRoute = await readFile("app/api/generation/route.js", "utf8");
  const nextPage = await readFile("app/design/page.tsx", "utf8");

  assert.match(server, /\/api\/generation/);
  assert.match(server, /url\.pathname === "\/design"/);
  assert.match(nextRoute, /getGeneration/);
  assert.match(nextPage, /design\.html/);
});

await run("design detail treats default linework assets as not generated", async () => {
  const script = await readFile("design.js", "utf8");

  assert.match(script, /normalizeAssetPath/);
  assert.match(script, /isDefaultLineworkAsset/);
  assert.match(script, /lineworkReady \? design\.images\?\.linework : ""/);
});
await run("public design script keeps the same linework fallback logic", async () => {
  const script = await readFile("public/design.js", "utf8");

  assert.match(script, /normalizeAssetPath/);
  assert.match(script, /isDefaultLineworkAsset/);
  assert.match(script, /lineworkReady \? design\.images\?\.linework : ""/);
});
await run("design detail does not show concept art as generated linework", async () => {
  const html = await readFile("design.html", "utf8");
  const script = await readFile("design.js", "utf8");
  const publicScript = await readFile("public/design.js", "utf8");

  assert.match(html, /Linework has not been generated yet\./);

  for (const source of [script, publicScript]) {
    assert.match(source, /lineworkReady \? design\.images\?\.linework : ""/);
    assert.match(source, /detailLineworkImage\.hidden = !lineworkReady/);
    assert.match(source, /detailLineworkEmpty\.hidden = lineworkReady/);
    assert.doesNotMatch(source, /lineworkReady \? design\.images\?\.linework : conceptImage/);
  }
});
await run("design detail placement preview does not depend on the fixed forearm photo", async () => {
  const script = await readFile("design.js", "utf8");
  const publicScript = await readFile("public/design.js", "utf8");
  const styles = await readFile("styles.css", "utf8");

  for (const source of [script, publicScript]) {
    assert.match(source, /getPlacementSkinAsset/);
    assert.ok(!source.includes('loadDrawableImage("assets/hero-forearm-clean.png")'));
  }

  assert.match(styles, /#detailLineworkImage/);
  assert.match(styles, /detail-placement-skin \{\s+position: absolute;/);
  assert.match(styles, /detail-placement-mockup::before,\s*\.detail-placement-mockup::after \{\s+display: none;/);
});

await run("design detail placement preview uses placement-specific skin assets", async () => {
  const script = await readFile("design.js", "utf8");
  const html = await readFile("design.html", "utf8");

  assert.match(html, /id="detailPlacementSkin"/);
  assert.match(script, /placementSkinAssets/);
  assert.match(script, /detailPlacementSkin.src = getPlacementSkinAsset/);
  assert.match(script, /createTransparentTattooUrl/);
  assert.match(script, /applyTransparentTattooOverlay/);
});

await run("design detail placement overlay uses skin-embedded ink treatment", async () => {
  const styles = await readFile("styles.css", "utf8");
  const script = await readFile("design.js", "utf8");

  assert.match(styles, /mix-blend-mode: multiply/);
  assert.match(styles, /blur\(0\.35px\)/);
  assert.match(styles, /opacity: 0\.72/);
  assert.match(styles, /scaleX\(0\.9\)/);
  assert.match(script, /function drawSkinEmbeddedTattoo/);
  assert.match(script, /globalAlpha = 0\.58/);
  assert.match(script, /blur\(0\.8px\)/);
  assert.doesNotMatch(script, /globalAlpha = 0\.82/);
});
await run("design detail placement preview uses body-part-specific fit points", async () => {
  const styles = await readFile("styles.css", "utf8");
  const script = await readFile("design.js", "utf8");

  assert.match(script, /placementTattooFits/);
  assert.match(script, /chest:\s*\{ x: 0\.5, y: 0\.42, rotation: 0, scale: 0\.78, squash: 0\.95 \}/);
  assert.match(script, /rib:\s*\{ x: 0\.57, y: 0\.5, rotation: 5, scale: 0\.62, squash: 0\.86 \}/);
  assert.match(script, /applyPlacementTattooFit\(detailPlacementMockup, selectedPlacement\)/);
  assert.match(styles, /--tattoo-x/);
  assert.match(styles, /--tattoo-fit-scale/);
});
await run("design detail placement overlay removes edge-colored image backgrounds", async () => {
  const script = await readFile("design.js", "utf8");

  assert.match(script, /estimateTattooBackgroundColor/);
  assert.match(script, /isNearTattooBackground/);
  assert.match(script, /backgroundDistance/);
  assert.match(script, /const background = estimateTattooBackgroundColor/);
  assert.match(script, /data\[index \+ 3\] = 0/);
  assert.doesNotMatch(script, /Math\.max\(28, Math\.round\(\(235 - brightness\) \* 3\.2\)\)/);
});
await run("design detail placement preview uses clearer size scale for larger body areas", async () => {
  const script = await readFile("design.js", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(script, /shoulder:\s*\{ x: 0\.58, y: 0\.34, rotation: -8, scale: 0\.92, squash: 0\.9 \}/);
  assert.match(script, /small:\s*0\.22/);
  assert.match(script, /medium:\s*0\.31/);
  assert.match(script, /large:\s*0\.42/);
  assert.match(styles, /\.detail-placement-mockup\[data-size="small"\]/);
  assert.match(styles, /width: 150px/);
  assert.match(styles, /width: 208px/);
});



await run("design detail placement position variables override body-part defaults", async () => {
  const styles = await readFile("styles.css", "utf8");

  assert.match(styles, /left: var\(--tattoo-x, 54%\) !important;/);
  assert.match(styles, /top: var\(--tattoo-y, 55%\) !important;/);
});

await run("design detail placement preview has one complete manual adjustment panel", async () => {
  const html = await readFile("design.html", "utf8");
  const script = await readFile("design.js", "utf8");

  assert.equal((html.match(/class="placement-adjustment-panel"/g) ?? []).length, 1);
  assert.equal((html.match(/id="placementScaleControl"/g) ?? []).length, 1);
  assert.equal((html.match(/id="placementRotateControl"/g) ?? []).length, 1);
  assert.match(html, /id="placementXControl"/);
  assert.match(html, /id="placementYControl"/);
  assert.match(html, /Drag the tattoo/);
  assert.match(html, /id="savePlacementButton"/);
  assert.match(html, /id="resetPlacementButton"/);
  assert.match(script, /const placementXControl = document\.querySelector\("#placementXControl"\)/);
  assert.match(script, /const placementYControl = document\.querySelector\("#placementYControl"\)/);
  assert.match(script, /applyPlacementAdjustment/);
  assert.match(script, /savePlacementAdjustment/);
  assert.match(script, /pointerdown/);
  assert.match(script, /\/api\/generation/);
  assert.match(script, /method: "PATCH"/);
});

await run("design detail placement can be dragged directly without jumping to the pointer", async () => {
  const script = await readFile("design.js", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(script, /let placementDragOffset = \{ x: 0, y: 0 \}/);
  assert.match(script, /function startPlacementDrag\(event\)/);
  assert.match(script, /detailPlacementTattoo\.getBoundingClientRect\(\)/);
  assert.match(script, /placementDragOffset = \{/);
  assert.match(script, /detailPlacementTattoo\.addEventListener\("pointerdown", startPlacementDrag\)/);
  assert.doesNotMatch(script, /detailPlacementMockup\.addEventListener\("pointerdown"/);
  assert.match(script, /\(event\.clientX - rect\.left - placementDragOffset\.x\) \/ rect\.width/);
  assert.match(script, /\(event\.clientY - rect\.top - placementDragOffset\.y\) \/ rect\.height/);
  assert.match(styles, /\.detail-placement-tattoo \{\s+cursor: grab;/);
  assert.match(styles, /\.detail-placement-mockup\.is-dragging \.detail-placement-tattoo \{\s+cursor: grabbing;/);
});


await run("design detail download buttons show active feedback and protect slow placement downloads", async () => {
  const script = await readFile("design.js", "utf8");
  const publicScript = await readFile("public/design.js", "utf8");
  const styles = await readFile("styles.css", "utf8");

  for (const source of [script, publicScript]) {
    assert.match(source, /function setDownloadButtonState\(button, isDownloading/);
    assert.match(source, /button\.classList\.toggle\("is-downloading", isDownloading\)/);
    assert.match(source, /button\.textContent = isDownloading \? "Preparing download\.\.\."/);
    assert.match(source, /async function downloadGenerationFile\(type, button\)/);
    assert.match(source, /finally \{/);
    assert.match(source, /downloadGenerationFile\("concept", detailDownloadConcept\)/);
    assert.match(source, /downloadGenerationFile\("linework", detailLineworkButton\)/);
    assert.match(source, /downloadGenerationFile\("placement", detailDownloadPlacement\)/);
    assert.match(source, /designStatus\.textContent = `Preparing \$\{type\} download\.\.\.`/);
  }

  assert.match(styles, /\.design-download-actions \.result-action\.is-downloading/);
  assert.match(styles, /background: #0071e3/);
});

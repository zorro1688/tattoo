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
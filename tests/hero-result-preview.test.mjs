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

await run("homepage hero contains current result actions and details", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /id="heroResultSummary"/);
  assert.match(html, /id="heroPlacementNote"/);
  assert.match(html, /id="heroDetails"/);
  assert.match(html, /id="downloadConceptButton"/);
  assert.match(html, /id="regenerateConceptButton"/);
  assert.match(html, /Regenerate concept/);
  assert.match(html, /id="heroLineworkAction"/);
  assert.match(html, /href="\/my-designs"/);
  assert.match(html, /id="generateAnotherButton"/);
  assert.match(html, /id="conceptCandidateStrip"/);
});

await run("homepage script updates result state and supports downloads", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /heroResultSummary/);
  assert.match(script, /heroPlacementNote/);
  assert.match(script, /heroDetails/);
  assert.match(script, /downloadImageFile/);
  assert.match(script, /Generating your tattoo/);
  assert.match(script, /Try again/);
  assert.match(script, /generateAnotherButton/);
  assert.match(script, /regenerateConceptButton/);
  assert.match(script, /regenerateConcept\(\)/);
  assert.match(script, /conceptCandidateStrip/);
  assert.match(script, /renderConceptCandidates/);
  assert.match(script, /selectConceptCandidate/);
  assert.match(script, /getGeneratedImage\("linework"\) \|\| getConceptPreviewImage\(\)/);
  assert.match(script, /isDefaultHeroImage/);
  assert.match(script, /const blockingError = Boolean\(generationError && !generated\)/);
  assert.match(script, /classList\.toggle\("is-error", blockingError\)/);
});



await run("homepage concept candidates have compact selectable styling", async () => {
  for (const file of ["styles.css", "app/globals.css"]) {
    const styles = await readFile(file, "utf8");

    assert.match(styles, /\.concept-candidate-strip/);
    assert.match(styles, /display: flex/);
    assert.match(styles, /overflow-x: auto/);
    assert.match(styles, /flex: 0 0 86px/);
    assert.match(styles, /height: 74px/);
    assert.match(styles, /\.concept-candidate\.selected/);
  }
});

await run("homepage advanced prompt is editable and sent with generation requests", async () => {
  const html = await readFile("index.html", "utf8");
  const script = await readFile("script.js", "utf8");
  const publicScript = await readFile("public/script.js", "utf8");

  assert.match(html, /id="advancedPrompt"/);
  assert.match(html, /Optional extra instructions/);
  assert.match(script, /const advancedPrompt = document\.querySelector\("#advancedPrompt"\)/);
  assert.match(script, /advancedPrompt:\s*advancedPrompt\?\.value\.trim\(\) \?\? ""/);
  assert.match(script, /No person, no model, no hand, no arm, no forearm, no wrist, no skin/);
  assert.match(publicScript, /advancedPrompt:\s*advancedPrompt\?\.value\.trim\(\) \?\? ""/);
});



await run("homepage prompt preview mirrors the professional tattoo prompt template", async () => {
  const script = await readFile("script.js", "utf8");
  const publicScript = await readFile("public/script.js", "utf8");

  assert.match(script, /stylePromptPresets/);
  assert.match(script, /professional tattoo flash reference/);
  assert.match(script, /single complete tattoo motif/);
  assert.match(script, /fine line: delicate thin outlines, elegant negative space, minimal shading/);
  assert.match(script, /avoid poster art, logo design, sticker, clipart, 3d render, photorealism/i);
  assert.match(script, /No extra background objects, no frame, no border, no watermark, no signature/);
  assert.match(publicScript, /stylePromptPresets/);
  assert.match(publicScript, /professional tattoo flash reference/);
});

await run("homepage linework state explains credits and clear statuses", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /Linework is not generated yet/);
  assert.match(script, /Uses 1 generation credit/);
  assert.match(script, /Creating stencil linework/);
  assert.match(script, /Could not create linework/);
  assert.match(script, /Linework ready/);
});
await run("linework endpoint returns quota when provider fails", async () => {
  const server = await readFile("server.mjs", "utf8");

  assert.match(server, /if \(linework\.error\)/);
  assert.match(server, /\.\.\.linework,\s*quota/s);
});
await run("homepage protects selected concept downloads from stale persistence responses", async () => {
  const scripts = [
    await readFile("script.js", "utf8"),
    await readFile("public/script.js", "utf8")
  ];

  for (const script of scripts) {
    assert.match(script, /let selectedConceptPersistVersion = 0/);
    assert.match(script, /const persistVersion = selectedConceptPersistVersion \+ 1/);
    assert.match(script, /persistVersion !== selectedConceptPersistVersion/);
    assert.match(script, /const selectedConceptUrl = type === "concept" \? generatedImages\.concept : ""/);
    assert.match(script, /params\.set\("selectedConceptUrl", selectedConceptUrl\)/);
  }
});

await run("homepage sends the current selected concept to linework generation", async () => {
  const scripts = [
    await readFile("script.js", "utf8"),
    await readFile("public/script.js", "utf8")
  ];
  const nextRoute = await readFile("app/api/generate/linework/route.js", "utf8");
  const staticServer = await readFile("server.mjs", "utf8");

  for (const script of scripts) {
    assert.match(script, /selectedConceptUrl: generatedImages\.concept \?\? ""/);
    assert.doesNotMatch(script, /if \(type === "concept"\) \{\s*await selectedConceptPersistPromise/s);
    assert.match(script, /selectedConceptPersistPromise = selectedConceptPersistPromise/);
    assert.match(script, /await selectedConceptPersistPromise;/);
  }

  for (const source of [nextRoute, staticServer]) {
    assert.match(source, /body\.selectedConceptUrl/);
    assert.match(source, /updateGenerationConceptSelection/);
    assert.match(source, /savedGeneration = selected\.generation/);
  }
});

await run("linework failures do not become concept generation failures", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /let lineworkError = ""/);
  assert.match(script, /const blockingError = Boolean\(generationError && !generated\)/);
  assert.match(script, /heroPreviewCopy\.textContent = isGenerating/);
  assert.match(script, /heroMode === "linework" && lineworkError/);
  assert.doesNotMatch(script, /downloadConceptButton\.textContent = generationError/);
});

await run("public homepage script keeps the same hero linework fallback logic", async () => {
  const script = await readFile("public/script.js", "utf8");

  assert.match(script, /let lineworkError = ""/);
  assert.match(script, /getGeneratedImage\("linework"\) \|\| getConceptPreviewImage\(\)/);
  assert.match(script, /const blockingError = Boolean\(generationError && !generated\)/);
  assert.doesNotMatch(script, /downloadConceptButton\.textContent = generationError/);
});
await run("homepage generation fetch handles non-JSON platform errors", async () => {
  const script = await readFile("script.js", "utf8");
  const publicScript = await readFile("public/script.js", "utf8");

  for (const source of [script, publicScript]) {
    assert.match(source, /async function readJsonResponse/);
    assert.match(source, /content-type/);
    assert.match(source, /Generation service is temporarily unavailable/);
    assert.doesNotMatch(source, /const data = await response\.json\(\);\n    applyQuota\(data\.quota\);/);
  }
});

await run("generation APIs return saved Storage image URLs and expose a private image proxy", async () => {
  const nextRoute = await readFile("app/api/generate/route.js", "utf8");
  const staticServer = await readFile("server.mjs", "utf8");
  const storageRoute = await readFile("app/api/storage-image/route.js", "utf8");

  assert.match(nextRoute, /images: saved\.generation\.images \?\? generation\.images/);
  assert.match(nextRoute, /conceptCandidates: saved\.generation\.conceptCandidates \?\? generation\.conceptCandidates/);
  assert.match(staticServer, /images: saved\.generation\.images \?\? generation\.images/);
  assert.match(staticServer, /url\.pathname === "\/api\/storage-image"/);
  assert.match(storageRoute, /fetchOwnedStorageImage/);
  assert.match(storageRoute, /Cache-Control/);
});

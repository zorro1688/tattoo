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
  assert.match(html, /id="heroLineworkAction"/);
  assert.match(html, /href="\/my-designs"/);
  assert.match(html, /id="generateAnotherButton"/);
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
  assert.match(script, /getGeneratedImage\("linework"\) \|\| getConceptPreviewImage\(\)/);
  assert.match(script, /isDefaultHeroImage/);
  assert.match(script, /const blockingError = Boolean\(generationError && !generated\)/);
  assert.match(script, /classList\.toggle\("is-error", blockingError\)/);
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
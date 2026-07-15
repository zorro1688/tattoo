import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function run(name, test) {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run("homepage concept uses normalized lifecycle phases", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /let conceptPhase = "idle"/);
  assert.match(script, /conceptPhase = "generating"/);
  assert.match(script, /conceptPhase = "saving"/);
  assert.match(script, /conceptPhase = "ready"/);
  assert.match(script, /conceptPhase = "failed"/);
  assert.match(script, /InkFirstGenerationState\.resolveAssetState/);
});

await run("homepage blocks duplicate generation and candidate changes while busy", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /if \(isGenerationBusy\(\)\) \{\s*return;\s*\}/);
  assert.match(script, /Saving your designs\.\.\./);
  assert.match(script, /candidate\.disabled = conceptBusy/);
  assert.match(script, /downloadConceptButton\.disabled =[^;]*conceptBusy/);
  assert.match(script, /heroLineworkAction\.disabled =[^;]*conceptBusy/);
});

await run("root and public homepage scripts stay identical", async () => {
  const root = await readFile("script.js", "utf8");
  const publicCopy = await readFile("public/script.js", "utf8");

  assert.equal(publicCopy, root);
});

await run("homepage linework uses normalized lifecycle phases", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /let lineworkPhase = "not_generated"/);
  assert.match(script, /lineworkPhase = "generating"/);
  assert.match(script, /lineworkPhase = "saving"/);
  assert.match(script, /lineworkPhase = "ready"/);
  assert.match(script, /lineworkPhase = "failed"/);
  assert.match(script, /function getLineworkState\(\)/);
  assert.match(script, /function isLineworkBusy\(\)/);
  assert.match(script, /Saving linework\.\.\./);
  assert.match(script, /if \(!generated \|\| !currentGenerationId \|\| hasGeneratedLinework\(\) \|\| isLineworkBusy\(\)\)/);
});

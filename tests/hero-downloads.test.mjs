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

await run("homepage hero exposes placement preview download", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /id="downloadPlacementButton"/);
  assert.match(html, /Download placement/);
});

await run("homepage script downloads images and renders placement preview canvas", async () => {
  const script = await readFile("script.js", "utf8");

  assert.match(script, /downloadImageFile/);
  assert.match(script, /downloadPlacementPreview/);
  assert.match(script, /drawImage/);
  assert.match(script, /toBlob/);
  assert.match(script, /inkfirst-placement-preview\.png/);
});


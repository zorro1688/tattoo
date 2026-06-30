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

await run("My Designs script renders linework states and generation action", async () => {
  const script = await readFile("my-designs.js", "utf8");

  assert.match(script, /Linework ready/);
  assert.match(script, /Generate linework/);
  assert.match(script, /Linework not generated yet/);
  assert.match(script, /\/api\/generate\/linework/);
  assert.match(script, /data-linework-id/);
});

await run("My Designs page status explains linework credit usage", async () => {
  const html = await readFile("my-designs.html", "utf8");

  assert.match(html, /Linework uses 1 credit/);
});

await run("My Designs treats default linework assets as not generated", async () => {
  const script = await readFile("my-designs.js", "utf8");

  assert.match(script, /normalizeAssetPath/);
  assert.match(script, /isDefaultLineworkAsset/);
});
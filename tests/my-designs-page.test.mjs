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

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

await run("static server exposes the image download endpoint", async () => {
  const server = await readFile("server.mjs", "utf8");

  assert.match(server, /\/api\/download/);
  assert.match(server, /resolveDownloadFile/);
  assert.match(server, /Content-Disposition/);
});

await run("Next app exposes the image download endpoint", async () => {
  const route = await readFile("app/api/download/route.js", "utf8");

  assert.match(route, /resolveDownloadFile/);
  assert.match(route, /generationId/);
  assert.match(route, /Content-Disposition/);
});

await run("front-end download buttons use the server download endpoint", async () => {
  const homepageScript = await readFile("script.js", "utf8");
  const designScript = await readFile("design.js", "utf8");

  for (const script of [homepageScript, designScript]) {
    assert.match(script, /\/api\/download/);
    assert.match(script, /generationId/);
    assert.match(script, /type=concept/);
    assert.match(script, /type=linework/);
    assert.match(script, /type=placement/);
  }
});

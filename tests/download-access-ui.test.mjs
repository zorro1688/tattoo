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

await run("homepage and detail scripts load download access and watermark free downloads", async () => {
  const homeScript = await readFile("script.js", "utf8");
  const detailScript = await readFile("design.js", "utf8");

  for (const script of [homeScript, detailScript]) {
    assert.match(script, /\/api\/download-access/);
    assert.match(script, /downloadAccess/);
    assert.match(script, /downloadWatermarkedImage/);
    assert.match(script, /InkFirst/);
    assert.match(script, /Upgrade to download high-resolution files/);
  }
});

await run("static and next servers expose download access API", async () => {
  const server = await readFile("server.mjs", "utf8");
  const nextRoute = await readFile("app/api/download-access/route.js", "utf8");

  assert.match(server, /\/api\/download-access/);
  assert.match(nextRoute, /getDownloadAccess/);
});


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

await run("static checkout endpoint requires a signed-in account", async () => {
  const server = await readFile("server.mjs", "utf8");

  assert.match(server, /\/api\/billing\/checkout/);
  assert.match(server, /session\.isAuthenticated/);
  assert.match(server, /Sign in before upgrading/);
  assert.match(server, /401/);
});

await run("Next checkout endpoint requires a signed-in account", async () => {
  const route = await readFile("app/api/billing/checkout/route.js", "utf8");

  assert.match(route, /session\.isAuthenticated/);
  assert.match(route, /Sign in before upgrading/);
  assert.match(route, /status:\s*401/);
});

await run("homepage checkout opens sign-in before calling billing checkout", async () => {
  for (const file of ["script.js", "public/script.js"]) {
    const script = await readFile(file, "utf8");

    assert.match(script, /ensureSignedInForCheckout/);
    assert.match(script, /pendingCheckoutPlan/);
    assert.match(script, /\/api\/auth\/session/);
    assert.match(script, /window\.InkFirstAuth\.open/);
    assert.match(script, /Sign in before upgrading/);
    assert.match(script, /inkfirst:auth-state-changed/);
    assert.match(script, /\/api\/billing\/checkout\?plan=/);
  }
});

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

await run("cloud verification script checks required tables and storage", async () => {
  const script = await readFile("scripts/verify-supabase-cloud.mjs", "utf8");

  for (const table of [
    "profiles",
    "anonymous_clients",
    "user_entitlements",
    "generations",
    "generation_assets",
    "credit_events",
    "billing_events"
  ]) {
    assert.match(script, new RegExp(table));
  }

  assert.match(script, /SUPABASE_STORAGE_BUCKET/);
  assert.match(script, /storage\/v1\/object/);
  assert.match(script, /health-check/);
  assert.match(script, /Supabase cloud verification passed/);
});

await run("package exposes Supabase cloud verification command", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts["verify:supabase"], "node scripts/verify-supabase-cloud.mjs");
});

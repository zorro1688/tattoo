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

await run("production readiness script checks every external provider", async () => {
  const script = await readFile("scripts/check-production-setup.mjs", "utf8");

  for (const name of [
    "NEXT_PUBLIC_APP_URL",
    "GENERATION_PROVIDER",
    "REPLICATE_API_TOKEN",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "PAYMENT_PROVIDER",
    "CREEM_API_KEY",
    "CREEM_CREATOR_PACK_PRODUCT_ID",
    "CREEM_PRO_MONTHLY_PRODUCT_ID",
    "CREEM_PRO_YEARLY_PRODUCT_ID",
    "CREEM_WEBHOOK_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET"
  ]) {
    assert.match(script, new RegExp(name));
  }

  assert.match(script, /Production setup is ready/);
  assert.match(script, /https/);
  assert.match(script, /localhost/);
  assert.match(script, /process\.exit\(1\)/);
});

await run("package exposes production readiness command", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts["check:prod"], "node scripts/check-production-setup.mjs");
});

await run("production deployment checklist documents required setup", async () => {
  const checklist = await readFile("docs/production-checklist.md", "utf8");

  for (const text of [
    "Replicate",
    "Supabase",
    "Creem",
    "Google OAuth",
    "NEXT_PUBLIC_APP_URL",
    "Webhook",
    "Redirect URL",
    "npm run check:prod",
    "npm run test:regression"
  ]) {
    assert.match(checklist, new RegExp(text, "i"));
  }
});

await run("env example includes production provider keys", async () => {
  const example = await readFile(".env.example", "utf8");

  for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "REPLICATE_API_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "CREEM_WEBHOOK_SECRET"]) {
    assert.match(example, new RegExp(name));
  }
});
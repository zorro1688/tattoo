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

function assertContains(source, items) {
  for (const item of items) {
    assert.match(source, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
}

await run("manual full-flow checklist documents the paid user journey", async () => {
  const doc = await readFile("docs/full-flow-manual-checklist.md", "utf8");

  assertContains(doc, [
    "Google login",
    "Generate a concept",
    "My Designs",
    "Design detail",
    "Generate linework",
    "Download watermarked",
    "Creem checkout",
    "Download high-res",
    "Billing",
    "Expected final state"
  ]);
});

await run("QA checklist page is available from the static server", async () => {
  const html = await readFile("qa-checklist.html", "utf8");
  const server = await readFile("server.mjs", "utf8");

  assertContains(html, [
    "InkFirst Full Flow QA",
    "Pre-flight",
    "Google login",
    "Payment and download",
    "Billing verification"
  ]);
  assert.match(server, /url\.pathname === "\/qa-checklist"/);
});

await run("full-flow check command exists and covers environment plus regression checks", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const script = await readFile("scripts/full-flow-check.mjs", "utf8");

  assert.equal(pkg.scripts["check:full-flow"], "node scripts/full-flow-check.mjs");
  assertContains(script, [
    "NEXT_PUBLIC_APP_URL",
    "CREEM_WEBHOOK_SECRET",
    "REPLICATE_API_TOKEN",
    "verify:supabase",
    "test:regression",
    "ngrok"
  ]);
});

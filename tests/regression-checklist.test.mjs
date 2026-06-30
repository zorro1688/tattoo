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

await run("end-to-end regression script groups the core automated checks", async () => {
  const script = await readFile("scripts/regression-check.mjs", "utf8");

  for (const command of [
    "tests/auth-core.test.mjs",
    "tests/login-merge-flow.test.mjs",
    "tests/generation-core.test.mjs",
    "tests/my-designs-linework.test.mjs",
    "tests/design-detail-page.test.mjs",
    "tests/download-endpoint.test.mjs",
    "tests/billing-page.test.mjs",
    "tests/billing-history-api.test.mjs",
    "tests/success-page.test.mjs",
    "node_modules/typescript/bin/tsc"
  ]) {
    assert.match(script, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(script, /Regression checks passed/);
  assert.match(script, /process\.exitCode = 1/);
});

await run("package exposes one command for the regression script", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts["test:regression"], "node scripts/regression-check.mjs");
});

await run("manual regression checklist covers third-party browser flows", async () => {
  const checklist = await readFile("docs/regression-checklist.md", "utf8");

  for (const text of [
    "Google login",
    "Concept generation",
    "Linework generation",
    "My Designs",
    "Design detail",
    "Creem payment",
    "Billing & Credits",
    "Download high-res",
    "Download watermarked",
    "ngrok"
  ]) {
    assert.match(checklist, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

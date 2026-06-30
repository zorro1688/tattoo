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

await run("billing cancelled page guides users back to pricing", async () => {
  const html = await readFile("billing-cancelled.html", "utf8");

  assert.match(html, /Payment cancelled/);
  assert.match(html, /Return to pricing/);
  assert.match(html, /href="\/#pricing"/);
});

await run("static and next servers expose billing cancelled page", async () => {
  const server = await readFile("server.mjs", "utf8");
  const nextPage = await readFile("app/billing-cancelled/page.tsx", "utf8");

  assert.match(server, /url\.pathname === "\/billing-cancelled"/);
  assert.match(nextPage, /billing-cancelled\.html/);
});

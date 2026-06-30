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

await run("billing page has semantic account summary and history containers", async () => {
  const html = await readFile("billing.html", "utf8");
  const h1Count = (html.match(/<h1\b/g) ?? []).length;

  assert.equal(h1Count, 1);
  assert.match(html, /<title>Billing & Credits \| InkFirst<\/title>/);
  assert.match(html, /<h1>Billing & Credits<\/h1>/);
  assert.match(html, /id="billingStatus"/);
  assert.match(html, /id="billingPlan"/);
  assert.match(html, /id="billingCredits"/);
  assert.match(html, /id="billingFreeCredits"/);
  assert.match(html, /id="billingTotalCredits"/);
  assert.match(html, /id="billingLastPayment"/);
  assert.match(html, /id="billingPaymentSource"/);
  assert.match(html, /id="billingDownloadAccess"/);
  assert.match(html, /id="billingHistory"/);
  assert.match(html, /href="\/#pricing"/);
  assert.match(html, /script src="auth\.js"/);
  assert.match(html, /script src="billing\.js"/);
});

await run("billing script fetches safe billing history and handles auth states", async () => {
  for (const file of ["billing.js", "public/billing.js"]) {
    const script = await readFile(file, "utf8");

    assert.match(script, /\/api\/billing-events\?limit=20/);
    assert.match(script, /escapeHtml/);
    assert.match(script, /No billing history yet/);
    assert.match(script, /Sign in to view billing history/);
    assert.match(script, /window\.InkFirstAuth\.open/);
    assert.match(script, /provider/);
    assert.match(script, /status/);
    assert.match(script, /credits/);
    assert.match(script, /occurredAt/);
    assert.match(script, /billingFreeCredits/);
    assert.match(script, /billingTotalCredits/);
    assert.match(script, /billingLastPayment/);
    assert.match(script, /billingPaymentSource/);
  }
});

await run("static and Next runtimes expose the billing page", async () => {
  const server = await readFile("server.mjs", "utf8");
  const nextPage = await readFile("app/billing/page.tsx", "utf8");

  assert.match(server, /url\.pathname === "\/billing"/);
  assert.match(nextPage, /billing\.html/);
  assert.match(nextPage, /billing\.js/);
});

await run("account menu links to billing history", async () => {
  for (const file of ["auth.js", "public/auth.js"]) {
    const script = await readFile(file, "utf8");

    assert.match(script, /href="\/billing"/);
    assert.match(script, /Billing & Download access/);
  }
});

await run("billing page styles support desktop table and mobile stacked rows", async () => {
  for (const file of ["styles.css", "app/globals.css"]) {
    const css = await readFile(file, "utf8");

    assert.match(css, /billing-page/);
    assert.match(css, /billing-summary-grid/);
    assert.match(css, /billing-history-table/);
    assert.match(css, /billing-mobile-label/);
    assert.match(css, /max-width:\s*720px[\s\S]*billing-history-table/);
  }
});

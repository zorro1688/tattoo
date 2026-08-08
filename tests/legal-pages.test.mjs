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

const pages = [
  ["privacy.html", "/privacy", "Privacy Policy", [
    /anonymous identifier/i,
    /generated images/i,
    /placement settings/i,
    /Supabase/,
    /Vercel/,
    /Replicate/,
    /Google OAuth/,
    /Creem/,
    /do not sell personal data/i,
    /access, correction, or deletion/i
  ]],
  ["terms.html", "/terms", "Terms of Service", [
    /individual operator/i,
    /creative reference/i,
    /not professional tattooing, medical, or safety advice/i,
    /acceptable use/i,
    /Refund Policy/
  ]],
  ["refunds.html", "/refunds", "Refund Policy", [
    /digital services(?: are)? delivered immediately/i,
    /generally non-refundable/i,
    /mandatory law/i,
    /duplicate charges/i,
    /technical errors/i,
    /non-delivery/i,
    /already-used credits or downloads/i
  ]]
];

await run("legal pages provide required product information and static routes", async () => {
  const server = await readFile("server.mjs", "utf8");

  for (const [htmlFile, route, heading, commitments] of pages) {
    const html = await readFile(htmlFile, "utf8");

    assert.match(html, new RegExp(`<title>${heading} \\| InkFirst</title>`));
    assert.match(html, new RegExp(`<h1>${heading}</h1>`));
    assert.match(html, /Last updated: August 8, 2026/);
    assert.match(html, /hello@inkfirst\.ai/);
    assert.match(server, new RegExp(`url\\.pathname === "${route}"`));

    for (const commitment of commitments) {
      assert.match(html, commitment);
    }
  }
});

await run("Next routes render the corresponding legal documents", async () => {
  for (const [pageFile, htmlFile] of [
    ["app/privacy/page.tsx", "privacy.html"],
    ["app/terms/page.tsx", "terms.html"],
    ["app/refunds/page.tsx", "refunds.html"]
  ]) {
    const page = await readFile(pageFile, "utf8");
    assert.match(page, new RegExp(htmlFile.replace(".", "\\.")));
    assert.match(page, /dangerouslySetInnerHTML/);
  }
});
await run("landing footer links to the legal pages and uses a copyright entity", async () => {
  const home = await readFile("index.html", "utf8");

  assert.match(home, /href="\/privacy">Privacy Policy<\/a>/);
  assert.match(home, /href="\/terms">Terms of Service<\/a>/);
  assert.match(home, /href="\/refunds">Refund Policy<\/a>/);
  assert.match(home, /&copy; 2026 InkFirst\. All rights reserved\./);
  assert.doesNotMatch(home, /\? 2026 InkFirst/);
});

await run("legal pages have matching responsive styles in both runtimes", async () => {
  for (const cssFile of ["app/globals.css", "styles.css"]) {
    const css = await readFile(cssFile, "utf8");

    for (const selector of [".legal-page", ".legal-brand", ".legal-kicker", ".legal-updated", ".legal-section"]) {
      assert.match(css, new RegExp(selector.replace(".", "\\.")));
    }

    assert.match(css, /\.legal-page a/);
    assert.match(css, /max-width:\s*720px[\s\S]*\.legal-page/);
  }
});

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

await run("success page explains unlocked downloads and links to My Designs", async () => {
  const html = await readFile("success.html", "utf8");

  assert.match(html, /<h1 id="successTitle">Payment received<\/h1>/);
  assert.match(html, /Back to My Designs/);
  assert.match(html, /href="\/my-designs"/);
  assert.match(html, /id="successReturnLink"/);
  assert.match(html, /script src="success\.js"/);
});

await run("static and next servers expose success page", async () => {
  const server = await readFile("server.mjs", "utf8");
  const nextPage = await readFile("app/success/page.tsx", "utf8");

  assert.match(server, /url\.pathname === "\/success"/);
  assert.match(nextPage, /success\.html/);
  assert.match(nextPage, /success\.js/);
});

await run("success script can update optional return link and refresh download access", async () => {
  for (const file of ["success.js", "public/success.js"]) {
    const script = await readFile(file, "utf8");

    assert.match(script, /\/api\/download-access/);
    assert.match(script, /returnTo/);
    assert.match(script, /successReturnLink/);
    assert.match(script, /successReturnLink\.href = returnTo/);
    assert.match(script, /successTitle/);
    assert.match(script, /setSuccessTitle/);
    assert.match(script, /High-resolution downloads are unlocked/);
  }
});

await run("success script polls while payment access is finalizing", async () => {
  for (const file of ["success.js", "public/success.js"]) {
    const script = await readFile(file, "utf8");

    assert.match(script, /MAX_ACCESS_CHECKS/);
    assert.match(script, /ACCESS_CHECK_INTERVAL_MS/);
    assert.match(script, /setTimeout/);
    assert.match(script, /Payment received\. Finalizing your access/);
    assert.match(script, /This usually takes less than a minute/);
  }
});


await run("success page avoids duplicate My Designs navigation and keeps the top CTA compact", async () => {
  const html = await readFile("success.html", "utf8");
  const css = await readFile("styles.css", "utf8");

  assert.match(html, /<a href="\/my-designs">My Designs<\/a>/);
  assert.match(html, /<a class="nav-cta" href="\/billing">Billing<\/a>/);
  assert.equal((html.match(/<a class="nav-cta" href="\/my-designs">My Designs<\/a>/g) ?? []).length, 0);
  assert.match(css, /\.topbar\s*>\s*\.nav-cta[\s\S]*justify-self:\s*end/);
});



await run("success page gives clear recovery actions while payment confirmation is delayed", async () => {
  const html = await readFile("success.html", "utf8");

  assert.match(html, /id="successCheckAgain"/);
  assert.match(html, /Check again/);
  assert.match(html, /href="\/billing"/);
  assert.match(html, /View Billing/);
});

await run("success script explains delayed Creem confirmation and supports manual recheck", async () => {
  for (const file of ["success.js", "public/success.js"]) {
    const script = await readFile(file, "utf8");

    assert.match(script, /successCheckAgain/);
    assert.match(script, /addEventListener\("click"/);
    assert.match(script, /This usually takes less than a minute/);
    assert.match(script, /Check again/);
    assert.doesNotMatch(script, /Still waiting for Creem confirmation/);
  }
});
await run("success page uses a restrained confirmation title size", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.success-page h1[\s\S]*font-size:\s*clamp\(36px,\s*5vw,\s*64px\)/);
  assert.match(css, /\.success-page h1[\s\S]*line-height:\s*1\.02/);
});

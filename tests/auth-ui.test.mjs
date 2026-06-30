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

await run("public pages load the shared auth UI script", async () => {
  for (const file of ["index.html", "my-designs.html", "design.html"]) {
    const html = await readFile(file, "utf8");
    assert.match(html, /auth\.js/);
  }
});

await run("auth UI calls email OTP auth endpoints", async () => {
  const script = await readFile("auth.js", "utf8");

  assert.match(script, /\/api\/auth\/session/);
  assert.match(script, /\/api\/auth\/request-otp/);
  assert.match(script, /\/api\/auth\/verify-otp/);
  assert.match(script, /\/api\/auth\/sign-out/);
  assert.match(script, /Sign in/);
});

await run("auth UI keeps sign in beside the top-right CTA", async () => {
  const script = await readFile("auth.js", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(script, /topbar-actions/);
  assert.ok(script.includes('topbar.querySelector(".nav-cta")'));
  assert.match(script, /actions\.append\(navCta\)/);
  assert.match(styles, /\.topbar-actions/);
});

await run("signed-in auth UI exposes account menu actions", async () => {
  const script = await readFile("auth.js", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(script, /auth-account-menu/);
  assert.match(script, /Account/);
  assert.match(script, /My Designs/);
  assert.match(script, /Download access/);
  assert.match(script, /Sign out/);
  assert.match(script, /aria-expanded/);
  assert.match(styles, /\.auth-menu/);
});

await run("auth UI announces session changes without forcing a page reload", async () => {
  const script = await readFile("auth.js", "utf8");
  const signedInFlow = script.slice(
    script.indexOf('status.textContent = "Signed in."'),
    script.indexOf("  } catch (error)", script.indexOf('status.textContent = "Signed in."'))
  );

  assert.match(script, /inkfirst:auth-state-changed/);
  assert.match(script, /CustomEvent/);
  assert.match(signedInFlow, /await loadAuthSession\(\)/);
  assert.doesNotMatch(signedInFlow, /window\.location\.reload\(\)/);
});

await run("My Designs page has account state copy", async () => {
  const html = await readFile("my-designs.html", "utf8");
  const script = await readFile("auth.js", "utf8");

  assert.match(html, /data-auth-account-note/);
  assert.match(html, /Sign in to keep designs across devices/);
  assert.match(script, /data-auth-account-note/);
});

await run("auth UI exposes Google sign in before email fallback", async () => {
  const script = await readFile("auth.js", "utf8");

  assert.match(script, /Continue with Google/);
  assert.match(script, /\/api\/auth\/google\/start/);
  assert.match(script, /authGoogleButton/);
});
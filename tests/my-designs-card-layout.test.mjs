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

await run("My Designs actions use compact non-pill status and full-width buttons", async () => {
  const css = await readFile("styles.css", "utf8");

  assert.match(css, /\.my-design-actions\s*{[^}]*grid-template-columns:\s*1fr 1fr/s);
  assert.match(css, /\.my-design-status\s*{[^}]*border-radius:\s*10px/s);
  assert.match(css, /\.my-design-status\s*{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(css, /\.my-design-actions \.secondary-button\s*{[^}]*width:\s*100%/s);
});


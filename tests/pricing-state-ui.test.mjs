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

await run("homepage pricing can show active paid access and available credits", async () => {
  for (const file of ["script.js", "public/script.js"]) {
    const script = await readFile(file, "utf8");

    assert.match(script, /pricingEntitlement/);
    assert.match(script, /renderPricingState/);
    assert.match(script, /Creator Pack active/);
    assert.match(script, /credits available/);
    assert.match(script, /downloadAccess\.highResolution/);
    assert.match(script, /paidRemaining/);
  }
});

await run("pricing buttons are marked with plan metadata", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /id="creatorPackButton"[^>]+data-plan="creator-pack"/);
  assert.match(html, /id="upgradeButton"[^>]+data-plan="pro-monthly"/);
  assert.match(html, /id="yearlyButton"[^>]+data-plan="pro-yearly"/);
});
await run("empty quota generate button routes users to pricing", async () => {
  for (const file of ["script.js", "public/script.js"]) {
    const script = await readFile(file, "utf8");

    assert.match(script, /generateButton\.disabled = conceptBusy/);
    assert.doesNotMatch(script, /generateButton\.disabled = quota <= 0 \|\| conceptBusy/);
    assert.match(script, /Upgrade to Generate More/);
    assert.match(script, /Free quota is used up\. Upgrade to unlock more tattoo ideas\./);
    assert.match(script, /document\.querySelector\("#pricing"\)\?\.scrollIntoView\(\{ behavior: "smooth" \}\)/);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const regression = await readFile(new URL("scripts/regression-check.mjs", root), "utf8");
const readme = await readFile(new URL("README.md", root), "utf8");
const checklist = await readFile(new URL("docs/production-checklist.md", root), "utf8");

assert.equal(
  packageJson.scripts["test:quality"],
  "node tests/quality-evaluation-dataset.test.mjs && node tests/quality-evaluation-core.test.mjs && node tests/quality-evaluation-cli.test.mjs && node tests/quality-evaluation-setup.test.mjs",
);
assert.equal(
  packageJson.scripts["eval:quality"],
  "node scripts/evaluate-generation-quality.mjs",
);
assert.match(regression, /quality-evaluation-dataset\.test\.mjs/);
assert.match(regression, /quality-evaluation-core\.test\.mjs/);
assert.match(regression, /quality-evaluation-cli\.test\.mjs/);
assert.match(regression, /quality-evaluation-setup\.test\.mjs/);
assert.match(readme, /npm run eval:quality/);
assert.match(readme, /--generate/);
assert.match(checklist, /Four-candidate batch success/);
assert.match(checklist, /90%/);

console.log("Quality evaluation setup tests passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const datasetUrl = new URL("../quality-evaluation/prompts.json", import.meta.url);
const cases = JSON.parse(await readFile(datasetUrl, "utf8"));

assert.equal(Array.isArray(cases), true);
assert.equal(cases.length, 12);

const categories = new Set(cases.map((entry) => entry.category));
assert.deepEqual(
  [...categories].sort(),
  ["animal", "geometric", "lettering", "plant"],
);

const ids = cases.map((entry) => entry.id);
assert.equal(new Set(ids).size, ids.length);

for (const entry of cases) {
  assert.match(entry.id, /^[a-z0-9-]+$/);
  assert.equal(typeof entry.input?.idea, "string");
  assert.equal(entry.input.idea.length > 0, true);
  assert.equal(typeof entry.input?.style, "string");
  assert.equal(typeof entry.input?.placement, "string");
  assert.equal(typeof entry.input?.size, "string");
  assert.equal(typeof entry.input?.complexity, "string");
  assert.equal(Array.isArray(entry.expectedElements), true);
  assert.equal(entry.expectedElements.length > 0, true);
  assert.equal(Array.isArray(entry.forbiddenElements), true);
}

for (const category of categories) {
  assert.equal(
    cases.filter((entry) => entry.category === category).length,
    3,
  );
}

console.log("Quality evaluation dataset tests passed.");

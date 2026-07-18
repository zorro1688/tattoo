import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const conceptRoute = await readFile(new URL("../app/api/generate/route.js", import.meta.url), "utf8");
const lineworkRoute = await readFile(new URL("../app/api/generate/linework/route.js", import.meta.url), "utf8");
const staticServer = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

for (const source of [conceptRoute, lineworkRoute]) {
  assert.match(source, /createRequestId/);
  assert.match(source, /reportError/);
  assert.match(source, /X-Request-Id/);
  assert.doesNotMatch(source, /reportError\([\s\S]{0,500}(?:body|prompt|idea|email|cookie|authorization)\s*:/i);
}

assert.match(conceptRoute, /concept_generation_failed/);
assert.match(conceptRoute, /concept_route_failed/);
assert.match(conceptRoute, /providerPredictionId:\s*generation\.predictionId/);

assert.match(lineworkRoute, /linework_generation_failed/);
assert.match(lineworkRoute, /linework_route_failed/);
assert.match(lineworkRoute, /providerPredictionId:\s*linework\.predictionId/);

assert.match(staticServer, /createRequestId/);
assert.match(staticServer, /X-Request-Id/);
assert.match(staticServer, /concept_generation_failed/);
assert.match(staticServer, /linework_generation_failed/);

console.log("Monitoring route tests passed.");

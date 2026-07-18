import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const supabaseStore = await readFile(new URL("../supabase-store.mjs", import.meta.url), "utf8");
const downloadRoute = await readFile(new URL("../app/api/download/route.js", import.meta.url), "utf8");
const staticServer = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

assert.match(supabaseStore, /reportError/);
assert.match(supabaseStore, /concept_storage_persistence_failed/);
assert.match(supabaseStore, /linework_storage_persistence_failed/);
assert.match(supabaseStore, /generationId:\s*savedGeneration\?\.id/);
assert.match(supabaseStore, /providerPredictionId:\s*savedGeneration\?\.providerGenerationId/);
assert.match(supabaseStore, /generationId:\s*generation\?\.id/);
assert.match(supabaseStore, /providerPredictionId:\s*generation\?\.providerGenerationId/);

assert.match(downloadRoute, /createRequestId/);
assert.match(downloadRoute, /reportError/);
assert.match(downloadRoute, /download_resolution_failed/);
assert.match(downloadRoute, /file\.status\s*>=\s*500/);
assert.match(downloadRoute, /X-Request-Id/);

assert.match(staticServer, /download_resolution_failed/);
assert.match(staticServer, /file\.status\s*>=\s*500/);

console.log("Monitoring Storage and Download tests passed.");

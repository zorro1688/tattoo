import assert from "node:assert/strict";
import { classifyCompositionIntent, buildCompositionGuidance } from "../candidate-quality-core.mjs";

assert.equal(classifyCompositionIntent("wolf"), "portrait");
assert.equal(classifyCompositionIntent("wolf head"), "portrait");
assert.equal(classifyCompositionIntent("half body tiger"), "half_body");
assert.equal(classifyCompositionIntent("full body wolf with all four legs"), "full_body");
assert.match(buildCompositionGuidance({ idea: "wolf", category: "animal" }), /portrait or upper-body/i);
assert.match(buildCompositionGuidance({ idea: "full body wolf", category: "animal" }), /all four legs/i);

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const measurementId = "G-GLXCWGBQZP";
const layout = await readFile("app/layout.tsx", "utf8");
const analytics = await readFile("public/site-events.js", "utf8").catch(() => "");
const rootScript = await readFile("script.js", "utf8");
const publicScript = await readFile("public/script.js", "utf8");

assert.match(layout, /from "next\/script"/);
assert.match(layout, new RegExp(`googletagmanager\\.com/gtag/js\\?id=${measurementId}`));
assert.match(layout, new RegExp(`gtag\\('config', '${measurementId}'`));
assert.match(layout, /src="\/site-events\.js"/);

for (const eventName of [
  "guide_prompt_copy",
  "guide_generator_entry",
  "guide_prefill_applied"
]) {
  assert.match(analytics, new RegExp(eventName));
}
assert.doesNotMatch(analytics, /idea|advancedPrompt/);

const listeners = new Map();
const trackedEvents = [];
const context = {
  window: {
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    gtag(...args) {
      trackedEvents.push(args);
    }
  }
};
vm.runInNewContext(analytics, context);
listeners.get("inkfirst:guide-generator-entry")({
  detail: {
    guide: "first-tattoo-ideas",
    caseId: "mountain",
    idea: "private prompt",
    advancedPrompt: "private prompt details"
  }
});
assert.deepEqual(JSON.parse(JSON.stringify(trackedEvents)), [
  ["event", "guide_generator_entry", {
    guide: "first-tattoo-ideas",
    case_id: "mountain"
  }]
]);

for (const script of [rootScript, publicScript]) {
  assert.match(script, /generation_started/);
  assert.match(script, /generation_succeeded/);
  assert.match(script, /generation_failed/);
  assert.match(script, /window\.InkFirstAnalytics\?\.track/);
}

console.log("google analytics contracts passed");

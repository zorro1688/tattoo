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
  localStorage: {
    values: new Map(),
    getItem(key) {
      return this.values.get(key) ?? null;
    },
    setItem(key, value) {
      this.values.set(key, value);
    }
  },
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

context.window.InkFirstAnalytics.trackDownload("concept", "paid");
context.window.InkFirstAnalytics.trackPurchase({
  transactionId: "evt_paid_once",
  plan: "creator-pack",
  itemName: "Creator Pack",
  value: 9.99,
  currency: "USD"
});
context.window.InkFirstAnalytics.trackPurchase({
  transactionId: "evt_paid_once",
  plan: "creator-pack",
  itemName: "Creator Pack",
  value: 9.99,
  currency: "USD"
});
assert.deepEqual(JSON.parse(JSON.stringify(trackedEvents.slice(1))), [
  ["event", "download_completed", {
    download_type: "concept",
    access_tier: "paid"
  }],
  ["event", "purchase", {
    transaction_id: "evt_paid_once",
    value: 9.99,
    currency: "USD",
    items: [{
      item_id: "creator-pack",
      item_name: "Creator Pack",
      price: 9.99,
      quantity: 1
    }]
  }]
]);

for (const script of [rootScript, publicScript]) {
  assert.match(script, /generation_started/);
  assert.match(script, /generation_succeeded/);
  assert.match(script, /generation_failed/);
  assert.match(script, /window\.InkFirstAnalytics\?\.track/);
  assert.match(script, /trackDownload\(\s*type/);
}

const successScript = await readFile("public/success.js", "utf8");
assert.match(successScript, /trackConfirmedPurchase\(data\.purchase\)/);

const downloadAccessRoute = await readFile("app/api/download-access/route.js", "utf8");
assert.match(downloadAccessRoute, /purchase/);
assert.match(downloadAccessRoute, /transactionId/);

console.log("google analytics contracts passed");

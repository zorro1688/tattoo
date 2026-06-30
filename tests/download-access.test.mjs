import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addPaidCredits,
  getDownloadAccess,
  getQuotaState
} from "../quota-store.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function withTempStore(testBody) {
  const dir = await mkdtemp(join(tmpdir(), "inkfirst-downloads-"));
  const storePath = join(dir, "store.json");

  try {
    await testBody(storePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await run("free clients can only download watermarked low resolution files", async () => {
  await withTempStore(async (storePath) => {
    await getQuotaState("client-free", storePath);

    const access = await getDownloadAccess("client-free", storePath);

    assert.equal(access.highResolution, false);
    assert.equal(access.watermarked, true);
    assert.equal(access.message, "Upgrade to download high-resolution files");
  });
});

await run("paid clients can download high resolution files even after credits change", async () => {
  await withTempStore(async (storePath) => {
    await addPaidCredits(
      "client-paid",
      20,
      {
        source: "creem",
        externalEventId: "evt_download_123",
        plan: "creator-pack"
      },
      storePath
    );

    const access = await getDownloadAccess("client-paid", storePath);

    assert.equal(access.highResolution, true);
    assert.equal(access.watermarked, false);
    assert.equal(access.message, "High-resolution downloads are unlocked");
  });
});


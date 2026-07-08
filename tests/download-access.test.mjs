import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
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


await run("configured Supabase download access never writes local fallback store", async () => {
  await withTempStore(async (storePath) => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    try {
      const accessState = await getDownloadAccess("client-production", storePath);

      assert.equal(accessState.highResolution, false);
      assert.equal(accessState.watermarked, true);
      await assert.rejects(() => access(storePath), /ENOENT/);
    } finally {
      if (previousUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      }

      if (previousKey === undefined) {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      } else {
        process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
      }
    }
  });
});

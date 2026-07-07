import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { consumeGenerationCredit, addPaidCredits } from "../quota-store.mjs";
import {
  resolveDownloadFile,
  renderWatermarkedSvg
} from "../download-core.mjs";

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
  const dir = await mkdtemp(join(tmpdir(), "inkfirst-download-core-"));
  const storePath = join(dir, "store.json");

  try {
    await testBody(storePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const input = {
  idea: "small rose with moon",
  style: "Fine line",
  placement: "Forearm",
  size: "Small",
  complexity: "Beginner friendly"
};

const generation = {
  id: "replicate-123",
  provider: "replicate",
  model: "black-forest-labs/flux-schnell",
  status: "succeeded",
  prompt: "fine line tattoo design of small rose with moon",
  placementNote: "Use a vertical composition.",
  images: {
    concept: "https://example.com/concept.webp",
    linework: "https://example.com/linework.webp",
    placement: "/assets/hero-placement.png"
  }
};

await run("free concept downloads return a watermarked SVG wrapper", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit("client-free", input, generation, storePath);

    const file = await resolveDownloadFile({
      clientId: "client-free",
      generationId: saved.generation.id,
      type: "concept",
      fetchImage: async (url) => ({
        ok: true,
        contentType: "image/webp",
        body: Buffer.from(`original:${url}`)
      }),
      storePath
    });

    assert.equal(file.status, 200);
    assert.equal(file.contentType, "image/svg+xml; charset=utf-8");
    assert.equal(file.filename, "inkfirst-concept-watermarked.svg");
    assert.match(file.body.toString("utf8"), /InkFirst/);
    assert.match(file.body.toString("utf8"), /opacity="0\.22"/);
    assert.doesNotMatch(file.body.toString("utf8"), /Upgrade to download high-resolution files/);
    assert.match(file.body.toString("utf8"), /data:image\/webp;base64/);
    assert.doesNotMatch(file.body.toString("utf8"), /https:\/\/example\.com\/concept\.webp/);
  });
});

await run("paid concept downloads proxy the original high-resolution image", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit("client-paid", input, generation, storePath);
    await addPaidCredits("client-paid", 20, { externalEventId: "evt_paid_download" }, storePath);

    const file = await resolveDownloadFile({
      clientId: "client-paid",
      generationId: saved.generation.id,
      type: "concept",
      fetchImage: async (url) => ({
        ok: true,
        contentType: "image/webp",
        body: Buffer.from(`original:${url}`)
      }),
      storePath
    });

    assert.equal(file.status, 200);
    assert.equal(file.contentType, "image/webp");
    assert.equal(file.filename, "inkfirst-concept-high-resolution.webp");
    assert.equal(file.body.toString("utf8"), "original:https://example.com/concept.webp");
  });
});

await run("paid concept downloads prefer Supabase Storage assets", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit("client-paid", input, generation, storePath);
    await addPaidCredits("client-paid", 20, { externalEventId: "evt_paid_storage_download" }, storePath);

    const store = JSON.parse(await readFile(storePath, "utf8"));
    store.generations[0].assets = {
      concept: {
        storageBucket: "inkfirst-designs",
        storagePath: "client-paid/gen-storage/concept.webp",
        sourceUrl: "https://example.com/concept.webp",
        contentType: "image/webp"
      }
    };
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

    const file = await resolveDownloadFile({
      clientId: "client-paid",
      generationId: saved.generation.id,
      type: "concept",
      fetchImage: async () => {
        throw new Error("source image should not be fetched");
      },
      fetchStoredImage: async (asset) => ({
        ok: true,
        contentType: asset.contentType,
        body: Buffer.from(`stored:${asset.storagePath}`)
      }),
      storePath
    });

    assert.equal(file.status, 200);
    assert.equal(file.contentType, "image/webp");
    assert.equal(file.filename, "inkfirst-concept-high-resolution.webp");
    assert.equal(file.body.toString("utf8"), "stored:client-paid/gen-storage/concept.webp");
  });
});

await run("missing linework returns a clear not found error", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit(
      "client-free",
      input,
      {
        ...generation,
        images: { ...generation.images, linework: "/assets/hero-linework.png" }
      },
      storePath
    );

    const file = await resolveDownloadFile({
      clientId: "client-free",
      generationId: saved.generation.id,
      type: "linework",
      storePath
    });

    assert.equal(file.status, 404);
    assert.equal(file.error, "Linework has not been generated yet.");
  });
});

await run("placement downloads are rendered server-side with tattoo details", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit("client-free", input, generation, storePath);

    const file = await resolveDownloadFile({
      clientId: "client-free",
      generationId: saved.generation.id,
      type: "placement",
      fetchImage: async (url) => ({
        ok: true,
        contentType: "image/webp",
        body: Buffer.from(`original:${url}`)
      }),
      storePath
    });

    const body = file.body.toString("utf8");

    assert.equal(file.status, 200);
    assert.equal(file.contentType, "image/svg+xml; charset=utf-8");
    assert.match(file.filename, /placement-watermarked\.svg$/);
    assert.match(body, /Fine line/);
    assert.match(body, /InkFirst/);
    assert.doesNotMatch(body, /Use a vertical composition/);
  });
});

await run("invalid download type is rejected", async () => {
  const file = await resolveDownloadFile({
    clientId: "client-free",
    generationId: "gen_missing",
    type: "brief"
  });

  assert.equal(file.status, 400);
  assert.equal(file.error, "Download type must be concept, linework, or placement.");
});

await run("watermarked SVG escapes user-controlled text", () => {
  const svg = renderWatermarkedSvg({
    imageUrl: "https://example.com/<image>.webp",
    title: "Rose <script>",
    subtitle: "Forearm & wrist",
    watermarked: true
  });

  assert.match(svg, /Rose &lt;script&gt;/);
  assert.match(svg, /https:\/\/example\.com\/&lt;image&gt;\.webp/);
  assert.doesNotMatch(svg, /<script>/);
});


await run("placement downloads include saved placement adjustment transform", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit("client-placement-adjusted", input, generation, storePath);
    const store = JSON.parse(await readFile(storePath, "utf8"));
    store.generations[0].placementAdjustment = { x: 0.61, y: 0.37, scale: 1.24, rotation: -14 };
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

    const file = await resolveDownloadFile({
      clientId: "client-placement-adjusted",
      generationId: saved.generation.id,
      type: "placement",
      fetchImage: async (url) => ({
        ok: true,
        contentType: "image/webp",
        body: Buffer.from(`original:${url}`)
      }),
      storePath
    });

    const body = file.body.toString("utf8");

    assert.equal(file.status, 200);
    assert.match(body, /data-placement-adjustment="0\.61,0\.37,1\.24,-14"/);
    assert.match(body, /transform="translate\(549 333\) rotate\(-14\) scale\(1\.24\)"/);
  });
});


await run("placement downloads can read bundled local assets without a mocked image fetcher", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit(
      "client-placement-local-assets",
      input,
      {
        ...generation,
        images: {
          concept: "/assets/hero-concept.png",
          linework: "",
          placement: "/assets/hero-placement.png"
        }
      },
      storePath
    );

    const file = await resolveDownloadFile({
      clientId: "client-placement-local-assets",
      generationId: saved.generation.id,
      type: "placement",
      storePath
    });

    const body = file.body.toString("utf8");

    assert.equal(file.status, 200);
    assert.equal(file.contentType, "image/svg+xml; charset=utf-8");
    assert.match(body, /data:image\/png;base64/);
    assert.match(body, /data:image\/jpeg;base64/);
  });
});


await run("placement downloads compose the saved tattoo over the selected body photo", async () => {
  await withTempStore(async (storePath) => {
    const saved = await consumeGenerationCredit(
      "client-placement-composite",
      { ...input, placement: "Back" },
      generation,
      storePath
    );
    const store = JSON.parse(await readFile(storePath, "utf8"));
    store.generations[0].input.placement = "Back";
    store.generations[0].placementAdjustment = { x: 0.62, y: 0.44, scale: 1.18, rotation: 6 };
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    const fetchedUrls = [];

    const file = await resolveDownloadFile({
      clientId: "client-placement-composite",
      generationId: saved.generation.id,
      type: "placement",
      fetchImage: async (url) => {
        fetchedUrls.push(url);
        return {
          ok: true,
          contentType: url.includes("placement-back") ? "image/jpeg" : "image/webp",
          body: Buffer.from(`original:${url}`)
        };
      },
      storePath
    });

    const body = file.body.toString("utf8");

    assert.equal(file.status, 200);
    assert.deepEqual(fetchedUrls, ["https://example.com/linework.webp", "assets/placement-back.jpg"]);
    assert.match(body, /data-placement-source="back"/);
    assert.match(body, /data:image\/jpeg;base64/);
    assert.match(body, /data:image\/webp;base64/);
    assert.match(body, /transform="translate\(558 396\) rotate\(6\) scale\(1\.18\)"/);
  });
});

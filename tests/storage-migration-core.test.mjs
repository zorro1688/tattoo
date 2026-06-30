import assert from "node:assert/strict";
import {
  buildUserStoragePath,
  migrateStoragePathsToUserPrefix
} from "../storage-migration-core.mjs";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_STORAGE_BUCKET: "inkfirst-designs"
};

await run("buildUserStoragePath keeps the asset extension and uses users prefix", () => {
  assert.equal(
    buildUserStoragePath({
      asset_type: "concept",
      storage_path: "anonymous/anon_123/gen_123/concept.webp",
      generation: {
        owner_user_id: "00000000-0000-4000-8000-000000000001",
        local_generation_id: "gen_123"
      }
    }),
    "users/00000000-0000-4000-8000-000000000001/gen_123/concept.webp"
  );
});

await run("migration copies old objects to users prefix and updates asset rows without deleting old files", async () => {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });

    if (url.includes("/rest/v1/generation_assets?")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([
          {
            id: "asset_legacy",
            asset_type: "concept",
            storage_bucket: "inkfirst-designs",
            storage_path: "anon_123/gen_legacy/concept.webp",
            content_type: "image/webp",
            generations: {
              owner_user_id: "00000000-0000-4000-8000-000000000001",
              local_generation_id: "gen_legacy"
            }
          },
          {
            id: "asset_anonymous",
            asset_type: "linework",
            storage_bucket: "inkfirst-designs",
            storage_path: "anonymous/anon_123/gen_legacy/linework.png",
            content_type: "image/png",
            generations: {
              owner_user_id: "00000000-0000-4000-8000-000000000001",
              local_generation_id: "gen_legacy"
            }
          },
          {
            id: "asset_current",
            asset_type: "placement",
            storage_bucket: "inkfirst-designs",
            storage_path: "users/00000000-0000-4000-8000-000000000001/gen_legacy/placement.svg",
            content_type: "image/svg+xml",
            generations: {
              owner_user_id: "00000000-0000-4000-8000-000000000001",
              local_generation_id: "gen_legacy"
            }
          },
          {
            id: "asset_unowned",
            asset_type: "concept",
            storage_bucket: "inkfirst-designs",
            storage_path: "anonymous/anon_456/gen_unowned/concept.webp",
            content_type: "image/webp",
            generations: {
              owner_user_id: null,
              local_generation_id: "gen_unowned"
            }
          }
        ])
      };
    }

    if (url.includes("/storage/v1/object/") && options.method === "GET") {
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => "image/webp"
        },
        arrayBuffer: async () => Buffer.from("image-bytes")
      };
    }

    return {
      ok: true,
      status: 204,
      text: async () => ""
    };
  };

  const result = await migrateStoragePathsToUserPrefix({ limit: 25 }, env, fetchMock);
  const uploads = calls.filter((call) => call.url.includes("/storage/v1/object/") && call.options.method === "POST");
  const updates = calls.filter((call) => call.url.includes("/rest/v1/generation_assets?id=eq."));
  const deletes = calls.filter((call) => call.options.method === "DELETE");

  assert.equal(result.scanned, 4);
  assert.equal(result.migrated, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.failed, 0);
  assert.equal(uploads.length, 2);
  assert.match(uploads[0].url, /\/storage\/v1\/object\/inkfirst-designs\/users\/00000000-0000-4000-8000-000000000001\/gen_legacy\/concept\.webp$/);
  assert.match(uploads[1].url, /\/storage\/v1\/object\/inkfirst-designs\/users\/00000000-0000-4000-8000-000000000001\/gen_legacy\/linework\.png$/);
  assert.equal(updates.length, 2);
  assert.equal(JSON.parse(updates[0].options.body).storage_path, "users/00000000-0000-4000-8000-000000000001/gen_legacy/concept.webp");
  assert.equal(JSON.parse(updates[1].options.body).storage_path, "users/00000000-0000-4000-8000-000000000001/gen_legacy/linework.png");
  assert.equal(deletes.length, 0);
});

await run("dry run reports candidates without copying or updating", async () => {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([
        {
          id: "asset_legacy",
          asset_type: "concept",
          storage_bucket: "inkfirst-designs",
          storage_path: "anon_123/gen_legacy/concept.webp",
          content_type: "image/webp",
          generations: {
            owner_user_id: "00000000-0000-4000-8000-000000000001",
            local_generation_id: "gen_legacy"
          }
        }
      ])
    };
  };

  const result = await migrateStoragePathsToUserPrefix({ dryRun: true }, env, fetchMock);

  assert.equal(result.candidates, 1);
  assert.equal(result.migrated, 0);
  assert.equal(calls.length, 1);
});

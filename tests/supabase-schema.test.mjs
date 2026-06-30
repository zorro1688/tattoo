import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

async function run(name, testBody) {
  try {
    await testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run("Supabase schema defines the core InkFirst production tables", async () => {
  const sql = await readFile("supabase/schema.sql", "utf8");

  for (const table of [
    "profiles",
    "anonymous_clients",
    "user_entitlements",
    "generations",
    "generation_assets",
    "credit_events",
    "billing_events"
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  }

  assert.match(sql, /create type public\.generation_asset_type/);
  assert.match(sql, /create type public\.billing_provider/);
});

await run("Supabase schema enables RLS on user and payment data", async () => {
  const sql = await readFile("supabase/schema.sql", "utf8");

  for (const table of [
    "profiles",
    "anonymous_clients",
    "user_entitlements",
    "generations",
    "generation_assets",
    "credit_events",
    "billing_events"
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
  }

  assert.match(sql, /owner_user_id = auth\.uid\(\)/);
  assert.match(sql, /user_id = auth\.uid\(\)/);
});

await run("Supabase schema prepares private design storage", async () => {
  const sql = await readFile("supabase/schema.sql", "utf8");

  assert.match(sql, /insert into storage\.buckets/);
  assert.match(sql, /inkfirst-designs/);
  assert.match(sql, /bucket_id = 'inkfirst-designs'/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[1\] = 'users'/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/);
  assert.match(sql, /grant select, insert, update, delete on table public\.generations to service_role;/);
});

await run("Supabase environment and setup docs are present", async () => {
  const env = await readFile(".env.example", "utf8");
  const docs = await readFile("docs/supabase.md", "utf8");

  assert.match(env, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(env, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
  assert.match(env, /SUPABASE_SERVICE_ROLE_KEY=/);
  assert.match(env, /SUPABASE_STORAGE_BUCKET=inkfirst-designs/);
  assert.match(docs, /Supabase setup/);
  assert.match(docs, /auth\.users/);
  assert.match(docs, /service role/);
});

await run("Supabase migration contains the reviewed schema", async () => {
  const migrationFiles = (await readdir("supabase/migrations"))
    .filter((file) => file.endsWith("_initial_inkfirst_schema.sql"));

  assert.equal(migrationFiles.length, 1);

  const migration = await readFile(`supabase/migrations/${migrationFiles[0]}`, "utf8");
  const schema = await readFile("supabase/schema.sql", "utf8");

  assert.match(migration, /create table if not exists public\.generations/);
  assert.match(schema, /local_generation_id text/);
  assert.match(migration, /alter table public\.generations enable row level security;/);
  assert.match(migration, /insert into storage\.buckets/);
});

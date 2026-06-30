import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const requiredTables = [
  "profiles",
  "anonymous_clients",
  "user_entitlements",
  "generations",
  "generation_assets",
  "credit_events",
  "billing_events"
];

function loadLocalEnv() {
  for (const file of [".env.production.local", ".env.local"]) {
    const envPath = join(process.cwd(), file);

    if (!existsSync(envPath)) {
      continue;
    }

    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      process.env[key] ??= value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing.`);
  }

  return value;
}

function createClientConfig() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "inkfirst-designs";

  if (!url.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be the production https Supabase URL.");
  }

  return { url, key, bucket };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function authHeaders(config, extra = {}) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    ...extra
  };
}

async function assertOk(label, response) {
  if (response.ok) {
    return readJson(response);
  }

  const body = await readJson(response);
  const message = typeof body === "string" ? body : body?.message || body?.hint || JSON.stringify(body);
  throw new Error(`${label} failed with ${response.status}: ${message}`);
}

async function verifyRestTables(config) {
  for (const table of requiredTables) {
    const url = `${config.url}/rest/v1/${table}?select=*&limit=1`;
    const response = await fetch(url, {
      headers: authHeaders(config)
    });

    await assertOk(`Table ${table}`, response);
    console.log(`OK table ${table}`);
  }
}

async function verifyStorage(config) {
  const bucketResponse = await fetch(`${config.url}/storage/v1/bucket/${config.bucket}`, {
    headers: authHeaders(config)
  });
  await assertOk(`Storage bucket ${config.bucket}`, bucketResponse);
  console.log(`OK bucket ${config.bucket}`);

  const objectPath = `health-check/${randomUUID()}.png`;
  const uploadResponse = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${objectPath}`, {
    method: "POST",
    headers: authHeaders(config, {
      "Content-Type": "image/png",
      "x-upsert": "true"
    }),
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64")
  });
  await assertOk("Storage health-check upload", uploadResponse);

  const readResponse = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${objectPath}`, {
    headers: authHeaders(config)
  });
  await assertOk("Storage health-check read", readResponse);
  console.log(`OK storage object ${objectPath}`);
}

loadLocalEnv();

try {
  const config = createClientConfig();
  await verifyRestTables(config);
  await verifyStorage(config);
  console.log("Supabase cloud verification passed.");
} catch (error) {
  console.error("Supabase cloud verification failed:");
  console.error(`- ${error.message}`);
  process.exitCode = 1;
}

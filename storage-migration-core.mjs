import { extname } from "node:path";

const defaultBucket = "inkfirst-designs";
const contentTypeExtensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg"
};

function getSupabaseConfig(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return {
    key,
    restUrl: `${url.replace(/\/$/, "")}/rest/v1`,
    storageUrl: `${url.replace(/\/$/, "")}/storage/v1/object`,
    bucket: env.SUPABASE_STORAGE_BUCKET || defaultBucket
  };
}

function encodedStoragePath(storagePath) {
  return storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function storageObjectUrl(config, bucket, storagePath) {
  return `${config.storageUrl}/${bucket}/${encodedStoragePath(storagePath)}`;
}

function generationFromAsset(asset) {
  const generation = asset.generations ?? asset.generation;

  return Array.isArray(generation) ? generation[0] : generation;
}

function extensionForAsset(asset) {
  const fromPath = extname(asset.storage_path ?? "").replace(".", "").toLowerCase();

  if (fromPath) {
    return fromPath;
  }

  return contentTypeExtensions[String(asset.content_type ?? "").split(";")[0].toLowerCase()] ?? "png";
}

export function buildUserStoragePath(asset) {
  const generation = generationFromAsset(asset);
  const userId = generation?.owner_user_id;
  const localGenerationId = generation?.local_generation_id;

  if (!userId || !localGenerationId || !asset.asset_type) {
    return "";
  }

  return `users/${userId}/${localGenerationId}/${asset.asset_type}.${extensionForAsset(asset)}`;
}

function shouldSkipAsset(asset, targetPath) {
  const generation = generationFromAsset(asset);

  if (!asset.id || !asset.storage_path || !generation?.owner_user_id || !generation?.local_generation_id) {
    return "missing_owner_or_path";
  }

  if (!targetPath) {
    return "missing_target_path";
  }

  if (asset.storage_path === targetPath) {
    return "already_migrated";
  }

  return "";
}

async function requestSupabase(config, path, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.restUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(body?.message || body?.hint || text || `Supabase request failed with ${response.status}`);
  }

  return body;
}

async function fetchAssets(config, limit, fetchImpl) {
  const query = new URLSearchParams({
    select: "id,asset_type,storage_bucket,storage_path,content_type,generations!inner(local_generation_id,owner_user_id)",
    is_watermarked: "eq.false",
    "generations.owner_user_id": "not.is.null",
    limit: String(limit)
  });

  return requestSupabase(config, `/generation_assets?${query}`, { method: "GET" }, fetchImpl);
}

async function downloadStorageObject(config, bucket, storagePath, fetchImpl) {
  const response = await fetchImpl(storageObjectUrl(config, bucket, storagePath), {
    method: "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Storage download failed with ${response.status}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers?.get?.("content-type") ?? "application/octet-stream"
  };
}

async function uploadStorageObject(config, bucket, storagePath, object, fetchImpl) {
  const response = await fetchImpl(storageObjectUrl(config, bucket, storagePath), {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": object.contentType,
      "x-upsert": "true"
    },
    body: object.body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Storage upload failed with ${response.status}`);
  }
}

async function updateAssetPath(config, assetId, targetPath, fetchImpl) {
  await requestSupabase(config, `/generation_assets?id=eq.${encodeURIComponent(assetId)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      storage_path: targetPath
    })
  }, fetchImpl);
}

export async function migrateStoragePathsToUserPrefix(options = {}, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);

  if (!config) {
    return { skipped: true, reason: "missing_supabase_env" };
  }

  const limit = Math.max(1, Math.min(Number(options.limit ?? 100), 1000));
  const dryRun = Boolean(options.dryRun);
  const assets = await fetchAssets(config, limit, fetchImpl);
  const summary = {
    skipped: 0,
    scanned: assets.length,
    candidates: 0,
    migrated: 0,
    failed: 0,
    failures: [],
    dryRun
  };

  for (const asset of assets) {
    const targetPath = buildUserStoragePath(asset);
    const skipReason = shouldSkipAsset(asset, targetPath);

    if (skipReason) {
      summary.skipped += 1;
      continue;
    }

    summary.candidates += 1;

    if (dryRun) {
      continue;
    }

    try {
      const bucket = asset.storage_bucket || config.bucket;
      const object = await downloadStorageObject(config, bucket, asset.storage_path, fetchImpl);
      await uploadStorageObject(config, bucket, targetPath, object, fetchImpl);
      await updateAssetPath(config, asset.id, targetPath, fetchImpl);
      summary.migrated += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        assetId: asset.id,
        storagePath: asset.storage_path,
        targetPath,
        error: error.message
      });
    }
  }

  return summary;
}

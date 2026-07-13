import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { billingStatusFromEventType, mergeBillingHistory } from "./billing-history-core.mjs";

const generationStatuses = new Set(["queued", "processing", "succeeded", "failed", "mock"]);
const billingProviders = new Set(["creem", "stripe", "manual"]);
const billingPlans = new Set(["free", "creator-pack", "pro-monthly", "pro-yearly"]);
const assetTypes = ["concept", "linework", "placement"];

const contentTypeByExtension = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const extensionByContentType = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg"
};

function isUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeOwner(owner) {
  if (typeof owner === "object" && owner?.userId) {
    return { userId: owner.userId, storageId: owner.userId };
  }

  const id = typeof owner === "object" ? owner?.clientId : owner;

  if (isUuid(id)) {
    return { userId: id, storageId: id };
  }

  return { clientId: id, storageId: id };
}

function ownerGenerationPayload(owner) {
  const normalized = normalizeOwner(owner);

  return normalized.userId
    ? { owner_user_id: normalized.userId }
    : { anonymous_client_id: normalized.clientId };
}

function ownerCreditPayload(owner) {
  const normalized = normalizeOwner(owner);

  return normalized.userId
    ? { owner_user_id: normalized.userId }
    : { anonymous_client_id: normalized.clientId };
}

function ownerQueryParam(owner) {
  const normalized = normalizeOwner(owner);

  return normalized.userId
    ? { key: "owner_user_id", value: normalized.userId }
    : { key: "anonymous_client_id", value: normalized.clientId };
}

function getSupabaseConfig(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return {
    projectUrl: url.replace(/\/$/, ""),
    restUrl: `${url.replace(/\/$/, "")}/rest/v1`,
    key,
    bucket: env.SUPABASE_STORAGE_BUCKET || "inkfirst-designs"
  };
}

function toSupabaseStatus(status) {
  return generationStatuses.has(status) ? status : "processing";
}

function toBillingProvider(provider) {
  return billingProviders.has(provider) ? provider : "manual";
}

function toBillingPlan(plan) {
  return billingPlans.has(plan) ? plan : "free";
}

function mapSupabaseGeneration(row) {
  if (!row) {
    return null;
  }

  const assets = Array.isArray(row.generation_assets) ? row.generation_assets : [];
  const mappedAssets = assets.reduce((mapped, asset) => {
    mapped[asset.asset_type] = {
      storageBucket: asset.storage_bucket,
      storagePath: asset.storage_path,
      sourceUrl: asset.source_url,
      contentType: asset.content_type,
      isWatermarked: asset.is_watermarked
    };
    return mapped;
  }, {});
  const images = assets.reduce((mapped, asset) => {
    mapped[asset.asset_type] = asset.source_url || asset.storage_path;
    return mapped;
  }, {});

  return {
    id: row.local_generation_id || row.id,
    providerGenerationId: row.provider_generation_id,
    provider: row.provider,
    model: row.model,
    status: row.status,
    prompt: row.prompt,
    placementNote: row.placement_note,
    placementAdjustment: row.placement_adjustment ?? null,
    images,
    assets: mappedAssets,
    input: {
      idea: row.input_idea,
      style: row.input_style,
      placement: row.input_placement,
      size: row.input_size,
      complexity: row.input_complexity
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSupabaseClient(row) {
  if (!row) {
    return null;
  }

  return {
    freeRemaining: row.free_credits_remaining ?? 0,
    paidRemaining: row.paid_credits_remaining ?? 0,
    totalRemaining: (row.free_credits_remaining ?? 0) + (row.paid_credits_remaining ?? 0),
    highResolution: Boolean(row.high_resolution_downloads_unlocked)
  };
}

function toDownloadAccess(quota) {
  const highResolution = Boolean(quota?.highResolution || quota?.paidRemaining > 0);

  return {
    highResolution,
    watermarked: !highResolution,
    message: highResolution
      ? "High-resolution downloads are unlocked"
      : "Upgrade to download high-resolution files"
  };
}

async function requestSupabase(path, options = {}, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);

  if (!config) {
    return { skipped: true };
  }

  const response = await fetchImpl(`${config.restUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(body?.message || body?.hint || text || `Supabase request failed with ${response.status}`);
  }

  return { body, config };
}

function storageObjectUrl(config, bucket, storagePath) {
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${config.restUrl.replace("/rest/v1", "")}/storage/v1/object/${bucket}/${encodedPath}`;
}

export function storageImageAppUrl(storagePath) {
  return `/api/storage-image?path=${encodeURIComponent(storagePath)}`;
}

export function storagePathFromAppImageUrl(sourceUrl = "") {
  if (!sourceUrl || typeof sourceUrl !== "string") {
    return null;
  }

  try {
    const parsed = new URL(sourceUrl, "http://inkfirst.local");

    if (parsed.pathname !== "/api/storage-image") {
      return null;
    }

    return parsed.searchParams.get("path");
  } catch {
    return null;
  }
}

export async function createSignedConceptUrlForLinework(owner, sourceUrl, env = process.env, fetchImpl = fetch) {
  if (/^https?:\/\//i.test(String(sourceUrl ?? ""))) {
    return sourceUrl;
  }

  const storagePath = storagePathFromAppImageUrl(sourceUrl);

  if (!storagePath) {
    return sourceUrl;
  }

  const config = getSupabaseConfig(env);

  if (!config) {
    throw new Error("Supabase storage is not configured for linework generation.");
  }

  const allowedPrefix = `${storagePrefixForOwner(owner)}/`;

  if (!storagePath.startsWith(allowedPrefix)) {
    throw new Error("The saved concept image does not belong to this account.");
  }

  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetchImpl(
    `${config.projectUrl}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ expiresIn: 300 })
    }
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body?.message || body?.error || text || "Could not prepare the saved concept image for linework generation.");
  }

  const signedPath = body.signedURL || body.signedUrl;

  if (!signedPath) {
    throw new Error("Supabase did not return a signed concept image URL.");
  }

  return /^https?:\/\//i.test(signedPath)
    ? signedPath
    : `${config.projectUrl}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;
}
async function fetchStorageObjectByPath(config, bucket, storagePath, fetchImpl = fetch) {
  const response = await fetchImpl(storageObjectUrl(config, bucket, storagePath), {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers?.get?.("content-type") ?? "application/octet-stream",
    body: Buffer.from(await response.arrayBuffer())
  };
}

function storagePrefixForOwner(owner) {
  const normalized = normalizeOwner(owner);

  return normalized.userId
    ? `users/${normalized.userId}`
    : `anonymous/${normalized.clientId}`;
}

function extensionFromSource(sourceUrl, contentType) {
  const contentExtension = extensionByContentType[contentType?.split(";")[0]?.toLowerCase()];

  if (contentExtension) {
    return contentExtension;
  }

  const extension = extname(sourceUrl.split("?")[0]).replace(".", "").toLowerCase();

  return extension || "png";
}

function readDataUrl(sourceUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(sourceUrl);

  if (!match) {
    return null;
  }

  const contentType = match[1] || "application/octet-stream";
  const body = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");

  return { body, contentType };
}

async function readImageSource(sourceUrl, fetchImpl = fetch, config = null) {
  if (!sourceUrl) {
    throw new Error("Image source is required.");
  }

  if (sourceUrl.startsWith("data:")) {
    const dataImage = readDataUrl(sourceUrl);

    if (!dataImage) {
      throw new Error("Invalid image data URL.");
    }

    return dataImage;
  }

  const storagePath = storagePathFromAppImageUrl(sourceUrl);

  if (storagePath) {
    if (!config) {
      throw new Error("Supabase storage config is required to read private image sources.");
    }

    const stored = await fetchStorageObjectByPath(config, config.bucket, storagePath, fetchImpl);

    if (!stored.ok) {
      throw new Error(`Could not fetch Supabase storage image: ${storagePath}`);
    }

    return { body: stored.body, contentType: stored.contentType };
  }

  if (sourceUrl.startsWith("/") || !/^https?:\/\//i.test(sourceUrl)) {
    const localPath = sourceUrl.startsWith("/") ? sourceUrl.slice(1) : sourceUrl;
    const filePath = join(process.cwd(), localPath);
    const body = await readFile(filePath);
    const contentType = contentTypeByExtension[extname(filePath).toLowerCase()] ?? "application/octet-stream";

    return { body, contentType };
  }

  const response = await fetchImpl(sourceUrl);

  if (!response.ok) {
    throw new Error(`Could not fetch image source: ${sourceUrl}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers?.get?.("content-type") ?? "application/octet-stream"
  };
}

async function uploadImageBodyToStorage({ storagePath, image, config, fetchImpl }) {
  const response = await fetchImpl(storageObjectUrl(config, config.bucket, storagePath), {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": image.contentType,
      "x-upsert": "true"
    },
    body: image.body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase storage upload failed with ${response.status}`);
  }

  return {
    storagePath,
    contentType: image.contentType
  };
}

async function normalizeConceptImageForStorage(image) {
  try {
    const { normalizeConceptImage } = await import("./image-postprocess.mjs");
    return await normalizeConceptImage(image);
  } catch (error) {
    console.warn(`Concept image normalization skipped: ${error.message}`);
    return { ...image, normalized: false };
  }
}

async function uploadImageToStorage({ owner, localGenerationId, assetType, sourceUrl, config, fetchImpl }) {
  const image = await readImageSource(sourceUrl, fetchImpl, config);
  const storagePath = storagePathFromAppImageUrl(sourceUrl);
  const extension = extensionFromSource(storagePath || sourceUrl, image.contentType);
  const targetPath = `${storagePrefixForOwner(owner)}/${localGenerationId}/${assetType}.${extension}`;

  return uploadImageBodyToStorage({
    storagePath: targetPath,
    image,
    config,
    fetchImpl
  });
}

export async function prepareConceptCandidatesForSupabase(clientId, savedGeneration, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);

  if (!config) {
    return { skipped: true };
  }

  const candidates = [
    ...(savedGeneration.conceptCandidates ?? []),
    savedGeneration.images?.concept
  ].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)].slice(0, 4);

  if (!uniqueCandidates.length) {
    return { skipped: true, reason: "no_concept_candidates" };
  }

  const processedUrls = [];

  for (const [index, sourceUrl] of uniqueCandidates.entries()) {
    const image = await readImageSource(sourceUrl, fetchImpl, config);
    const normalized = await normalizeConceptImageForStorage(image);
    const finalImage = normalized?.body ? normalized : image;
    const extension = extensionFromSource(sourceUrl, finalImage.contentType);
    const storagePath = `${storagePrefixForOwner(clientId)}/${savedGeneration.id}/concept-candidates/${index + 1}.${extension}`;

    await uploadImageBodyToStorage({
      storagePath,
      image: finalImage,
      config,
      fetchImpl
    });

    processedUrls.push(storageImageAppUrl(storagePath));
  }

  savedGeneration.conceptCandidates = processedUrls;
  savedGeneration.images = {
    ...savedGeneration.images,
    concept: processedUrls[0]
  };

  return { skipped: false, conceptCandidates: processedUrls };
}

async function upsertOwnerCredits(owner, quota, env, fetchImpl) {
  const normalized = normalizeOwner(owner);

  if (normalized.userId) {
    await requestSupabase("/user_entitlements?on_conflict=user_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        user_id: normalized.userId,
        free_credits_remaining: quota.freeRemaining,
        paid_credits_remaining: quota.paidRemaining,
        high_resolution_downloads_unlocked: Boolean(quota.highResolution),
        active_plan: quota.highResolution || quota.paidRemaining > 0 ? "creator-pack" : "free"
      })
    }, env, fetchImpl);
    return;
  }

  await requestSupabase("/anonymous_clients?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      id: normalized.clientId,
      free_credits_remaining: quota.freeRemaining,
      paid_credits_remaining: quota.paidRemaining,
      high_resolution_downloads_unlocked: Boolean(quota.highResolution)
    })
  }, env, fetchImpl);
}

async function findSupabaseGeneration(localGenerationId, owner, env, fetchImpl) {
  const ownerFilter = ownerQueryParam(owner);
  const query = new URLSearchParams({
    select: "id",
    local_generation_id: `eq.${localGenerationId}`,
    [ownerFilter.key]: `eq.${ownerFilter.value}`,
    limit: "1"
  });
  const { body } = await requestSupabase(`/generations?${query}`, { method: "GET" }, env, fetchImpl);

  return body?.[0] ?? null;
}

async function insertAssets(generationId, images = {}, config, env, fetchImpl, options = {}) {
  const assets = [];

  for (const assetType of assetTypes) {
    const sourceUrl = images[assetType];

    if (!sourceUrl) {
      continue;
    }

    const uploaded = await uploadImageToStorage({
      owner: options.owner,
      localGenerationId: options.localGenerationId,
      assetType,
      sourceUrl,
      config,
      fetchImpl
    });

    assets.push({
      generation_id: generationId,
      asset_type: assetType,
      storage_bucket: config.bucket,
      storage_path: uploaded.storagePath,
      source_url: sourceUrl,
      content_type: uploaded.contentType,
      is_watermarked: false
    });
  }

  if (!assets.length) {
    return;
  }

  await requestSupabase("/generation_assets?on_conflict=generation_id,asset_type,is_watermarked", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(assets)
  }, env, fetchImpl);
}

export async function persistGenerationToSupabase(clientId, savedGeneration, quota, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);
  const owner = normalizeOwner(clientId);

  if (!config) {
    return { skipped: true };
  }

  await upsertOwnerCredits(clientId, quota, env, fetchImpl);

  const payload = {
    local_generation_id: savedGeneration.id,
    ...ownerGenerationPayload(clientId),
    provider_generation_id: savedGeneration.providerGenerationId,
    provider: savedGeneration.provider,
    model: savedGeneration.model,
    status: toSupabaseStatus(savedGeneration.status),
    prompt: savedGeneration.prompt,
    placement_note: savedGeneration.placementNote,
    placement_adjustment: savedGeneration.placementAdjustment ?? null,
    input_idea: savedGeneration.input.idea,
    input_style: savedGeneration.input.style,
    input_placement: savedGeneration.input.placement,
    input_size: savedGeneration.input.size,
    input_complexity: savedGeneration.input.complexity,
    created_at: savedGeneration.createdAt,
    updated_at: savedGeneration.updatedAt ?? savedGeneration.createdAt
  };

  const { body } = await requestSupabase("/generations?select=id", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  }, env, fetchImpl);

  const supabaseGeneration = body?.[0] ?? await findSupabaseGeneration(savedGeneration.id, clientId, env, fetchImpl);

  if (supabaseGeneration?.id) {
    await insertAssets(supabaseGeneration.id, savedGeneration.images, config, env, fetchImpl, {
      owner: clientId,
      localGenerationId: savedGeneration.id
    });
  }

  return { skipped: false, generationId: supabaseGeneration?.id };
}

export async function persistPlacementAdjustmentToSupabase(clientId, generationId, placementAdjustment, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);
  const ownerFilter = ownerQueryParam(clientId);

  if (!config) {
    return { skipped: true };
  }

  await requestSupabase(
    `/generations?local_generation_id=eq.${encodeURIComponent(generationId)}&${ownerFilter.key}=eq.${encodeURIComponent(ownerFilter.value)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        placement_adjustment: placementAdjustment,
        updated_at: new Date().toISOString()
      })
    },
    env,
    fetchImpl
  );

  return { skipped: false };
}


export async function persistConceptSelectionToSupabase(clientId, generation, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);

  if (!config) {
    return { skipped: true };
  }

  const supabaseGeneration = await findSupabaseGeneration(generation.id, clientId, env, fetchImpl);

  if (!supabaseGeneration?.id) {
    return { skipped: true, reason: "generation_not_found" };
  }

  const selectedConceptUrl = generation.images?.concept;
  const selectedStoragePath = storagePathFromAppImageUrl(selectedConceptUrl);
  const expectedPrefix = `${storagePrefixForOwner(clientId)}/${generation.id}/concept-candidates/`;

  if (!selectedStoragePath || !selectedStoragePath.startsWith(expectedPrefix)) { throw new Error("Selected concept does not belong to this saved generation."); }

  const contentType = contentTypeByExtension[extname(selectedStoragePath).toLowerCase()] ?? "image/png";
  await requestSupabase("/generation_assets?on_conflict=generation_id,asset_type,is_watermarked", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ generation_id: supabaseGeneration.id, asset_type: "concept", storage_bucket: config.bucket, storage_path: selectedStoragePath, source_url: selectedConceptUrl, content_type: contentType, is_watermarked: false }]) }, env, fetchImpl);

  await requestSupabase(`/generations?local_generation_id=eq.${encodeURIComponent(generation.id)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      updated_at: generation.updatedAt
    })
  }, env, fetchImpl);

  return { skipped: false };
}

export async function safePersistConceptSelectionToSupabase(clientId, generation, env = process.env, fetchImpl = fetch) {
  try {
    return await persistConceptSelectionToSupabase(clientId, generation, env, fetchImpl);
  } catch (error) {
    return { skipped: true, error };
  }
}

export async function persistLineworkToSupabase(clientId, generation, quota, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);
  const owner = normalizeOwner(clientId);

  if (!config) {
    return { skipped: true };
  }

  const supabaseGeneration = await findSupabaseGeneration(generation.id, clientId, env, fetchImpl);

  if (!supabaseGeneration?.id) {
    throw new Error("Saved generation was not found in Supabase.");
  }

  await requestSupabase(`/generations?local_generation_id=eq.${encodeURIComponent(generation.id)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      updated_at: generation.updatedAt,
      status: toSupabaseStatus(generation.lineworkStatus ?? generation.status)
    })
  }, env, fetchImpl);

  await insertAssets(supabaseGeneration.id, { linework: generation.images?.linework }, config, env, fetchImpl, {
    owner: clientId,
    localGenerationId: generation.id
  });

  const verified = await getGenerationFromSupabase(clientId, generation.id, env, fetchImpl);

  if (!verified.generation?.images?.linework) {
    throw new Error("Linework could not be verified after saving.");
  }

  await upsertOwnerCredits(clientId, quota, env, fetchImpl);

  return {
    skipped: false,
    generationId: supabaseGeneration.id,
    generation: verified.generation
  };
}

export async function persistCreditEventToSupabase(clientId, credits, metadata, quota, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);

  if (!config) {
    return { skipped: true };
  }

  await upsertOwnerCredits(clientId, quota, env, fetchImpl);

  await requestSupabase("/credit_events", {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      ...ownerCreditPayload(clientId),
      source: toBillingProvider(metadata.source),
      external_event_id: metadata.externalEventId || null,
      plan: toBillingPlan(metadata.plan),
      credits_delta: credits,
      high_resolution_unlocked: true,
      metadata
    })
  }, env, fetchImpl);

  return { skipped: false };
}

export async function persistBillingEventToSupabase(event, env = process.env, fetchImpl = fetch) {
  if (!getSupabaseConfig(env)) {
    return { skipped: true };
  }

  if (!event?.eventId) {
    throw new Error("Billing event eventId is required");
  }

  const immutableFields = {
    provider: toBillingProvider(event.source ?? "creem"),
    event_type: event.eventType,
    ...ownerCreditPayload(event.clientId),
    plan: toBillingPlan(event.plan),
    credits: event.credits
  };
  const insertResult = await requestSupabase("/billing_events?on_conflict=id&select=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=ignore-duplicates,return=representation"
    },
    body: JSON.stringify({
      id: event.eventId,
      ...immutableFields,
      processed_at: new Date(event.processedAt ?? Date.now()).toISOString(),
      payload: event.raw
    })
  }, env, fetchImpl);

  if (insertResult.body?.length) {
    return { skipped: false };
  }

  const query = new URLSearchParams({
    select: "provider,event_type,owner_user_id,anonymous_client_id,plan,credits",
    id: `eq.${event.eventId}`,
    limit: "1"
  });
  const existingResult = await requestSupabase(
    `/billing_events?${query}`,
    { method: "GET" },
    env,
    fetchImpl
  );
  const existing = existingResult.body?.[0];
  const incomingOwner = normalizeOwner(event.clientId);
  const hasConflict =
    !existing ||
    existing.provider !== immutableFields.provider ||
    existing.event_type !== immutableFields.event_type ||
    (existing.owner_user_id ?? null) !== (incomingOwner.userId ?? null) ||
    (existing.anonymous_client_id ?? null) !== (incomingOwner.clientId ?? null) ||
    existing.plan !== immutableFields.plan ||
    existing.credits !== immutableFields.credits;

  if (hasConflict) {
    throw new Error(`Billing event conflict for ${event.eventId}: immutable fields differ`);
  }

  return { skipped: false, idempotent: true };
}
export async function listBillingHistoryFromSupabase(ownerId, options = {}, env = process.env, fetchImpl = fetch) {
  if (!getSupabaseConfig(env)) {
    return { skipped: true, events: [], latestPaidPlan: null };
  }

  const numericLimit = Number(options.limit ?? 20);
  const limit = Math.min(50, Math.max(1, Number.isFinite(numericLimit) ? Math.trunc(numericLimit) : 20));
  const ownerFilter = ownerQueryParam(ownerId);
  const billingQuery = new URLSearchParams({
    select: "id,provider,event_type,plan,credits,processed_at,created_at",
    [ownerFilter.key]: `eq.${ownerFilter.value}`,
    order: "processed_at.desc.nullslast,created_at.desc",
    limit: String(limit)
  });
  const creditQuery = new URLSearchParams({
    select: "id,source,external_event_id,plan,credits_delta,created_at",
    [ownerFilter.key]: `eq.${ownerFilter.value}`,
    order: "created_at.desc",
    limit: String(limit)
  });
  const latestPaidCreditPlanQuery = new URLSearchParams({
    select: "plan,created_at",
    [ownerFilter.key]: `eq.${ownerFilter.value}`,
    order: "created_at.desc",
    limit: "1"
  });
  const latestPaidBillingPlanQuery = new URLSearchParams({
    select: "plan,event_type,processed_at,created_at",
    [ownerFilter.key]: `eq.${ownerFilter.value}`,
    or: "(event_type.ilike.*completed*,event_type.ilike.*succeeded*,event_type.eq.invoice.paid,event_type.eq.payment.paid)",
    order: "processed_at.desc.nullslast,created_at.desc",
    limit: "20"
  });
  const [billingResult, creditResult, latestPaidCreditPlanResult, latestPaidBillingPlanResult] = await Promise.all([
    requestSupabase(`/billing_events?${billingQuery}`, { method: "GET" }, env, fetchImpl),
    requestSupabase(`/credit_events?${creditQuery}`, { method: "GET" }, env, fetchImpl),
    requestSupabase(`/credit_events?${latestPaidCreditPlanQuery}`, { method: "GET" }, env, fetchImpl),
    requestSupabase(`/billing_events?${latestPaidBillingPlanQuery}`, { method: "GET" }, env, fetchImpl)
  ]);
  const billingRows = (billingResult.body ?? []).map((row) => ({
    ...row,
    occurred_at: row.processed_at ?? row.created_at
  }));

  const latestCreditPlan = latestPaidCreditPlanResult.body?.[0]
    ? {
        plan: latestPaidCreditPlanResult.body[0].plan,
        occurredAt: latestPaidCreditPlanResult.body[0].created_at
      }
    : null;
  const latestBillingPlan = (latestPaidBillingPlanResult.body ?? [])
    .map((row) => ({
      plan: row.plan,
      status: billingStatusFromEventType(row.event_type),
      occurredAt: row.processed_at ?? row.created_at
    }))
    .find((row) => row.status === "paid" && row.plan);
  const latestPaidPlan = [latestCreditPlan, latestBillingPlan]
    .filter(Boolean)
    .sort((left, right) => (Date.parse(right.occurredAt) || 0) - (Date.parse(left.occurredAt) || 0))[0]?.plan ?? null;

  return {
    skipped: false,
    events: mergeBillingHistory(billingRows, creditResult.body ?? [], limit),
    latestPaidPlan
  };
}

export async function listGenerationsFromSupabase(clientId, options = {}, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);
  const ownerFilter = ownerQueryParam(clientId);

  if (!config) {
    return { skipped: true, generations: [] };
  }

  const limit = Math.max(1, Math.min(Number(options.limit ?? 6), 24));
  const query = new URLSearchParams({
    select: "*,generation_assets(*)",
    [ownerFilter.key]: `eq.${ownerFilter.value}`,
    order: "created_at.desc",
    limit: String(limit)
  });
  const { body } = await requestSupabase(`/generations?${query}`, { method: "GET" }, env, fetchImpl);

  return {
    skipped: false,
    generations: (body ?? []).map(mapSupabaseGeneration).filter(Boolean)
  };
}

export async function getGenerationFromSupabase(clientId, generationId, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);
  const ownerFilter = ownerQueryParam(clientId);

  if (!config) {
    return { skipped: true, generation: null };
  }

  const query = new URLSearchParams({
    select: "*,generation_assets(*)",
    local_generation_id: `eq.${generationId}`,
    [ownerFilter.key]: `eq.${ownerFilter.value}`,
    limit: "1"
  });
  const { body } = await requestSupabase(`/generations?${query}`, { method: "GET" }, env, fetchImpl);

  return {
    skipped: false,
    generation: mapSupabaseGeneration(body?.[0])
  };
}

export async function getQuotaFromSupabase(clientId, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);
  const owner = normalizeOwner(clientId);

  if (!config) {
    return { skipped: true, quota: null };
  }

  const query = new URLSearchParams({
    select: "free_credits_remaining,paid_credits_remaining,high_resolution_downloads_unlocked",
    [owner.userId ? "user_id" : "id"]: `eq.${owner.userId ?? owner.clientId}`,
    limit: "1"
  });
  const table = owner.userId ? "user_entitlements" : "anonymous_clients";
  const { body } = await requestSupabase(`/${table}?${query}`, { method: "GET" }, env, fetchImpl);

  return {
    skipped: false,
    quota: mapSupabaseClient(body?.[0])
  };
}

export async function getDownloadAccessFromSupabase(clientId, env = process.env, fetchImpl = fetch) {
  const result = await getQuotaFromSupabase(clientId, env, fetchImpl);

  return {
    skipped: result.skipped,
    downloadAccess: result.quota ? toDownloadAccess(result.quota) : null
  };
}

export async function fetchStorageObjectFromSupabase(asset, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);
  const storagePath = asset?.storagePath || asset?.storage_path;
  const bucket = asset?.storageBucket || asset?.storage_bucket || config?.bucket;

  if (!config || !storagePath || !bucket) {
    return null;
  }

  const result = await fetchStorageObjectByPath(config, bucket, storagePath, fetchImpl);

  return {
    ...result,
    contentType: result.contentType ?? asset.contentType ?? "application/octet-stream"
  };
}

export async function fetchOwnedStorageImage(clientId, storagePath, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);

  if (!config || !storagePath) {
    return null;
  }

  const allowedPrefix = `${storagePrefixForOwner(clientId)}/`;

  if (!storagePath.startsWith(allowedPrefix)) {
    return null;
  }

  return fetchStorageObjectByPath(config, config.bucket, storagePath, fetchImpl);
}

async function getAnonymousClientFromSupabase(clientId, env, fetchImpl) {
  const query = new URLSearchParams({
    select: "free_credits_remaining,paid_credits_remaining,high_resolution_downloads_unlocked",
    id: `eq.${clientId}`,
    limit: "1"
  });
  const { body } = await requestSupabase(`/anonymous_clients?${query}`, { method: "GET" }, env, fetchImpl);

  return body?.[0] ?? null;
}

async function getUserEntitlementFromSupabase(userId, env, fetchImpl) {
  const query = new URLSearchParams({
    select: "free_credits_remaining,paid_credits_remaining,high_resolution_downloads_unlocked",
    user_id: `eq.${userId}`,
    limit: "1"
  });
  const { body } = await requestSupabase(`/user_entitlements?${query}`, { method: "GET" }, env, fetchImpl);

  return body?.[0] ?? null;
}

export async function mergeAnonymousClientIntoUser(clientId, user, env = process.env, fetchImpl = fetch) {
  const config = getSupabaseConfig(env);

  if (!config || !clientId || !user?.id) {
    return { skipped: true, merged: false };
  }

  const anonymousClient = await getAnonymousClientFromSupabase(clientId, env, fetchImpl);
  const existingEntitlement = await getUserEntitlementFromSupabase(user.id, env, fetchImpl);

  await requestSupabase("/profiles?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      id: user.id,
      email: user.email ?? null
    })
  }, env, fetchImpl);

  const freeCredits = existingEntitlement
    ? Math.max(existingEntitlement.free_credits_remaining ?? 0, anonymousClient?.free_credits_remaining ?? 0)
    : anonymousClient?.free_credits_remaining ?? 3;
  const paidCredits =
    (existingEntitlement?.paid_credits_remaining ?? 0) + (anonymousClient?.paid_credits_remaining ?? 0);
  const highResolution = Boolean(
    existingEntitlement?.high_resolution_downloads_unlocked ||
      anonymousClient?.high_resolution_downloads_unlocked ||
      paidCredits > 0
  );

  await requestSupabase("/user_entitlements?on_conflict=user_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      user_id: user.id,
      free_credits_remaining: freeCredits,
      paid_credits_remaining: paidCredits,
      high_resolution_downloads_unlocked: highResolution,
      active_plan: highResolution ? "creator-pack" : "free"
    })
  }, env, fetchImpl);

  await requestSupabase(`/generations?anonymous_client_id=eq.${encodeURIComponent(clientId)}&owner_user_id=is.null`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      owner_user_id: user.id,
      anonymous_client_id: null
    })
  }, env, fetchImpl);

  await requestSupabase(`/credit_events?anonymous_client_id=eq.${encodeURIComponent(clientId)}&owner_user_id=is.null`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      owner_user_id: user.id,
      anonymous_client_id: null
    })
  }, env, fetchImpl);

  await requestSupabase(`/billing_events?anonymous_client_id=eq.${encodeURIComponent(clientId)}&owner_user_id=is.null`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      owner_user_id: user.id,
      anonymous_client_id: null
    })
  }, env, fetchImpl);

  await requestSupabase(`/anonymous_clients?id=eq.${encodeURIComponent(clientId)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      merged_into_user_id: user.id
    })
  }, env, fetchImpl);

  return { skipped: false, merged: true };
}

export async function safePersistGenerationToSupabase(...args) {
  try {
    return await persistGenerationToSupabase(...args);
  } catch (error) {
    console.warn(`Supabase generation sync failed: ${error.message}`);
    return { skipped: true, error: error.message };
  }
}

export async function safePersistPlacementAdjustmentToSupabase(...args) {
  try {
    return await persistPlacementAdjustmentToSupabase(...args);
  } catch (error) {
    console.warn(`Supabase placement adjustment sync failed: ${error.message}`);
    return { skipped: true, error: error.message };
  }
}

export async function safePersistLineworkToSupabase(...args) {
  try {
    return await persistLineworkToSupabase(...args);
  } catch (error) {
    console.warn(`Supabase linework sync failed: ${error.message}`);
    return { skipped: true, error: error.message };
  }
}

export async function safePersistCreditEventToSupabase(...args) {
  try {
    return await persistCreditEventToSupabase(...args);
  } catch (error) {
    console.warn(`Supabase credit sync failed: ${error.message}`);
    return { skipped: true, error: error.message };
  }
}

export async function safePersistBillingEventToSupabase(...args) {
  try {
    return await persistBillingEventToSupabase(...args);
  } catch (error) {
    console.warn(`Supabase billing sync failed: ${error.message}`);
    return { skipped: true, error: error.message };
  }
}

export async function safeListGenerationsFromSupabase(...args) {
  try {
    return await listGenerationsFromSupabase(...args);
  } catch (error) {
    console.warn(`Supabase generation list read failed: ${error.message}`);
    return { skipped: true, error: error.message, generations: [] };
  }
}

export async function safeGetGenerationFromSupabase(...args) {
  try {
    return await getGenerationFromSupabase(...args);
  } catch (error) {
    console.warn(`Supabase generation read failed: ${error.message}`);
    return { skipped: true, error: error.message, generation: null };
  }
}

export async function safeGetQuotaFromSupabase(...args) {
  try {
    return await getQuotaFromSupabase(...args);
  } catch (error) {
    console.warn(`Supabase quota read failed: ${error.message}`);
    return { skipped: true, error: error.message, quota: null };
  }
}

export async function safeListBillingHistoryFromSupabase(...args) {
  try {
    return await listBillingHistoryFromSupabase(...args);
  } catch (error) {
    console.warn(`Supabase billing history read failed: ${error.message}`);
    return { skipped: true, error: error.message, events: [] };
  }
}

export async function safeGetDownloadAccessFromSupabase(...args) {
  try {
    return await getDownloadAccessFromSupabase(...args);
  } catch (error) {
    console.warn(`Supabase download access read failed: ${error.message}`);
    return { skipped: true, error: error.message, downloadAccess: null };
  }
}

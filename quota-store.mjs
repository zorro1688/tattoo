import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  persistGenerationToSupabase,
  persistLineworkToSupabase,
  persistBillingEventToSupabase,
  listBillingHistoryFromSupabase,
  safePersistCreditEventToSupabase,
  safePersistGenerationToSupabase,
  safePersistLineworkToSupabase,
  safeGetGenerationFromSupabase,
  safeListGenerationsFromSupabase,
  safeGetQuotaFromSupabase,
  safeGetDownloadAccessFromSupabase,
  getQuotaFromSupabase
} from "./supabase-store.mjs";
import { billingStatusFromEventType, mergeBillingHistory } from "./billing-history-core.mjs";
import { getAuthSession } from "./auth-core.mjs";

const defaultFreeCredits = 3;
const defaultStorePath = join(process.cwd(), "data", "inkfirst-store.json");
const clientCookieName = "inkfirst_client_id";

function hasSupabaseStore(env = process.env) {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getStorePath(env = process.env) {
  return env.INKFIRST_STORE_PATH || defaultStorePath;
}

function createEmptyStore() {
  return {
    version: 1,
    clients: {},
    generations: [],
    creditEvents: {},
    billingEvents: {}
  };
}

export async function readStore(storePath = getStorePath()) {
  try {
    const store = JSON.parse(await readFile(storePath, "utf8"));
    store.creditEvents ??= {};
    store.billingEvents ??= {};
    store.generations ??= [];
    store.clients ??= {};
    return store;
  } catch (error) {
    if (error.code === "ENOENT") {
      return createEmptyStore();
    }
    throw error;
  }
}

async function writeStore(store, storePath = getStorePath()) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function ensureClient(store, clientId) {
  if (!store.clients[clientId]) {
    const now = nowIso();
    store.clients[clientId] = {
      id: clientId,
      freeCreditsRemaining: defaultFreeCredits,
      paidCreditsRemaining: 0,
      createdAt: now,
      updatedAt: now
    };
  }

  return store.clients[clientId];
}

function toQuota(client) {
  return {
    freeRemaining: client.freeCreditsRemaining,
    paidRemaining: client.paidCreditsRemaining,
    totalRemaining: client.freeCreditsRemaining + client.paidCreditsRemaining,
    highResolution: Boolean(client.highResolutionDownloadsUnlocked)
  };
}

async function syncClientFromSupabase(clientId, client) {
  const supabaseResult = await safeGetQuotaFromSupabase(clientId);

  if (!supabaseResult.quota) {
    return client;
  }

  client.freeCreditsRemaining = supabaseResult.quota.freeRemaining;
  client.paidCreditsRemaining = supabaseResult.quota.paidRemaining;
  client.highResolutionDownloadsUnlocked = supabaseResult.quota.highResolution;

  return client;
}

export async function getQuotaState(clientId, storePath = getStorePath()) {
  const supabaseResult = await safeGetQuotaFromSupabase(clientId);

  if (supabaseResult.quota) {
    return supabaseResult.quota;
  }

  if (!supabaseResult.skipped && hasSupabaseStore()) {
    return {
      freeRemaining: defaultFreeCredits,
      paidRemaining: 0,
      totalRemaining: defaultFreeCredits,
      highResolution: false
    };
  }

  const store = await readStore(storePath);
  const client = ensureClient(store, clientId);
  await writeStore(store, storePath);

  return toQuota(client);
}

export async function mergeLocalAnonymousClientIntoUser(clientId, user, storePath = getStorePath()) {
  if (!clientId || !user?.id || clientId === user.id) {
    return { skipped: true, merged: false };
  }

  const store = await readStore(storePath);
  const anonymousClient = store.clients[clientId];

  if (!anonymousClient) {
    return { skipped: true, merged: false };
  }

  const existingUserClient = store.clients[user.id];
  const userClient = ensureClient(store, user.id);
  const now = nowIso();

  userClient.freeCreditsRemaining = existingUserClient
    ? Math.max(userClient.freeCreditsRemaining ?? 0, anonymousClient.freeCreditsRemaining ?? 0)
    : anonymousClient.freeCreditsRemaining ?? defaultFreeCredits;
  userClient.paidCreditsRemaining =
    (userClient.paidCreditsRemaining ?? 0) + (anonymousClient.paidCreditsRemaining ?? 0);
  userClient.highResolutionDownloadsUnlocked = Boolean(
    userClient.highResolutionDownloadsUnlocked ||
      anonymousClient.highResolutionDownloadsUnlocked ||
      userClient.paidCreditsRemaining > 0
  );
  userClient.updatedAt = now;

  for (const generation of store.generations) {
    if (generation.clientId === clientId) {
      generation.clientId = user.id;
      generation.mergedFromClientId = clientId;
      generation.updatedAt = now;
    }
  }

  for (const event of Object.values(store.creditEvents)) {
    if (event.clientId === clientId) {
      event.clientId = user.id;
      event.mergedFromClientId = clientId;
    }
  }

  for (const event of Object.values(store.billingEvents)) {
    if (event.clientId === clientId) {
      event.clientId = user.id;
      event.mergedFromClientId = clientId;
    }
  }

  anonymousClient.mergedIntoUserId = user.id;
  anonymousClient.updatedAt = now;

  await writeStore(store, storePath);

  return { skipped: false, merged: true };
}

export async function consumeGenerationCredit(clientId, input, generation, storePath = getStorePath()) {
  if (hasSupabaseStore()) {
    const quota = await getQuotaState(clientId);

    if (quota.totalRemaining <= 0) {
      throw new Error("No generation credits remaining");
    }

    const nextQuota = {
      ...quota,
      freeRemaining: quota.freeRemaining > 0 ? quota.freeRemaining - 1 : quota.freeRemaining,
      paidRemaining: quota.freeRemaining > 0 ? quota.paidRemaining : quota.paidRemaining - 1
    };
    nextQuota.totalRemaining = nextQuota.freeRemaining + nextQuota.paidRemaining;

    const savedGeneration = buildSavedGeneration(clientId, input, generation);
    await persistGenerationToSupabase(clientId, savedGeneration, nextQuota);

    return {
      generation: savedGeneration,
      quota: nextQuota
    };
  }

  const store = await readStore(storePath);
  const client = ensureClient(store, clientId);
  await syncClientFromSupabase(clientId, client);

  if (client.freeCreditsRemaining + client.paidCreditsRemaining <= 0) {
    throw new Error("No generation credits remaining");
  }

  if (client.freeCreditsRemaining > 0) {
    client.freeCreditsRemaining -= 1;
  } else {
    client.paidCreditsRemaining -= 1;
  }

  client.updatedAt = nowIso();

  const savedGeneration = buildSavedGeneration(clientId, input, generation);

  store.generations.unshift(savedGeneration);
  await writeStore(store, storePath);
  await safePersistGenerationToSupabase(clientId, savedGeneration, toQuota(client));

  return {
    generation: savedGeneration,
    quota: toQuota(client)
  };
}

function buildSavedGeneration(clientId, input, generation) {
  return {
    id: `gen_${randomUUID()}`,
    clientId,
    providerGenerationId: generation.id,
    provider: generation.provider,
    model: generation.model,
    status: generation.status,
    prompt: generation.prompt,
    placementNote: generation.placementNote,
    images: generation.images,
    input: {
      idea: input.idea,
      style: input.style,
      placement: input.placement,
      size: input.size,
      complexity: input.complexity
    },
    createdAt: nowIso()
  };
}

export async function getGeneration(clientId, generationId, storePath = getStorePath()) {
  const supabaseResult = await safeGetGenerationFromSupabase(clientId, generationId);

  if (supabaseResult.generation) {
    return supabaseResult.generation;
  }

  const store = await readStore(storePath);
  const generation = store.generations.find(
    (item) => item.id === generationId && item.clientId === clientId
  );

  return generation ? { ...generation } : null;
}

export async function consumeLineworkCredit(clientId, generationId, linework, storePath = getStorePath()) {
  if (hasSupabaseStore()) {
    const generation = await getGeneration(clientId, generationId);

    if (!generation) {
      throw new Error("Saved generation was not found");
    }

    const quota = await getQuotaState(clientId);

    if (quota.totalRemaining <= 0) {
      throw new Error("No generation credits remaining");
    }

    const nextQuota = {
      ...quota,
      freeRemaining: quota.freeRemaining > 0 ? quota.freeRemaining - 1 : quota.freeRemaining,
      paidRemaining: quota.freeRemaining > 0 ? quota.paidRemaining : quota.paidRemaining - 1
    };
    nextQuota.totalRemaining = nextQuota.freeRemaining + nextQuota.paidRemaining;

    const updatedGeneration = applyLineworkToGeneration(generation, linework);
    await persistLineworkToSupabase(clientId, updatedGeneration, nextQuota);

    return {
      generation: { ...updatedGeneration },
      quota: nextQuota
    };
  }

  const store = await readStore(storePath);
  const client = ensureClient(store, clientId);
  await syncClientFromSupabase(clientId, client);
  let generation = store.generations.find(
    (item) => item.id === generationId && item.clientId === clientId
  );

  if (!generation) {
    const supabaseResult = await safeGetGenerationFromSupabase(clientId, generationId);

    if (supabaseResult.generation) {
      generation = {
        ...supabaseResult.generation,
        clientId
      };
      store.generations.unshift(generation);
    }
  }

  if (!generation) {
    throw new Error("Saved generation was not found");
  }

  if (client.freeCreditsRemaining + client.paidCreditsRemaining <= 0) {
    throw new Error("No generation credits remaining");
  }

  if (client.freeCreditsRemaining > 0) {
    client.freeCreditsRemaining -= 1;
  } else {
    client.paidCreditsRemaining -= 1;
  }

  client.updatedAt = nowIso();
  applyLineworkToGeneration(generation, linework);

  await writeStore(store, storePath);
  await safePersistLineworkToSupabase(clientId, generation, toQuota(client));

  return {
    generation: { ...generation },
    quota: toQuota(client)
  };
}

function applyLineworkToGeneration(generation, linework) {
  generation.images = {
    ...generation.images,
    linework: linework.images?.linework
  };
  generation.lineworkProviderGenerationId = linework.id;
  generation.lineworkProvider = linework.provider;
  generation.lineworkModel = linework.model;
  generation.lineworkStatus = linework.status;
  generation.lineworkPrompt = linework.prompt;
  generation.updatedAt = nowIso();

  return generation;
}

export async function addPaidCredits(clientId, credits, metadata = {}, storePath = getStorePath()) {
  const amount = Number(credits);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Paid credits must be a positive number");
  }

  const store = await readStore(storePath);
  const client = ensureClient(store, clientId);
  const eventId = metadata.externalEventId;

  if (eventId && store.creditEvents[eventId]) {
    return {
      granted: false,
      quota: toQuota(client)
    };
  }

  client.paidCreditsRemaining += amount;
  client.highResolutionDownloadsUnlocked = true;
  client.updatedAt = nowIso();

  if (eventId) {
    store.creditEvents[eventId] = {
      id: eventId,
      clientId,
      credits: amount,
      source: metadata.source ?? "manual",
      plan: metadata.plan,
      createdAt: nowIso()
    };
  }

  await writeStore(store, storePath);
  await safePersistCreditEventToSupabase(clientId, amount, metadata, toQuota(client));

  return {
    granted: true,
    quota: toQuota(client)
  };
}

export async function recordBillingEvent(event) {
  if (!event?.eventId) {
    throw new Error("Billing event eventId is required");
  }

  const result = await persistBillingEventToSupabase(event);

  if (!result.skipped) {
    return result;
  }

  const store = await readStore();
  const provider = event.source ?? "creem";
  const existingEvent = store.billingEvents[event.eventId];

  if (existingEvent) {
    const hasConflict =
      existingEvent.provider !== provider ||
      existingEvent.event_type !== event.eventType ||
      existingEvent.clientId !== event.clientId ||
      existingEvent.plan !== event.plan ||
      existingEvent.credits !== event.credits;

    if (hasConflict) {
      throw new Error(`Billing event conflict for ${event.eventId}: immutable fields differ`);
    }

    return { skipped: false, local: true, idempotent: true };
  }

  const processedAt = new Date(event.processedAt ?? Date.now()).toISOString();
  store.billingEvents[event.eventId] = {
    id: event.eventId,
    provider,
    event_type: event.eventType,
    clientId: event.clientId,
    plan: event.plan,
    credits: event.credits,
    processed_at: processedAt,
    created_at: processedAt
  };
  await writeStore(store);

  return { skipped: false, local: true };
}

export async function getBillingHistory(ownerId, options = {}) {
  const numericLimit = Number(options.limit ?? 20);
  const displayLimit = Math.min(
    50,
    Math.max(1, Number.isFinite(numericLimit) ? Math.trunc(numericLimit) : 20)
  );
  const supabaseQuotaResult = await getQuotaFromSupabase(ownerId);
  const quota = supabaseQuotaResult.quota ?? await getQuotaState(ownerId);
  const supabaseResult = await listBillingHistoryFromSupabase(ownerId, { limit: 50 });
  let historyEvents;
  let latestPaidPlan;

  if (!supabaseResult.skipped) {
    historyEvents = supabaseResult.events;
    latestPaidPlan = supabaseResult.latestPaidPlan;
  } else {
    const store = await readStore();
    const billingRows = Object.values(store.billingEvents)
      .filter((event) => event.clientId === ownerId)
      .map((event) => ({
        ...event,
        occurred_at: event.processed_at ?? event.created_at
      }));
    const creditRows = Object.values(store.creditEvents)
      .filter((event) => event.clientId === ownerId)
      .map((event) => ({
        source: event.source,
        external_event_id: event.id,
        plan: event.plan,
        credits_delta: event.credits,
        created_at: event.createdAt
      }));

    const latestLocalPaidEvent = [
      ...creditRows.map((event) => ({ plan: event.plan, occurredAt: event.created_at })),
      ...billingRows
        .filter((event) => billingStatusFromEventType(event.event_type) === "paid")
        .map((event) => ({ plan: event.plan, occurredAt: event.occurred_at }))
    ]
      .filter((event) => event.plan)
      .sort((left, right) => (Date.parse(right.occurredAt) || 0) - (Date.parse(left.occurredAt) || 0))[0];
    latestPaidPlan = latestLocalPaidEvent?.plan;
    historyEvents = mergeBillingHistory(billingRows, creditRows, 50);
  }

  const latestPaidEvent = historyEvents.find((event) => event.status === "paid");
  latestPaidPlan ??= latestPaidEvent?.plan;

  return {
    summary: {
      plan: latestPaidPlan ?? "free",
      freeCreditsRemaining: quota.freeRemaining,
      paidCreditsRemaining: quota.paidRemaining,
      totalCreditsRemaining: quota.totalRemaining,
      highResolutionDownloadsUnlocked: quota.highResolution,
      lastPaymentAt: latestPaidEvent?.occurredAt ?? null,
      paymentSource: latestPaidEvent?.provider ?? null
    },
    events: historyEvents.slice(0, displayLimit)
  };
}
export async function getDownloadAccess(clientId, storePath = getStorePath()) {
  const supabaseResult = await safeGetDownloadAccessFromSupabase(clientId);

  if (supabaseResult.downloadAccess) {
    return supabaseResult.downloadAccess;
  }

  const store = await readStore(storePath);
  const client = ensureClient(store, clientId);
  const hasPaidEvent = Object.values(store.creditEvents).some((event) => event.clientId === clientId);
  const highResolution = Boolean(
    client.highResolutionDownloadsUnlocked || client.paidCreditsRemaining > 0 || hasPaidEvent
  );

  await writeStore(store, storePath);

  return {
    highResolution,
    watermarked: !highResolution,
    message: highResolution
      ? "High-resolution downloads are unlocked"
      : "Upgrade to download high-resolution files"
  };
}

export async function listGenerations(clientId, options = {}, storePath = getStorePath()) {
  const limit = Math.max(1, Math.min(Number(options.limit ?? 6), 24));
  const supabaseResult = await safeListGenerationsFromSupabase(clientId, { limit });

  if (supabaseResult.generations?.length) {
    return supabaseResult.generations;
  }

  const store = await readStore(storePath);

  return store.generations
    .filter((generation) => generation.clientId === clientId)
    .slice(0, limit)
    .map((generation) => ({
      id: generation.id,
      providerGenerationId: generation.providerGenerationId,
      provider: generation.provider,
      model: generation.model,
      status: generation.status,
      prompt: generation.prompt,
      placementNote: generation.placementNote,
      lineworkProviderGenerationId: generation.lineworkProviderGenerationId,
      lineworkProvider: generation.lineworkProvider,
      lineworkModel: generation.lineworkModel,
      lineworkStatus: generation.lineworkStatus,
      lineworkPrompt: generation.lineworkPrompt,
      images: generation.images,
      input: generation.input,
      createdAt: generation.createdAt,
      updatedAt: generation.updatedAt
    }));
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...valueParts] = part.split("=");
        return [key, decodeURIComponent(valueParts.join("="))];
      })
  );
}

export function getClientSession(cookieHeader = "") {
  const cookies = parseCookies(cookieHeader);
  const clientId = cookies[clientCookieName];
  const authSession = getAuthSession(cookieHeader);

  if (clientId) {
    return {
      clientId,
      userId: authSession?.userId,
      email: authSession?.email,
      isAuthenticated: Boolean(authSession?.userId),
      ownerId: authSession?.userId ?? clientId,
      isNew: false
    };
  }

  const newClientId = `anon_${randomUUID()}`;

  return {
    clientId: newClientId,
    userId: authSession?.userId,
    email: authSession?.email,
    isAuthenticated: Boolean(authSession?.userId),
    ownerId: authSession?.userId ?? newClientId,
    isNew: true
  };
}

export function buildClientCookie(clientId) {
  const maxAge = 60 * 60 * 24 * 365;
  return `${clientCookieName}=${encodeURIComponent(clientId)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

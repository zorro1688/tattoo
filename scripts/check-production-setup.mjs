import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadLocalEnv() {
  for (const file of [".env.production.local", ".env.local"]) {
    const envPath = join(process.cwd(), file);

    if (!existsSync(envPath)) {
      continue;
    }

    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
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

function hasValue(name) {
  return Boolean(process.env[name]?.trim());
}

function requireValue(name, group, errors) {
  if (!hasValue(name)) {
    errors.push(`[${group}] ${name} is missing.`);
  }
}

function addWarning(message, warnings) {
  warnings.push(message);
}

function validateAppUrl(errors, warnings) {
  requireValue("NEXT_PUBLIC_APP_URL", "App URL", errors);

  if (!hasValue("NEXT_PUBLIC_APP_URL")) {
    return;
  }

  try {
    const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL.trim());

    if (appUrl.protocol !== "https:") {
      errors.push("[App URL] NEXT_PUBLIC_APP_URL must use https in production.");
    }

    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(appUrl.hostname)) {
      errors.push("[App URL] NEXT_PUBLIC_APP_URL cannot be localhost in production.");
    }

    if (!appUrl.hostname.includes(".")) {
      addWarning("[App URL] NEXT_PUBLIC_APP_URL does not look like a public domain.", warnings);
    }
  } catch {
    errors.push("[App URL] NEXT_PUBLIC_APP_URL is not a valid URL.");
  }
}

function validateGeneration(errors, warnings) {
  requireValue("GENERATION_PROVIDER", "Generation", errors);

  const provider = process.env.GENERATION_PROVIDER?.trim();
  if (provider && provider !== "replicate") {
    errors.push("[Generation] GENERATION_PROVIDER must be replicate in production.");
  }

  requireValue("REPLICATE_API_TOKEN", "Generation", errors);

  if (!hasValue("GENERATION_MODEL")) {
    addWarning("[Generation] GENERATION_MODEL is not set. The server will use its default concept model.", warnings);
  }

  if (!hasValue("REPLICATE_LINEWORK_MODEL")) {
    addWarning("[Generation] REPLICATE_LINEWORK_MODEL is not set. Linework will use the default model.", warnings);
  }
}

function validateSupabase(errors) {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET"
  ]) {
    requireValue(name, "Supabase", errors);
  }

  if (hasValue("NEXT_PUBLIC_SUPABASE_URL")) {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL.trim());
      if (url.protocol !== "https:") {
        errors.push("[Supabase] NEXT_PUBLIC_SUPABASE_URL must use https.");
      }
    } catch {
      errors.push("[Supabase] NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
    }
  }
}

function validateCreem(errors) {
  for (const name of [
    "PAYMENT_PROVIDER",
    "CREEM_API_KEY",
    "CREEM_CREATOR_PACK_PRODUCT_ID",
    "CREEM_PRO_MONTHLY_PRODUCT_ID",
    "CREEM_PRO_YEARLY_PRODUCT_ID",
    "CREEM_WEBHOOK_SECRET"
  ]) {
    requireValue(name, "Creem", errors);
  }

  if (hasValue("PAYMENT_PROVIDER") && process.env.PAYMENT_PROVIDER.trim() !== "creem") {
    errors.push("[Creem] PAYMENT_PROVIDER must be creem.");
  }
}

function validateGoogleOAuth(errors) {
  for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
    requireValue(name, "Google OAuth", errors);
  }
}

loadLocalEnv();

const errors = [];
const warnings = [];

validateAppUrl(errors, warnings);
validateGeneration(errors, warnings);
validateSupabase(errors);
validateCreem(errors);
validateGoogleOAuth(errors);

if (errors.length) {
  console.error("Production setup is not ready:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }

  if (warnings.length) {
    console.error("Warnings:");
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }

  process.exit(1);
}

console.log("Production setup is ready.");

if (warnings.length) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

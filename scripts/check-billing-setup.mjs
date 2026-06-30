import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function hasValue(name) {
  return Boolean(process.env[name]?.trim());
}

function checkRequired(name, errors) {
  if (!hasValue(name)) {
    errors.push(`${name} is missing.`);
  }
}

loadLocalEnv();

const errors = [];
const warnings = [];

[
  "PAYMENT_PROVIDER",
  "CREEM_API_KEY",
  "CREEM_CREATOR_PACK_PRODUCT_ID",
  "CREEM_PRO_MONTHLY_PRODUCT_ID",
  "CREEM_PRO_YEARLY_PRODUCT_ID",
  "CREEM_WEBHOOK_SECRET",
  "NEXT_PUBLIC_APP_URL"
].forEach((name) => checkRequired(name, errors));

if (hasValue("PAYMENT_PROVIDER") && process.env.PAYMENT_PROVIDER !== "creem") {
  errors.push("PAYMENT_PROVIDER must be creem for this checkout flow.");
}

if (hasValue("NEXT_PUBLIC_APP_URL")) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL.trim();

  try {
    const url = new URL(appUrl);
    if (url.protocol !== "https:") {
      warnings.push("NEXT_PUBLIC_APP_URL should be an https public URL for real Creem webhooks.");
    }
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      warnings.push("NEXT_PUBLIC_APP_URL cannot be localhost for real Creem webhooks.");
    }
  } catch {
    errors.push("NEXT_PUBLIC_APP_URL is not a valid URL.");
  }
}

if (errors.length) {
  console.error("Billing setup is not ready:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Billing setup looks ready.");

if (warnings.length) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

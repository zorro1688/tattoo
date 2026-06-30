import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const requiredEnv = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREEM_API_KEY",
  "CREEM_WEBHOOK_SECRET",
  "CREEM_CREATOR_PACK_PRODUCT_ID",
  "REPLICATE_API_TOKEN"
];

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
}

function isolatedTestEnv() {
  const env = { ...process.env };
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID",
    "SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET"
  ]) {
    delete env[key];
  }
  return env;
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: isolatedTestEnv(),
      stdio: "inherit",
      shell: false
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function fetchOk(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "ngrok-skip-browser-warning": "1",
        ...(options.headers ?? {})
      }
    });
    return { ok: response.ok, status: response.status, text: await response.text().catch(() => "") };
  } catch (error) {
    return { ok: false, status: 0, text: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function findNgrokTunnel(expectedUrl) {
  for (const port of [4040, 4041]) {
    const response = await fetchOk(`http://127.0.0.1:${port}/api/tunnels`, { timeoutMs: 3000 });
    if (!response.ok) continue;
    try {
      const payload = JSON.parse(response.text);
      const tunnel = payload.tunnels?.find((item) => item.public_url === expectedUrl) ?? payload.tunnels?.[0];
      if (tunnel) return { port, tunnel };
    } catch {
      // Ignore non-JSON responses from unavailable local inspection ports.
    }
  }
  return null;
}

function printResult(ok, label, detail = "") {
  console.log(`${ok ? "OK" : "FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const failures = [];

for (const name of requiredEnv) {
  const ok = Boolean(process.env[name]?.trim());
  printResult(ok, `env ${name}`);
  if (!ok) failures.push(`Missing ${name}`);
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
let parsedAppUrl = null;
if (appUrl) {
  try {
    parsedAppUrl = new URL(appUrl);
    const protocolOk = parsedAppUrl.protocol === "https:" || parsedAppUrl.hostname === "localhost";
    printResult(protocolOk, "NEXT_PUBLIC_APP_URL protocol", appUrl);
    if (!protocolOk) failures.push("NEXT_PUBLIC_APP_URL should be https unless it is localhost.");
  } catch {
    printResult(false, "NEXT_PUBLIC_APP_URL is a valid URL", appUrl);
    failures.push("NEXT_PUBLIC_APP_URL is invalid.");
  }
}

if (parsedAppUrl) {
  const home = await fetchOk(parsedAppUrl.toString());
  printResult(home.ok, "public app URL responds", `${parsedAppUrl} status=${home.status}`);
  if (!home.ok) failures.push(`App URL is not reachable: ${home.text}`);

  if (parsedAppUrl.hostname.endsWith("ngrok-free.app")) {
    const ngrok = await findNgrokTunnel(parsedAppUrl.toString().replace(/\/$/, ""));
    printResult(Boolean(ngrok), "ngrok tunnel matches NEXT_PUBLIC_APP_URL", ngrok ? `port=${ngrok.port}` : "not found");
    if (!ngrok) failures.push("ngrok tunnel is not online or does not match NEXT_PUBLIC_APP_URL.");
  }
}

const focusedChecks = [
  ["node", ["tests/auth-core.test.mjs"]],
  ["node", ["tests/login-merge-flow.test.mjs"]],
  ["node", ["tests/generation-core.test.mjs"]],
  ["node", ["tests/design-detail-page.test.mjs"]],
  ["node", ["tests/download-access.test.mjs"]],
  ["node", ["tests/billing-history-webhook.test.mjs"]],
  ["node", ["tests/success-page.test.mjs"]]
];

for (const [command, args] of focusedChecks) {
  console.log(`\n==> ${[command, ...args].join(" ")}`);
  const code = await run(command, args);
  if (code !== 0) failures.push(`${[command, ...args].join(" ")} failed`);
}

console.log("\nOptional deeper checks:");
console.log("- npm run verify:supabase");
console.log("- npm run test:regression");
console.log("- Manual browser flow in docs/full-flow-manual-checklist.md");

if (failures.length) {
  console.error("\nFull-flow preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nFull-flow preflight passed. Continue with the manual checklist.");
}

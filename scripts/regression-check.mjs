import { spawn } from "node:child_process";

const checks = [
  ["node", ["tests/auth-core.test.mjs"]],
  ["node", ["tests/auth-ui.test.mjs"]],
  ["node", ["tests/login-merge-flow.test.mjs"]],
  ["node", ["tests/generation-core.test.mjs"]],
  ["node", ["tests/hero-result-preview.test.mjs"]],
  ["node", ["tests/hero-placement-preview.test.mjs"]],
  ["node", ["tests/my-designs-page.test.mjs"]],
  ["node", ["tests/my-designs-linework.test.mjs"]],
  ["node", ["tests/design-detail-page.test.mjs"]],
  ["node", ["tests/download-access.test.mjs"]],
  ["node", ["tests/download-access-ui.test.mjs"]],
  ["node", ["tests/download-endpoint.test.mjs"]],
  ["node", ["tests/billing-page.test.mjs"]],
  ["node", ["tests/billing-history-api.test.mjs"]],
  ["node", ["tests/billing-history-store.test.mjs"]],
  ["node", ["tests/billing-history-webhook.test.mjs"]],
  ["node", ["tests/creem-webhook-access.test.mjs"]],
  ["node", ["tests/success-page.test.mjs"]],
  ["node", ["tests/pricing-state-ui.test.mjs"]],
  ["node", ["tests/monitoring-core.test.mjs"]],
  ["node", ["tests/monitoring-routes.test.mjs"]],
  ["node", ["tests/monitoring-storage-download.test.mjs"]],
  ["node", ["tests/quality-evaluation-dataset.test.mjs"]],
  ["node", ["tests/quality-evaluation-core.test.mjs"]],
  ["node", ["tests/quality-evaluation-cli.test.mjs"]],
  ["node", ["tests/quality-evaluation-setup.test.mjs"]],
  ["node", ["tests/storage-migration-core.test.mjs"]],
  ["node", ["tests/production-setup.test.mjs"]],
  ["node", ["tests/full-flow-checklist.test.mjs"]],
  ["node", ["--check", "server.mjs"]],
  ["node", ["--check", "script.js"]],
  ["node", ["--check", "public/script.js"]],
  ["node", ["--check", "design.js"]],
  ["node", ["--check", "public/design.js"]],
  ["node", ["--check", "billing.js"]],
  ["node", ["--check", "public/billing.js"]],
  ["node", ["node_modules/typescript/bin/tsc", "--noEmit"]]
];

function label(command, args) {
  return [command, ...args].join(" ");
}

function runCheck(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit"
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });

    child.on("error", () => {
      resolve(1);
    });
  });
}

const failed = [];

for (const [command, args] of checks) {
  const name = label(command, args);
  console.log(`\n==> ${name}`);
  const code = await runCheck(command, args);

  if (code !== 0) {
    failed.push(name);
  }
}

if (failed.length) {
  console.error("\nRegression checks failed:");
  for (const name of failed) {
    console.error(`- ${name}`);
  }
  process.exitCode = 1;
} else {
  console.log("\nRegression checks passed.");
}

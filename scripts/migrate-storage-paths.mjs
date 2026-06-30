import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { migrateStoragePathsToUserPrefix } from "../storage-migration-core.mjs";

async function loadLocalEnv() {
  try {
    const text = await readFile(join(process.cwd(), ".env.local"), "utf8");

    for (const line of text.split(/\r?\n/)) {
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
  } catch {
    // Environment variables can also be provided by the host.
  }
}

function parseArgs(argv) {
  const args = new Set(argv);
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));

  return {
    dryRun: !args.has("--execute"),
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : 100
  };
}

await loadLocalEnv();

const options = parseArgs(process.argv.slice(2));
const result = await migrateStoragePathsToUserPrefix(options);

console.log(JSON.stringify(result, null, 2));

if (result.failed > 0) {
  process.exitCode = 1;
}

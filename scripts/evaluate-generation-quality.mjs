import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGeneration } from "../generation-core.mjs";
import {
  evaluateBatch,
  formatMarkdownReport,
  summarizeEvaluation,
} from "../quality-evaluation-core.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

function parseArgs(argv) {
  const options = {
    generate: false,
    manifest: null,
    outputDir: path.join(projectRoot, "quality-reports"),
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--generate") {
      options.generate = true;
    } else if (arg === "--manifest") {
      options.manifest = argv[++index];
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(argv[++index]);
    } else if (arg === "--limit") {
      options.limit = Number(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.generate && !options.manifest) {
    throw new Error("Provide --manifest <path> or explicitly use --generate.");
  }
  if (options.generate && process.env.GENERATION_PROVIDER !== "replicate") {
    throw new Error("--generate requires GENERATION_PROVIDER=replicate.");
  }
  if (options.generate && !process.env.REPLICATE_API_TOKEN) {
    throw new Error("--generate requires REPLICATE_API_TOKEN.");
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }

  return options;
}

function sanitizeSource(value, manifestDirectory = projectRoot) {
  const source = String(value ?? "");
  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source);
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  return `local/${path.basename(path.resolve(manifestDirectory, source))}`;
}


export function sanitizeManifestForReport(manifest) {
  return {
    ...manifest,
    runs: (manifest.runs ?? []).map((run) => ({
      ...run,
      candidates: (run.candidates ?? []).map((candidate) => {
        if (typeof candidate === "object" && candidate !== null) {
          return {
            ...candidate,
            source: sanitizeSource(candidate.source),
          };
        }
        return sanitizeSource(candidate);
      }),
    })),
  };
}
async function loadCandidate(source, manifestDirectory) {
  const value = typeof source === "string" ? source : source?.source;
  const sanitized = sanitizeSource(value, manifestDirectory);

  try {
    if (/^https?:\/\//i.test(String(value))) {
      const response = await fetch(value);
      if (!response.ok) throw new Error(`Image request failed with ${response.status}.`);
      return {
        id: typeof source === "object" ? source.id : undefined,
        source: sanitized,
        buffer: Buffer.from(await response.arrayBuffer()),
      };
    }
    return {
      id: typeof source === "object" ? source.id : undefined,
      source: sanitized,
      buffer: await readFile(path.resolve(manifestDirectory, String(value))),
    };
  } catch {
    return {
      id: typeof source === "object" ? source.id : undefined,
      source: sanitized,
      buffer: Buffer.alloc(0),
    };
  }
}

async function readManifest(manifestPath) {
  const absolutePath = path.resolve(manifestPath);
  const manifest = JSON.parse(await readFile(absolutePath, "utf8"));
  if (!Array.isArray(manifest.runs)) {
    throw new Error("Quality manifest must contain a runs array.");
  }
  return {
    manifest,
    directory: path.dirname(absolutePath),
  };
}

async function generateManifest(limit) {
  const promptPath = path.join(projectRoot, "quality-evaluation", "prompts.json");
  const cases = JSON.parse(await readFile(promptPath, "utf8"));
  const selectedCases = limit ? cases.slice(0, limit) : cases;
  const runs = [];

  for (const benchmarkCase of selectedCases) {
    const generation = await createGeneration(benchmarkCase.input);
    const candidates = generation.conceptCandidates ?? [];
    runs.push({
      caseId: benchmarkCase.id,
      category: benchmarkCase.category,
      input: benchmarkCase.input,
      expectedElements: benchmarkCase.expectedElements,
      forbiddenElements: benchmarkCase.forbiddenElements,
      candidates,
      provider: generation.provider,
      model: generation.model,
      predictionId: generation.id,
      error: generation.error ?? null,
    });
  }

  return {
    benchmarkVersion: "2026-07-18",
    generatedAt: new Date().toISOString(),
    runs,
  };
}

async function evaluateManifest(manifest, manifestDirectory) {
  const results = [];
  for (const run of manifest.runs) {
    const candidates = await Promise.all(
      (run.candidates ?? []).map((source) => loadCandidate(source, manifestDirectory)),
    );
    results.push(await evaluateBatch({
      ...run,
      candidates,
    }));
  }
  return summarizeEvaluation(results, {
    benchmarkVersion: manifest.benchmarkVersion,
  });
}

async function writeReports(report, outputDir, liveManifest = null) {
  await mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const baseName = `${timestamp}-generation-quality`;
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const markdownPath = path.join(outputDir, `${baseName}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(markdownPath, formatMarkdownReport(report), "utf8");

  if (liveManifest) {
    await writeFile(
      path.join(outputDir, `${baseName}-manifest.json`),
      JSON.stringify(sanitizeManifestForReport(liveManifest), null, 2) + "\n",
      "utf8",
    );
  }

  return { jsonPath, markdownPath };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let manifest;
  let manifestDirectory = projectRoot;

  if (options.generate) {
    manifest = await generateManifest(options.limit);
  } else {
    const loaded = await readManifest(options.manifest);
    manifest = loaded.manifest;
    manifestDirectory = loaded.directory;
  }

  const report = await evaluateManifest(manifest, manifestDirectory);
  const files = await writeReports(
    report,
    options.outputDir,
    options.generate ? manifest : null,
  );
  console.log(`Quality report written: ${files.jsonPath}`);
  console.log(`Markdown summary written: ${files.markdownPath}`);
  console.log(
    `Four-candidate batch success: ${(report.summary.automatedBatchSuccessRate * 100).toFixed(1)}%`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

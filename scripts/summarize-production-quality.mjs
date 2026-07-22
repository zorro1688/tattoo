import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(events, key) {
  if (!events.length) return 0;
  return events.reduce((sum, event) => sum + normalizeNumber(event[key]), 0) / events.length;
}

function parseJsonFromLine(line) {
  const start = line.indexOf("{");
  if (start < 0) return null;

  try {
    return JSON.parse(line.slice(start));
  } catch {
    return null;
  }
}

export function parseQualityEventLines(content) {
  return String(content || "")
    .split(/\r?\n/)
    .map(parseJsonFromLine)
    .filter((event) => event?.event === "candidate_quality_gate_completed");
}

export function summarizeProductionQuality(
  events,
  {
    targetRate = 0.85,
    minimumSampleSize = 100,
  } = {},
) {
  const qualityEvents = (events || []).filter(
    (event) => event?.event === "candidate_quality_gate_completed",
  );
  const totalBatches = qualityEvents.length;
  const batchesWithAtLeastTwoUsable = qualityEvents.filter(
    (event) => normalizeNumber(event.acceptedCount) >= 2,
  ).length;
  const refillCount = qualityEvents.filter((event) => event.refillAttempted === true).length;
  const atLeastTwoUsableRate = totalBatches
    ? batchesWithAtLeastTwoUsable / totalBatches
    : 0;
  const sampleSizeReached = totalBatches >= minimumSampleSize;

  return {
    generatedAt: new Date().toISOString(),
    totalBatches,
    batchesWithAtLeastTwoUsable,
    atLeastTwoUsableRate,
    refillCount,
    refillRate: totalBatches ? refillCount / totalBatches : 0,
    reviewUnavailableCount: qualityEvents.reduce(
      (sum, event) => sum + normalizeNumber(event.reviewUnavailableCount),
      0,
    ),
    averageAcceptedCount: average(qualityEvents, "acceptedCount"),
    averageRejectedCount: average(qualityEvents, "rejectedCount"),
    averageDurationMs: average(qualityEvents, "durationMs"),
    targetRate,
    minimumSampleSize,
    sampleSizeReached,
    targetMet: sampleSizeReached && atLeastTwoUsableRate >= targetRate,
  };
}

function parseArgs(argv) {
  const options = {
    input: null,
    targetRate: 0.85,
    minimumSampleSize: 100,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      options.input = argv[++index];
    } else if (arg === "--target-rate") {
      options.targetRate = Number(argv[++index]);
    } else if (arg === "--minimum-sample-size") {
      options.minimumSampleSize = Number(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.input) {
    throw new Error("Provide --input <vercel-log-export.jsonl>.");
  }
  if (!(options.targetRate > 0 && options.targetRate <= 1)) {
    throw new Error("--target-rate must be between 0 and 1.");
  }
  if (!Number.isInteger(options.minimumSampleSize) || options.minimumSampleSize < 1) {
    throw new Error("--minimum-sample-size must be a positive integer.");
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = await readFile(path.resolve(options.input), "utf8");
  const events = parseQualityEventLines(content);
  const report = summarizeProductionQuality(events, options);
  console.log(JSON.stringify(report, null, 2));
  console.log(
    `At least two usable candidates: ${(report.atLeastTwoUsableRate * 100).toFixed(1)}% (${report.batchesWithAtLeastTwoUsable}/${report.totalBatches})`,
  );
  console.log(
    report.sampleSizeReached
      ? `85% quality target: ${report.targetMet ? "met" : "not met"}`
      : `Need ${report.minimumSampleSize - report.totalBatches} more batches before evaluating the target.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
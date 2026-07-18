import { createHash } from "node:crypto";
import sharp from "sharp";

const DEFAULT_MIN_DIMENSION = 512;
const FOREGROUND_DIFFERENCE = 32;
const DARK_BACKGROUND_LUMINANCE = 72;
const EDGE_MARGIN_RATIO = 0.015;

function luminance(r, g, b) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function averageCornerLuminance(data, width, height, channels) {
  const sampleWidth = Math.max(2, Math.round(width * 0.08));
  const sampleHeight = Math.max(2, Math.round(height * 0.08));
  const corners = [
    [0, 0],
    [width - sampleWidth, 0],
    [0, height - sampleHeight],
    [width - sampleWidth, height - sampleHeight],
  ];
  let total = 0;
  let count = 0;

  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + sampleHeight; y += 1) {
      for (let x = startX; x < startX + sampleWidth; x += 1) {
        const index = ((y * width) + x) * channels;
        total += luminance(data[index], data[index + 1], data[index + 2]);
        count += 1;
      }
    }
  }

  return count ? total / count : 255;
}

function findForegroundBounds(data, width, height, channels, backgroundLuminance) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = ((y * width) + x) * channels;
      const pixelLuminance = luminance(data[index], data[index + 1], data[index + 2]);
      if (Math.abs(pixelLuminance - backgroundLuminance) < FOREGROUND_DIFFERENCE) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return {
    x: minX,
    y: minY,
    width: (maxX - minX) + 1,
    height: (maxY - minY) + 1,
  };
}

async function createSignature(buffer) {
  const { data } = await sharp(buffer)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize(16, 16, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const quantized = Buffer.from(data.map((value) => Math.round(value / 32)));
  return createHash("sha256").update(quantized).digest("hex").slice(0, 24);
}

export async function analyzeCandidate(buffer, options = {}) {
  const minDimension = Number(options.minDimension) || DEFAULT_MIN_DIMENSION;
  const reasons = [];

  try {
    const normalized = await sharp(buffer)
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = normalized.info;
    const backgroundLuminance = averageCornerLuminance(
      normalized.data,
      width,
      height,
      channels,
    );
    const darkBackground = backgroundLuminance < DARK_BACKGROUND_LUMINANCE;
    const foregroundBounds = findForegroundBounds(
      normalized.data,
      width,
      height,
      channels,
      backgroundLuminance,
    );

    if (width < minDimension || height < minDimension) reasons.push("image_too_small");
    if (darkBackground) reasons.push("dark_background");
    if (!foregroundBounds) reasons.push("foreground_not_detected");

    let clippingRisk = false;
    let edgeMarginRatio = null;
    if (foregroundBounds) {
      const margins = [
        foregroundBounds.x,
        foregroundBounds.y,
        width - (foregroundBounds.x + foregroundBounds.width),
        height - (foregroundBounds.y + foregroundBounds.height),
      ];
      edgeMarginRatio = Math.min(...margins) / Math.min(width, height);
      clippingRisk = edgeMarginRatio <= EDGE_MARGIN_RATIO;
      if (clippingRisk) reasons.push("foreground_touches_edge");
    }

    return {
      decodable: true,
      width,
      height,
      backgroundLuminance: Number(backgroundLuminance.toFixed(2)),
      darkBackground,
      foregroundBounds,
      edgeMarginRatio: edgeMarginRatio === null ? null : Number(edgeMarginRatio.toFixed(4)),
      clippingRisk,
      signature: await createSignature(buffer),
      automatedPass: reasons.length === 0,
      reasons,
    };
  } catch (error) {
    return {
      decodable: false,
      width: null,
      height: null,
      darkBackground: false,
      foregroundBounds: null,
      edgeMarginRatio: null,
      clippingRisk: false,
      signature: null,
      automatedPass: false,
      reasons: ["image_decode_failed"],
      error: error instanceof Error ? error.message : "Image decode failed.",
    };
  }
}

export async function evaluateBatch(run, options = {}) {
  const signatures = new Map();
  const candidates = [];

  for (let index = 0; index < (run.candidates ?? []).length; index += 1) {
    const candidate = run.candidates[index];
    const analysis = await analyzeCandidate(candidate.buffer, options);
    const id = candidate.id ?? `candidate-${index + 1}`;
    const duplicateOf = analysis.signature
      ? signatures.get(analysis.signature) ?? null
      : null;
    if (analysis.signature && !duplicateOf) signatures.set(analysis.signature, id);
    candidates.push({
      id,
      source: candidate.source,
      ...analysis,
      duplicateOf,
    });
  }

  const metrics = {
    totalCandidates: candidates.length,
    automatedPassCandidates: candidates.filter((entry) => entry.automatedPass).length,
    darkBackgroundCandidates: candidates.filter((entry) => entry.darkBackground).length,
    clippingRiskCandidates: candidates.filter((entry) => entry.clippingRisk).length,
    duplicateCandidates: candidates.filter((entry) => entry.duplicateOf).length,
    decodeFailureCandidates: candidates.filter((entry) => !entry.decodable).length,
  };

  return {
    caseId: run.caseId,
    category: run.category,
    input: run.input,
    candidates,
    metrics,
    hasAutomatedUsableCandidate: metrics.automatedPassCandidates > 0,
    manualReview: run.manualReview ?? {
      status: "not_reviewed",
      hasUsableCandidate: null,
      unrequestedElements: "not_reviewed",
      anatomyComplete: "not_reviewed",
      conceptLineworkConsistency: "not_reviewed",
      notes: "",
    },
    error: run.error ?? null,
  };
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

export function summarizeEvaluation(results, metadata = {}) {
  const totalBatches = results.length;
  const totalCandidates = results.reduce(
    (sum, entry) => sum + (entry.metrics?.totalCandidates ?? 0),
    0,
  );
  const automatedPassCandidates = results.reduce(
    (sum, entry) => sum + (entry.metrics?.automatedPassCandidates ?? 0),
    0,
  );
  const batchesWithAutomatedUsableCandidate = results.filter(
    (entry) => entry.hasAutomatedUsableCandidate,
  ).length;
  const reviewed = results.filter((entry) => entry.manualReview?.status === "complete");
  const reviewedUsable = reviewed.filter(
    (entry) => entry.manualReview?.hasUsableCandidate === true,
  ).length;
  const sumMetric = (name) => results.reduce(
    (sum, entry) => sum + (entry.metrics?.[name] ?? 0),
    0,
  );

  return {
    benchmarkVersion: metadata.benchmarkVersion ?? "unknown",
    generatedAt: metadata.generatedAt ?? new Date().toISOString(),
    summary: {
      totalBatches,
      totalCandidates,
      automatedPassCandidates,
      automatedCandidatePassRate: ratio(automatedPassCandidates, totalCandidates),
      batchesWithAutomatedUsableCandidate,
      automatedBatchSuccessRate: ratio(
        batchesWithAutomatedUsableCandidate,
        totalBatches,
      ),
      manualReviewCompletionRate: ratio(reviewed.length, totalBatches),
      reviewedBatchSuccessRate: ratio(reviewedUsable, reviewed.length),
    },
    failureReasons: {
      darkBackgroundCandidates: sumMetric("darkBackgroundCandidates"),
      clippingRiskCandidates: sumMetric("clippingRiskCandidates"),
      duplicateCandidates: sumMetric("duplicateCandidates"),
      decodeFailureCandidates: sumMetric("decodeFailureCandidates"),
    },
    results,
  };
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function formatMarkdownReport(report) {
  const lines = [
    "# Generation Quality Evaluation",
    "",
    `- Benchmark version: ${report.benchmarkVersion}`,
    `- Generated at: ${report.generatedAt}`,
    `- Four-candidate batches with at least one automated-pass result: **${percent(report.summary.automatedBatchSuccessRate)}**`,
    `- Candidate automated pass rate: **${percent(report.summary.automatedCandidatePassRate)}**`,
    `- Manual review completion: **${percent(report.summary.manualReviewCompletionRate)}**`,
    `- Reviewed batch success: **${percent(report.summary.reviewedBatchSuccessRate)}**`,
    "",
    "## Failure Signals",
    "",
    `- Dark backgrounds: ${report.failureReasons.darkBackgroundCandidates}`,
    `- Clipping risks: ${report.failureReasons.clippingRiskCandidates}`,
    `- Duplicate candidates: ${report.failureReasons.duplicateCandidates}`,
    `- Decode failures: ${report.failureReasons.decodeFailureCandidates}`,
    "",
    "## Cases",
    "",
    "| Case | Category | Automated usable | Passed candidates | Manual usable |",
    "| --- | --- | --- | ---: | --- |",
  ];

  for (const result of report.results) {
    const manual = result.manualReview?.status === "complete"
      ? String(result.manualReview.hasUsableCandidate)
      : "not reviewed";
    lines.push(
      `| ${result.caseId} | ${result.category ?? ""} | ${result.hasAutomatedUsableCandidate ? "yes" : "no"} | ${result.metrics?.automatedPassCandidates ?? 0}/${result.metrics?.totalCandidates ?? 0} | ${manual} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

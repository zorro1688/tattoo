import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

import { sanitizeManifestForReport } from "../scripts/evaluate-generation-quality.mjs";
const root = await mkdtemp(path.join(tmpdir(), "inkfirst-quality-"));
const imagesDir = path.join(root, "images");
const outputDir = path.join(root, "reports");
await import("node:fs/promises").then(({ mkdir }) => mkdir(imagesDir));

async function createImage(name, background, foreground) {
  const target = path.join(imagesDir, name);
  await sharp({
    create: {
      width: 640,
      height: 640,
      channels: 3,
      background,
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="320" height="420" xmlns="http://www.w3.org/2000/svg"><ellipse cx="160" cy="210" rx="140" ry="190" fill="' + foreground + '"/></svg>',
        ),
        left: 160,
        top: 110,
      },
    ])
    .png()
    .toFile(target);
  return target;
}

const clean = await createImage("clean.png", "#ffffff", "#111111");
const dark = await createImage("dark.png", "#000000", "#ffffff");
const manifestPath = path.join(root, "manifest.json");
await writeFile(
  manifestPath,
  JSON.stringify({
    benchmarkVersion: "test-v1",
    runs: [
      {
        caseId: "animal-wolf-portrait",
        category: "animal",
        input: { idea: "wolf portrait" },
        candidates: [
          clean,
          clean,
          dark,
          `http://127.0.0.1:9/candidate.png?token=secret-value`,
        ],
      },
    ],
  }),
);

const result = spawnSync(
  process.execPath,
  [
    "scripts/evaluate-generation-quality.mjs",
    "--manifest",
    manifestPath,
    "--output-dir",
    outputDir,
  ],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  },
);

assert.equal(result.status, 0, result.stderr);
const files = await readdir(outputDir);
const jsonName = files.find((name) => name.endsWith(".json"));
const markdownName = files.find((name) => name.endsWith(".md"));
assert.ok(jsonName);
assert.ok(markdownName);

const report = JSON.parse(await readFile(path.join(outputDir, jsonName), "utf8"));
assert.equal(report.benchmarkVersion, "test-v1");
assert.equal(report.summary.totalBatches, 1);
assert.equal(
  report.results[0].candidates[0].source,
  "local/clean.png",
);
assert.equal(report.results[0].candidates.length, 4);
assert.equal(
  report.results[0].candidates[3].source,
  "http://127.0.0.1:9/candidate.png",
);
assert.equal(JSON.stringify(report).includes("secret-value"), false);

const markdown = await readFile(path.join(outputDir, markdownName), "utf8");
assert.match(markdown, /Generation Quality Evaluation/);
assert.match(result.stdout, /Quality report written/);
const safeManifest = sanitizeManifestForReport({
  benchmarkVersion: "test-v1",
  runs: [
    {
      caseId: "animal-wolf-portrait",
      candidates: [
        "https://storage.example.com/wolf.png?token=private-value",
      ],
    },
  ],
});
assert.equal(
  safeManifest.runs[0].candidates[0],
  "https://storage.example.com/wolf.png",
);
assert.equal(
  JSON.stringify(safeManifest).includes("private-value"),
  false,
);


console.log("Quality evaluation CLI tests passed.");

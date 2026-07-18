# Generation Quality Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable benchmark that scores four generated concept candidates and reports whether each prompt has at least one usable result.

**Architecture:** A focused core module analyzes individual image buffers and aggregates candidate batches. A versioned prompt manifest defines the benchmark, while a CLI evaluates saved manifests or explicitly generates a live run before producing JSON and Markdown reports.

**Tech Stack:** Node.js ESM, Sharp, existing Replicate generation core, JSON manifests, Node assertion tests.

## Global Constraints

- Live provider calls must require an explicit `--generate` flag.
- Automated rules must not claim to detect anatomy or semantic consistency.
- Reports must not include API tokens, signed URL query strings, or user identifiers.
- Four-candidate batch success is the primary KPI.

---

### Task 1: Fixed Benchmark Dataset

**Files:**
- Create: `quality-evaluation/prompts.json`
- Create: `tests/quality-evaluation-dataset.test.mjs`

**Interfaces:**
- Produces: versioned array of cases with `id`, `category`, `input`, `expectedElements`, and `forbiddenElements`.

- [ ] Write a failing test requiring animal, plant, lettering, and geometric coverage and unique IDs.
- [ ] Run `node tests/quality-evaluation-dataset.test.mjs` and verify it fails because the dataset does not exist.
- [ ] Add twelve fixed cases, three per category.
- [ ] Run the dataset test and verify it passes.

### Task 2: Candidate Image Analysis

**Files:**
- Create: `quality-evaluation-core.mjs`
- Create: `tests/quality-evaluation-core.test.mjs`

**Interfaces:**
- Produces: `analyzeCandidate(buffer, options)` and `evaluateBatch(run, options)`.

- [ ] Write failing tests using generated Sharp fixtures for valid white background, dark background, edge clipping, and duplicates.
- [ ] Run `node tests/quality-evaluation-core.test.mjs` and verify missing exports fail.
- [ ] Implement image decode, luminance sampling, foreground bounds, edge margin, and compact perceptual signature.
- [ ] Implement four-candidate aggregation and the at-least-one-usable KPI.
- [ ] Run the focused test and verify it passes.

### Task 3: Report Generation

**Files:**
- Modify: `quality-evaluation-core.mjs`
- Modify: `tests/quality-evaluation-core.test.mjs`

**Interfaces:**
- Produces: `summarizeEvaluation(results)` and `formatMarkdownReport(report)`.

- [ ] Write failing assertions for pass rates, failure reason counts, manual review completion, and Markdown KPI output.
- [ ] Run the focused test and verify the new assertions fail.
- [ ] Implement deterministic summary and Markdown formatting.
- [ ] Verify the focused test passes.

### Task 4: Evaluation CLI

**Files:**
- Create: `scripts/evaluate-generation-quality.mjs`
- Create: `tests/quality-evaluation-cli.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: an existing run manifest or `--generate`.
- Produces: `quality-reports/<timestamp>-generation-quality.json` and matching Markdown.

- [ ] Write a failing CLI test against local fixture images.
- [ ] Run the CLI test and verify it fails because the script is missing.
- [ ] Implement manifest loading, local/HTTP image loading, sanitized references, report paths, and nonzero exit on invalid input.
- [ ] Add explicit live-generation mode using the existing generation provider.
- [ ] Verify the CLI test passes.

### Task 5: Project Integration

**Files:**
- Modify: `package.json`
- Modify: `scripts/regression-check.mjs`
- Modify: `docs/production-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run test:quality` and `npm run eval:quality`.

- [ ] Write a failing setup test requiring both commands and regression coverage.
- [ ] Add scripts and documentation with safe example commands.
- [ ] Run focused quality tests, `npm run test:regression`, and `npm run build`.


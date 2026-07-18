# Production Error Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe production error tracing for generation, Storage, Linework, and downloads.

**Architecture:** A shared server-only monitoring module creates request IDs, hashes owner IDs, scrubs errors, writes structured Vercel JSON logs, and optionally sends events to a configured webhook. Route and persistence code supplies only allowlisted identifiers and stage information.

**Tech Stack:** Node.js crypto, Next.js App Router, Vercel Runtime Logs, optional HTTPS webhook, existing Node test scripts.

## Global Constraints

- Monitoring must never cause a product request to fail.
- Do not log prompts, image URLs, emails, request bodies, payment payloads, cookies, authorization headers, or secrets.
- User and anonymous owner IDs must be hashed before logging or webhook delivery.
- Production behavior must work without installing another dependency.

---

### Task 1: Monitoring core

**Files:**
- Create: `monitoring-core.mjs`
- Create: `tests/monitoring-core.test.mjs`

**Interfaces:**
- Produces: `createRequestId(request)`, `hashOwnerId(ownerId)`, `buildErrorEvent(input)`, and `reportError(input, options)`.

- [ ] Write tests for deterministic owner hashing, context allowlisting, secret scrubbing, JSON logging, webhook delivery, timeout behavior, and swallowed delivery errors.
- [ ] Run `node tests/monitoring-core.test.mjs` and verify it fails because the module is missing.
- [ ] Implement the minimal monitoring core with `crypto.randomUUID`, `createHash`, one-line JSON logs, an AbortController timeout, and optional bearer authentication.
- [ ] Run the monitoring test and verify it passes.
- [ ] Commit the monitoring core and tests.

### Task 2: Generation and Linework routes

**Files:**
- Modify: `app/api/generate/route.js`
- Modify: `app/api/generate/linework/route.js`
- Modify: `server.mjs`
- Create: `tests/monitoring-routes.test.mjs`

**Interfaces:**
- Consumes: `createRequestId` and `reportError` from `monitoring-core.mjs`.
- Produces: `X-Request-Id` on all generation responses and structured provider/route failure events.

- [ ] Write failing tests that require request IDs and monitored provider and route failures.
- [ ] Instrument Concept and Linework routes without recording request bodies or prompt text.
- [ ] Keep static-server parity for local verification.
- [ ] Run route monitoring and existing generation tests.
- [ ] Commit route instrumentation.

### Task 3: Storage persistence and downloads

**Files:**
- Modify: `supabase-store.mjs`
- Modify: `app/api/download/route.js`
- Modify: `server.mjs`
- Create: `tests/monitoring-storage-download.test.mjs`

**Interfaces:**
- Consumes: `reportError` with `stage`, generation IDs, owner IDs, provider IDs, and retryability.
- Produces: distinct events for Storage upload, persistence verification, and download server failures.

- [ ] Write failing tests for Storage and Download instrumentation.
- [ ] Wrap monitored persistence stages while preserving the original thrown error.
- [ ] Report only Download failures with status `>= 500`.
- [ ] Run monitoring, Supabase, quota, and download tests.
- [ ] Commit persistence and download instrumentation.

### Task 4: Production configuration and verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/production-deployment-checklist.md`
- Modify: `scripts/regression-check.mjs`
- Modify: `tests/production-setup.test.mjs`

**Interfaces:**
- Documents optional `ERROR_MONITOR_WEBHOOK_URL`, `ERROR_MONITOR_WEBHOOK_TOKEN`, and `ERROR_MONITOR_TIMEOUT_MS`.

- [ ] Add configuration and privacy documentation tests.
- [ ] Document Vercel Runtime Logs as the default destination and external Webhook as optional.
- [ ] Add the new monitoring tests to regression execution.
- [ ] Run `npm run test:regression`, `npm run build`, and `git diff --check`.
- [ ] Commit documentation and verification changes.

# Generation Status and Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Concept and Linework consistent `generating`, `saving`, `ready`, and `failed` behavior across the homepage and design detail page, with safe retries and no premature downloads.

**Architecture:** A small browser-compatible state module derives durable readiness from saved asset URLs and combines it with page-owned transient request phases. Existing synchronous Next.js and static-server endpoints remain unchanged in shape, but only return success after persistence completes; UI actions consume the normalized state instead of separate booleans.

**Tech Stack:** Next.js 15 App Router, vanilla browser JavaScript, Node.js ESM tests, Supabase Storage/Postgres, Replicate.

## Global Constraints

- Keep synchronous Replicate requests; do not add queues or prediction polling.
- `ready` requires a durable saved asset URL.
- Provider, Storage, and persistence failures remain retryable and must not consume a credit.
- Refresh restores terminal state only; an interrupted request becomes retryable.
- Keep root and `public/` browser assets behaviorally identical.
- Do not add a database migration unless an existing terminal status cannot be represented.

---

### Task 1: Shared Generation State Normalization

**Files:**
- Create: `generation-state.js`
- Create: `public/generation-state.js`
- Modify: `index.html`
- Modify: `design.html`
- Modify: `app/page.tsx`
- Modify: `app/design/page.tsx`
- Test: `tests/generation-state.test.mjs`

**Interfaces:**
- Produces: `window.InkFirstGenerationState.resolveAssetState({ phase, assetUrl, failed, defaultAsset }) -> "idle" | "not_generated" | "generating" | "saving" | "ready" | "failed"`.
- Produces: `window.InkFirstGenerationState.isBusy(state) -> boolean`.
- Consumes: asset URL strings and transient page state only.

- [ ] **Step 1: Write the failing state-module test**

```js
assert.equal(resolveAssetState({ phase: "generating" }), "generating");
assert.equal(resolveAssetState({ phase: "saving" }), "saving");
assert.equal(resolveAssetState({ assetUrl: "https://storage/concept.png" }), "ready");
assert.equal(resolveAssetState({ failed: true }), "failed");
assert.equal(resolveAssetState({ assetUrl: "/assets/default-linework.png", defaultAsset: "/assets/default-linework.png" }), "not_generated");
assert.equal(isBusy("generating"), true);
assert.equal(isBusy("saving"), true);
assert.equal(isBusy("ready"), false);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/generation-state.test.mjs`

Expected: FAIL because `generation-state.js` does not exist or does not export the required global API.

- [ ] **Step 3: Implement the minimal browser-compatible state module**

```js
(function exposeGenerationState(globalScope) {
  function normalizePath(value = "") {
    return String(value).replace(/^\/+/, "");
  }

  function resolveAssetState({ phase = "", assetUrl = "", failed = false, defaultAsset = "", emptyState = "not_generated" } = {}) {
    if (phase === "generating" || phase === "saving") return phase;
    if (assetUrl && (!defaultAsset || normalizePath(assetUrl) !== normalizePath(defaultAsset))) return "ready";
    if (failed) return "failed";
    return emptyState;
  }

  function isBusy(state) {
    return state === "generating" || state === "saving";
  }

  globalScope.InkFirstGenerationState = { resolveAssetState, isBusy };
})(typeof window === "undefined" ? globalThis : window);
```

Load `/generation-state.js` before `script.js` and `design.js` in both static HTML and Next page components. Copy the same file to `public/generation-state.js`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tests/generation-state.test.mjs`

Expected: PASS for state priority, default assets, and busy detection.

- [ ] **Step 5: Commit**

```powershell
git add generation-state.js public/generation-state.js index.html design.html app/page.tsx app/design/page.tsx tests/generation-state.test.mjs
git commit -m "Add shared generation state normalization"
```

### Task 2: Homepage Concept Lifecycle and Safe Retry

**Files:**
- Modify: `script.js`
- Modify: `public/script.js`
- Test: `tests/hero-result-preview.test.mjs`
- Test: `tests/generation-status-ui.test.mjs`

**Interfaces:**
- Consumes: `InkFirstGenerationState.resolveAssetState` and `isBusy` from Task 1.
- Produces: `conceptPhase` values `idle | generating | saving | ready | failed` and a rendered state that disables candidate selection, generation, download, and Linework actions while busy.

- [ ] **Step 1: Write failing tests for Concept phases and duplicate-click protection**

```js
assert.match(script, /let conceptPhase = "idle"/);
assert.match(script, /conceptPhase = "generating"/);
assert.match(script, /conceptPhase = "saving"/);
assert.match(script, /conceptPhase = "ready"/);
assert.match(script, /conceptPhase = "failed"/);
assert.match(script, /if \(isGenerationBusy\(\)\) \{\s*return;\s*\}/);
assert.match(script, /Saving your designs\.\.\./);
assert.match(script, /candidate\.disabled = conceptBusy/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/generation-status-ui.test.mjs`

Expected: FAIL because the homepage still uses only `isGenerating` and has no saving phase.

- [ ] **Step 3: Implement the Concept lifecycle**

At request start set `conceptPhase = "generating"`. After the provider response is accepted but before applying saved response data set `conceptPhase = "saving"` and render. Set `ready` only after `savedGenerationId` and a non-default Concept Storage URL are present. On catch set `failed`; in finally retain the terminal phase rather than clearing it.

Use the normalized busy state in `generate`, `regenerateConcept`, candidate buttons, `downloadConceptButton`, `heroLineworkAction`, and `generateButton`. Render `Generating your tattoo...`, `Saving your designs...`, or the retry message from the phase.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node tests/generation-status-ui.test.mjs`

Run: `node tests/hero-result-preview.test.mjs`

Expected: PASS; existing selected-candidate persistence protection remains intact.

- [ ] **Step 5: Commit**

```powershell
git add script.js public/script.js tests/generation-status-ui.test.mjs tests/hero-result-preview.test.mjs
git commit -m "Add homepage concept lifecycle states"
```

### Task 3: Linework Lifecycle and Detail-Page Restoration

**Files:**
- Modify: `script.js`
- Modify: `public/script.js`
- Modify: `design.js`
- Modify: `public/design.js`
- Test: `tests/generation-status-ui.test.mjs`
- Test: `tests/design-detail-page.test.mjs`
- Test: `tests/my-designs-linework.test.mjs`

**Interfaces:**
- Consumes: saved `generation.images.linework`, transient `lineworkPhase`, and shared state normalization.
- Produces: consistent Linework `not_generated | generating | saving | ready | failed` UI on homepage and detail page.

- [ ] **Step 1: Write failing tests for Linework saving, restoration, and retry**

```js
assert.match(homeScript, /let lineworkPhase = "not_generated"/);
assert.match(homeScript, /lineworkPhase = "saving"/);
assert.match(homeScript, /Saving linework\.\.\./);
assert.match(detailScript, /let lineworkPhase = "not_generated"/);
assert.match(detailScript, /resolveAssetState\(\{[\s\S]*assetUrl: design\.images\?\.linework/);
assert.match(detailScript, /lineworkPhase = "failed"/);
assert.match(detailScript, /Try linework again/);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/generation-status-ui.test.mjs`

Run: `node tests/design-detail-page.test.mjs`

Expected: FAIL because Linework has only a generating boolean and detail state is inferred independently.

- [ ] **Step 3: Implement normalized Linework behavior**

Set `lineworkPhase` to `generating` before the request, `saving` after a successful response begins applying persisted generation data, and `ready` only when the returned saved generation includes a non-default Linework URL. Set `failed` on errors and change the action copy to `Try linework again`.

On `renderDesign`, derive the terminal phase from `currentDesign.images.linework`; asset presence wins over stale status. A retry must clear only the Linework error and retain the Concept and placement. Disable duplicate requests using `isBusy(lineworkPhase)`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node tests/generation-status-ui.test.mjs`

Run: `node tests/design-detail-page.test.mjs`

Run: `node tests/my-designs-linework.test.mjs`

Expected: PASS; a saved Linework asset reloads as ready and a failed request exposes one retry action.

- [ ] **Step 5: Commit**

```powershell
git add script.js public/script.js design.js public/design.js tests/generation-status-ui.test.mjs tests/design-detail-page.test.mjs tests/my-designs-linework.test.mjs
git commit -m "Unify linework status and retry behavior"
```

### Task 4: Server Persistence and Credit Failure Boundaries

**Files:**
- Modify: `app/api/generate/route.js`
- Modify: `app/api/generate/linework/route.js`
- Modify: `server.mjs`
- Modify: `quota-store.mjs`
- Test: `tests/generation-core.test.mjs`
- Test: `tests/quota-store.test.mjs`
- Test: `tests/generation-status-api.test.mjs`

**Interfaces:**
- Produces: success responses containing a durable saved generation and updated quota.
- Guarantees: no credit decrement when provider generation or durable persistence fails.

- [ ] **Step 1: Write failing API boundary tests**

```js
assert.match(generateRoute, /savedGenerationId: saved\.generation\.id/);
assert.match(generateRoute, /status: "ready"/);
assert.match(lineworkRoute, /generation: updated\.generation/);
assert.match(lineworkRoute, /lineworkStatus: "ready"/);
assert.match(staticServer, /lineworkStatus: "ready"/);
```

Add a quota-store behavioral test that supplies a persistence function which throws and asserts `totalRemaining` is unchanged.

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/generation-status-api.test.mjs`

Run: `node tests/quota-store.test.mjs`

Expected: FAIL because terminal response status and rollback behavior are not yet explicit.

- [ ] **Step 3: Implement minimal terminal response and rollback behavior**

Return `status: "ready"` only after `consumeGenerationCredit` or `consumeLineworkCredit` completes. If persistence throws, propagate a 500 error with a retry-safe message and leave quota unchanged. Apply identical response fields in `server.mjs`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node tests/generation-status-api.test.mjs`

Run: `node tests/quota-store.test.mjs`

Run: `node tests/generation-core.test.mjs`

Expected: PASS with unchanged quota on failed operations.

- [ ] **Step 5: Commit**

```powershell
git add app/api/generate/route.js app/api/generate/linework/route.js server.mjs quota-store.mjs tests/generation-status-api.test.mjs tests/generation-core.test.mjs tests/quota-store.test.mjs
git commit -m "Protect generation persistence and credit states"
```

### Task 5: Full Verification and Documentation Sync

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: all tasks.
- Produces: verified homepage, detail-page, API, and local/production parity.

- [ ] **Step 1: Run syntax and focused status tests**

```powershell
node --check generation-state.js
node --check script.js
node --check design.js
node --check server.mjs
node tests/generation-state.test.mjs
node tests/generation-status-ui.test.mjs
node tests/generation-status-api.test.mjs
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the existing regression suite**

Run: `npm run test:regression`

Expected: all regression checks pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: Next.js build completes and all routes compile.

- [ ] **Step 4: Review the diff for duplicated or unrelated changes**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors and only planned files changed.

- [ ] **Step 5: Commit final verification fixes if required**

```powershell
git add <only-files-changed-by-verification>
git commit -m "Verify generation status and retry flow"
```

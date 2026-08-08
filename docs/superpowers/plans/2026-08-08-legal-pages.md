# InkFirst Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish clear public Privacy Policy, Terms of Service, and Refund Policy pages; connect them from the footer; and repair the malformed copyright symbol.

**Architecture:** Keep the existing static-markup-with-Next-wrapper pattern: each legal page has a standalone HTML source for the static server and a small Next App Router page that reads and renders that source. Share a small legal-page visual language in the existing global styles. The existing landing footer becomes the single source of visible legal links.

**Tech Stack:** Next.js 15 App Router, static HTML, CSS, Node assertion tests, Vercel.

## Global Constraints

- The operator is an individual; do not invent a company name, address, operating country, data-retention period, or self-service deletion feature.
- Support and data deletion requests use `hello@inkfirst.ai`.
- Credits, download access, and subscriptions are immediate digital services and are generally non-refundable after payment, except where mandatory law applies.
- Generated designs are creative references only; they are not tattooing, medical, safety, or professional-artistry guarantees.
- Use `&copy;` in static HTML for the footer copyright symbol.
- Legal copy is general product information, not legal advice or jurisdiction-specific legal compliance advice.

---

### Task 1: Add public legal-page structure and complete product-specific copy

**Files:**
- Create: `privacy.html`
- Create: `terms.html`
- Create: `refunds.html`
- Create: `app/privacy/page.tsx`
- Create: `app/terms/page.tsx`
- Create: `app/refunds/page.tsx`
- Modify: `server.mjs`
- Test: `tests/legal-pages.test.mjs`

**Interfaces:**
- Consumes: the static-page wrapper pattern used by `app/billing/page.tsx` and the `site-footer` styles.
- Produces: public `GET /privacy`, `GET /terms`, and `GET /refunds` routes in both the Next and static runtimes.

- [ ] **Step 1: Write the failing route-and-content test**

```js
for (const [htmlFile, route, heading] of [
  ["privacy.html", "/privacy", "Privacy Policy"],
  ["terms.html", "/terms", "Terms of Service"],
  ["refunds.html", "/refunds", "Refund Policy"]
]) {
  const html = await readFile(htmlFile, "utf8");
  assert.match(html, new RegExp(`<title>${heading} \\| InkFirst</title>`));
  assert.match(html, new RegExp(`<h1>${heading}</h1>`));
  assert.match(html, /Last updated: August 8, 2026/);
  assert.match(html, /hello@inkfirst\.ai/);
  assert.match(server, new RegExp(`url\\.pathname === "${route}"`));
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/legal-pages.test.mjs`

Expected: FAIL because the HTML files and routes do not exist.

- [ ] **Step 3: Create the three HTML documents with exact product commitments**

```html
<main class="legal-page">
  <a class="legal-brand" href="/">InkFirst</a>
  <p class="legal-kicker">Legal</p>
  <h1>Privacy Policy</h1>
  <p class="legal-updated">Last updated: August 8, 2026</p>
  <!-- Product-specific sections follow. -->
</main>
```

Privacy sections must cover data InkFirst processes (account details, anonymous identifier, prompts, generated images, placement settings, entitlement and safe payment-history data), product providers (Supabase, Vercel, Replicate, Google OAuth, Creem), service purpose, security, email-based access/correction/deletion requests, and non-sale of personal data.

Terms sections must cover individual operation, acceptance, account responsibility, acceptable use, ownership/creative-reference limits, no professional tattooing/medical/safety advice, third-party services, availability, termination, and the refund-policy link.

Refund sections must state immediate digital-service delivery, no refund after payment except mandatory law, review of duplicate charges, technical errors, or non-delivery through support, and that refunds do not restore already-used credits or downloads where law permits.

- [ ] **Step 4: Add Next and static-server route wrappers**

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";

export default function PrivacyPage() {
  const html = readFileSync(join(process.cwd(), "privacy.html"), "utf8");
  const body = html.match(/<body>([\\s\\S]*?)<\\/body>/i)?.[1] ?? "";
  return <div dangerouslySetInnerHTML={{ __html: body.trim() }} />;
}
```

Add matching `terms` and `refunds` wrappers, and static-server branches that serve the corresponding HTML with `text/html`.

- [ ] **Step 5: Run the legal-page test to verify it passes**

Run: `node tests/legal-pages.test.mjs`

Expected: PASS for all three routes and all required product-specific content.

- [ ] **Step 6: Commit the route and content deliverable**

```bash
git add privacy.html terms.html refunds.html app/privacy/page.tsx app/terms/page.tsx app/refunds/page.tsx server.mjs tests/legal-pages.test.mjs
git commit -m "Add InkFirst legal pages"
```

### Task 2: Wire the landing footer and legal-page presentation

**Files:**
- Modify: `index.html`
- Modify: `app/globals.css`
- Modify: `styles.css`
- Modify: `tests/legal-pages.test.mjs`

**Interfaces:**
- Consumes: Task 1 public routes.
- Produces: footer navigation to the three live legal pages and responsive legal-page styling in both app and static stylesheets.

- [ ] **Step 1: Extend the failing footer test**

```js
const home = await readFile("index.html", "utf8");
assert.match(home, /href="\/privacy">Privacy Policy<\/a>/);
assert.match(home, /href="\/terms">Terms of Service<\/a>/);
assert.match(home, /href="\/refunds">Refund Policy<\/a>/);
assert.match(home, /&copy; 2026 InkFirst\. All rights reserved\./);
assert.doesNotMatch(home, /\? 2026 InkFirst/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/legal-pages.test.mjs`

Expected: FAIL because the current links target `#faq` and the copyright starts with `?`.

- [ ] **Step 3: Implement footer targets and responsive page styles**

Replace the Legal footer links with `/privacy`, `/terms`, and `/refunds`, add the Refund Policy entry, and change the footer line to `&copy; 2026 InkFirst. All rights reserved.`.

Add equivalent `.legal-page`, `.legal-brand`, `.legal-kicker`, `.legal-updated`, `.legal-section`, and `.legal-page a` rules to `app/globals.css` and `styles.css`. The page must have a readable centered column, dark text, white cards or sections, usable link contrast, and mobile padding at `max-width: 720px`.

- [ ] **Step 4: Run the footer and responsive-style test to verify it passes**

```js
for (const cssFile of ["app/globals.css", "styles.css"]) {
  const css = await readFile(cssFile, "utf8");
  assert.match(css, /\.legal-page/);
  assert.match(css, /max-width:\s*720px[\s\S]*\.legal-page/);
}
```

Run: `node tests/legal-pages.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the footer and styling deliverable**

```bash
git add index.html app/globals.css styles.css tests/legal-pages.test.mjs
git commit -m "Link footer legal pages"
```

### Task 3: Verify production readiness and publish

**Files:**
- Verify: `tests/legal-pages.test.mjs`
- Verify: `tests/regression-checklist.test.mjs`
- Verify: `app/globals.css`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a deployed legal-navigation experience at the formal InkFirst URL.

- [ ] **Step 1: Run focused and regression checks**

Run:

```bash
node tests/legal-pages.test.mjs
node tests/regression-checklist.test.mjs
npm run build
```

Expected: each command exits with status 0; the build may retain the known multiple-lockfile warning but must not have compilation or type errors.

- [ ] **Step 2: Inspect the final diff and working tree**

Run:

```bash
git diff --check HEAD~2..HEAD
git status -sb
```

Expected: no whitespace errors; do not stage `.playwright-cli/` or `.superpowers/`.

- [ ] **Step 3: Push and deploy to the actual production project**

```bash
git push -u origin codex/generation-quality-evaluation
npx vercel deploy --prod --yes --scope team_b01ErEG77KKdE8hFLLG2WSAU
```

Expected: deployment aliases `https://tattoo-pink.vercel.app` and reaches READY status.

- [ ] **Step 4: Confirm the user-facing routes**

Open `/privacy`, `/terms`, `/refunds`, and the landing-page footer at desktop and mobile widths. Confirm all three links load, the support email is clickable, the copyright symbol renders correctly, and no page claims a company address, local jurisdiction, or self-service account deletion.

- [ ] **Step 5: Handle any production-only finding as a new focused fix**

If the browser verification reveals a defect, add a focused red-green task for that defect before making or committing its correction. Otherwise, do not create an extra verification-only commit.


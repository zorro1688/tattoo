# First Tattoo Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Publish four useful, search-discoverable English guides for first-time tattoo customers and connect them to InkFirst's generator.

**Architecture:** Store the guide registry in one ESM module so Next metadata, static sitemap output, and content tests share the same URLs and SEO data. Keep complete guide bodies as static HTML documents, following the legal-page pattern, and use one Next dynamic route wrapper plus explicit static-server slug mapping to render the same paths in both runtimes.

**Tech Stack:** Next.js 15 App Router, static HTML/CSS, Node ESM, Node assertion tests.

## Global Constraints

- URLs: \`/guides/first-tattoo-ideas\`, \`/guides/small-first-tattoo-ideas\`, \`/guides/first-tattoo-placement\`, and \`/guides/first-tattoo-size\`.
- Every guide is English; it has one H1 matching its primary keyword and contains no medical, pain, aftercare, or professional-tattooing advice.
- Every guide has six planning directions, three copyable prompts, a \`/#generator\` CTA, related-guide links, and the qualified-artist creative-reference notice.
- Use \`https://tattoo-pink.vercel.app\` for static sitemap and canonical metadata.
- Do not include \`.playwright-cli/\` or \`.superpowers/\` in any commit.

---

### Task 1: Create guide content and dual-runtime routes

**Files:**
- Create: \`guide-catalog.mjs\`
- Create: \`guides/first-tattoo-ideas.html\`
- Create: \`guides/small-first-tattoo-ideas.html\`
- Create: \`guides/first-tattoo-placement.html\`
- Create: \`guides/first-tattoo-size.html\`
- Create: \`app/guides/[slug]/page.tsx\`
- Modify: \`server.mjs\`
- Test: \`tests/first-tattoo-guides.test.mjs\`

**Interfaces:**
- \`guide-catalog.mjs\` exports \`siteUrl\`, \`guideSlugs\`, and \`guidesBySlug\`; every entry has \`slug\`, \`url\`, \`title\`, \`description\`, \`primaryKeyword\`, and \`htmlFile\`.
- Next \`generateMetadata({ params })\` uses \`guidesBySlug[slug]\`; unknown slugs call \`notFound()\`.
- Static \`server.mjs\` accepts only \`guideSlugs\` and maps \`/guides/<slug>\` to \`guides/<slug>.html\`.

- [ ] **Step 1: Write the failing guide contract test**

\`\`\`js
const required = [
  ["first-tattoo-ideas", "first tattoo ideas"],
  ["small-first-tattoo-ideas", "small first tattoo ideas"],
  ["first-tattoo-placement", "first tattoo placement"],
  ["first-tattoo-size", "first tattoo size"]
];

for (const [slug, keyword] of required) {
  const html = await readFile(\`guides/\${slug}.html\`, "utf8");
  assert.match(html, new RegExp(\`<h1>\${keyword}</h1>\`, "i"));
  assert.equal((html.match(/<h1\\b/gi) ?? []).length, 1);
  assert.equal((html.match(/data-guide-prompt=/g) ?? []).length, 3);
  assert.match(html, /href="\\/#generator"/);
  assert.match(html, /creative reference material/i);
  assert.match(html, /qualified tattoo artist/i);
}
\`\`\`

Also assert the registry's four exact URLs, \`siteUrl\`, static server \`guideSlugs\` allowlist, and the Next wrapper's \`generateMetadata\`, \`generateStaticParams\`, and \`notFound\` usage.

- [ ] **Step 2: Run the test to verify it fails**

Run: \`node tests/first-tattoo-guides.test.mjs\`

Expected: FAIL because the registry, guide documents, and routes do not exist.

- [ ] **Step 3: Add registry and static guide documents**

\`\`\`js
export const siteUrl = "https://tattoo-pink.vercel.app";
export const guideSlugs = [
  "first-tattoo-ideas",
  "small-first-tattoo-ideas",
  "first-tattoo-placement",
  "first-tattoo-size"
];
\`\`\`

Give every document a unique title, meta description, canonical URL, Open Graph title/description/url, and Article JSON-LD. Use these page-specific six-direction lists so the guides do not repeat one another:

- \`first-tattoo-ideas\`: personal symbols, nature motifs, animals, objects and hobbies, lettering, and abstract geometry.
- \`small-first-tattoo-ideas\`: single-line symbols, tiny botanicals, initials, small celestial motifs, micro animals, and compact abstract marks.
- \`first-tattoo-placement\`: visibility preference, body flow, future tattoo space, clothing coverage, design orientation, and artist consultation.
- \`first-tattoo-size\`: readable-detail threshold, placement area, lineweight allowance, distance visibility, future expansion, and artist sizing check.

For every page, use one prompt each for Fine Line, Minimalist, and Geometric styles. Each \`data-guide-prompt\` value includes the page's topic and primary keyword phrase. Add the four exact related-guide links to every page.

- [ ] **Step 4: Add Next and static route support and fix static legal routing**

\`\`\`tsx
export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guidesBySlug[slug];
  if (!guide) return {};
  return { title: guide.title, description: guide.description, alternates: { canonical: guide.url } };
}
\`\`\`

Read \`guides/<slug>.html\`, extract its body, and render it with \`dangerouslySetInnerHTML\`. Replace malformed literal \`\` \`r\`n \`\` text in \`server.mjs\` with valid nested branches for privacy, terms, refunds, and the four allowlisted guide paths. Never map arbitrary \`/guides/*\` paths to files.

- [ ] **Step 5: Run the guide contract test to verify it passes**

Run: \`node tests/first-tattoo-guides.test.mjs\`

Expected: PASS for every document, registry, Next wrapper, and static route allowlist.

- [ ] **Step 6: Commit the guide runtime deliverable**

\`\`\`bash
git add guide-catalog.mjs guides app/guides/[slug]/page.tsx server.mjs tests/first-tattoo-guides.test.mjs
git commit -m "Add first tattoo guide pages"
\`\`\`

### Task 2: Add homepage discovery and responsive presentation

**Files:**
- Modify: \`index.html\`
- Modify: \`app/globals.css\`
- Modify: \`styles.css\`
- Modify: \`tests/first-tattoo-guides.test.mjs\`

**Interfaces:**
- Consumes: the four guide URLs from Task 1.
- Produces: a four-card homepage guide section after \`#use-cases\`, top and footer links, and responsive guide presentation.

- [ ] **Step 1: Extend the failing homepage test**

\`\`\`js
assert.match(home, /<section class="guides-section" id="guides">/);
assert.ok(home.indexOf('id="use-cases"') < home.indexOf('id="guides"'));
assert.ok(home.indexOf('id="guides"') < home.indexOf('id="styles"'));
for (const slug of guideSlugs) {
  assert.match(home, new RegExp(\`href="/guides/\${slug}"\`));
}
assert.match(home, /href="#guides">Guides<\\/a>/);
assert.match(home, /href="\\/guides\\/first-tattoo-ideas">First Tattoo Guides<\\/a>/);
\`\`\`

Also assert both stylesheets contain \`.guides-section\`, \`.guides-grid\`, \`.guide-card\`, and a \`max-width: 720px\` rule that includes \`.guides-grid\`.

- [ ] **Step 2: Run the test to verify it fails**

Run: \`node tests/first-tattoo-guides.test.mjs\`

Expected: FAIL because the homepage has no guide section, guide navigation, or styles.

- [ ] **Step 3: Add homepage cards and navigation**

Insert after the closing \`#use-cases\` section and before \`#styles\`:

\`\`\`html
<section class="guides-section" id="guides">
  <div class="section-heading center">
    <span>First tattoo guides</span>
    <h2>Plan Your First Tattoo With More Confidence</h2>
    <p>Use these practical guides to narrow down an idea, size, and placement before you generate a reference.</p>
  </div>
  <div class="guides-grid">
    <a class="guide-card" href="/guides/first-tattoo-ideas"><span>01</span><h3>First Tattoo Ideas</h3><p>Find a meaningful starting point without overcomplicating your first design.</p></a>
    <a class="guide-card" href="/guides/small-first-tattoo-ideas"><span>02</span><h3>Small First Tattoo Ideas</h3><p>Explore subtle concepts that can stay clear at a smaller scale.</p></a>
    <a class="guide-card" href="/guides/first-tattoo-placement"><span>03</span><h3>First Tattoo Placement</h3><p>Match the design to visibility, body flow, and the placement preview.</p></a>
    <a class="guide-card" href="/guides/first-tattoo-size"><span>04</span><h3>First Tattoo Size</h3><p>Choose a size that gives the idea room to read clearly.</p></a>
  </div>
  <a class="secondary-button" href="/guides/first-tattoo-ideas">Explore all first tattoo guides</a>
</section>
\`\`\`

Add \`<a href="#guides">Guides</a>\` to top navigation and \`<a href="/guides/first-tattoo-ideas">First Tattoo Guides</a>\` to Resources footer.

- [ ] **Step 4: Add matching responsive styles**

Add matching guide-card and guide-page rules to both CSS files. Desktop uses a two-column guide grid; at \`max-width: 720px\`, it becomes one column with 32px horizontal page gutters and 20px card padding. The guide CTA uses the existing blue primary-button appearance.

- [ ] **Step 5: Run the homepage test to verify it passes**

Run: \`node tests/first-tattoo-guides.test.mjs\`

Expected: PASS for guide links, homepage placement, and responsive presentation rules.

- [ ] **Step 6: Commit the homepage discovery deliverable**

\`\`\`bash
git add index.html app/globals.css styles.css tests/first-tattoo-guides.test.mjs
git commit -m "Link first tattoo guides from homepage"
\`\`\`

### Task 3: Add crawl-discovery artifacts and verify both runtimes

**Files:**
- Create: \`robots.txt\`
- Create: \`sitemap.xml\`
- Create: \`app/robots.ts\`
- Create: \`app/sitemap.ts\`
- Modify: \`server.mjs\`
- Modify: \`tests/first-tattoo-guides.test.mjs\`

**Interfaces:**
- Consumes: \`siteUrl\` and \`guideSlugs\` from \`guide-catalog.mjs\`.
- Produces: \`/robots.txt\` and \`/sitemap.xml\` in Next and static mode, listing the homepage, four guides, and legal pages.

- [ ] **Step 1: Extend the failing SEO discovery test**

\`\`\`js
const sitemap = await readFile("sitemap.xml", "utf8");
const robots = await readFile("robots.txt", "utf8");
assert.match(robots, /Sitemap: https:\\/\\/tattoo-pink\\.vercel\\.app\\/sitemap\\.xml/);
for (const slug of guideSlugs) {
  assert.match(sitemap, new RegExp(\`<loc>https://tattoo-pink\\\\.vercel\\\\.app/guides/\${slug}</loc>\`));
}
assert.match(await readFile("app/robots.ts", "utf8"), /guideSlugs/);
assert.match(await readFile("app/sitemap.ts", "utf8"), /guideSlugs/);
\`\`\`

- [ ] **Step 2: Run the test to verify it fails**

Run: \`node tests/first-tattoo-guides.test.mjs\`

Expected: FAIL because sitemap and robots artifacts do not exist.

- [ ] **Step 3: Add static and Next discovery artifacts**

Create static \`robots.txt\` with \`User-agent: *\`, \`Allow: /\`, and the exact sitemap URL. Create static \`sitemap.xml\` with the homepage, four guide URLs, \`/privacy\`, \`/terms\`, and \`/refunds\`. Implement \`app/robots.ts\` and \`app/sitemap.ts\` as Next metadata routes importing \`siteUrl\` and \`guideSlugs\` and returning the same URL set. Add explicit static mappings for \`/robots.txt\` and \`/sitemap.xml\`.

- [ ] **Step 4: Run the SEO discovery test to verify it passes**

Run: \`node tests/first-tattoo-guides.test.mjs\`

Expected: PASS for static and Next discovery artifacts.

- [ ] **Step 5: Run final verification**

Run:

\`\`\`bash
node tests/first-tattoo-guides.test.mjs
node tests/legal-pages.test.mjs
npm run test:regression
npm run build
npm run dev:static
\`\`\`

Expected: all checks succeed. With the static server running, open \`/guides/first-tattoo-ideas\`, \`/guides/first-tattoo-placement\`, \`/robots.txt\`, and \`/sitemap.xml\`; verify HTTP 200, guide content, and valid discovery output.

- [ ] **Step 6: Commit the SEO discovery deliverable**

\`\`\`bash
git add robots.txt sitemap.xml app/robots.ts app/sitemap.ts server.mjs tests/first-tattoo-guides.test.mjs
git commit -m "Add guide sitemap and robots"
\`\`\`

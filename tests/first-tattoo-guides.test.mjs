import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";

const required = [
  ["first-tattoo-ideas", "first tattoo ideas"],
  ["small-first-tattoo-ideas", "small first tattoo ideas"],
  ["first-tattoo-placement", "first tattoo placement"],
  ["first-tattoo-size", "first tattoo size"]
];

const expectedSiteUrl = "https://www.inkfirsttattoo.art";
const expectedUrls = {
  "first-tattoo-ideas": "https://www.inkfirsttattoo.art/guides/first-tattoo-ideas",
  "small-first-tattoo-ideas": "https://www.inkfirsttattoo.art/guides/small-first-tattoo-ideas",
  "first-tattoo-placement": "https://www.inkfirsttattoo.art/guides/first-tattoo-placement",
  "first-tattoo-size": "https://www.inkfirsttattoo.art/guides/first-tattoo-size"
};

const {
  buildGuideArticleJsonLd,
  buildGuideMetadata,
  siteUrl,
  guideSlugs,
  guidesBySlug
} = await import("../guide-catalog.mjs");

assert.equal(siteUrl, expectedSiteUrl);
assert.deepEqual(guideSlugs, required.map(([slug]) => slug));

const expectedSitemapUrls = [
  siteUrl,
  ...guideSlugs.map((slug) => `${siteUrl}/guides/${slug}`),
  `${siteUrl}/privacy`,
  `${siteUrl}/terms`,
  `${siteUrl}/refunds`
];
const sitemap = await readFile("sitemap.xml", "utf8");
const robots = await readFile("robots.txt", "utf8");
assert.match(robots, new RegExp(`Sitemap: ${escapeRegExp(expectedSiteUrl)}/sitemap\\.xml`));
assert.doesNotMatch(`${sitemap}\n${robots}`, /tattoo-pink\.vercel\.app/);
assert.deepEqual(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]),
  expectedSitemapUrls
);
assert.match(await readFile("app/robots.ts", "utf8"), /guideSlugs/);
assert.match(await readFile("app/sitemap.ts", "utf8"), /guideSlugs/);

for (const [slug, keyword] of required) {
  const guide = guidesBySlug[slug];
  assert.ok(guide, `registry includes ${slug}`);
  assert.equal(guide.slug, slug);
  assert.equal(guide.url, expectedUrls[slug]);
  assert.ok(guide.title);
  assert.ok(guide.headline);
  assert.ok(guide.description);
  assert.equal(guide.primaryKeyword, keyword);
  assert.equal(guide.htmlFile, `guides/${slug}.html`);
  assert.equal(guide.prompts.length, 3);
  assert.equal(new Set(guide.prompts).size, 3);

  assert.deepEqual(buildGuideMetadata(guide), {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: guide.url },
    openGraph: {
      type: "article",
      title: guide.title,
      description: guide.description,
      url: guide.url,
      siteName: "InkFirst"
    }
  });
  assert.deepEqual(buildGuideArticleJsonLd(guide), {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.headline,
    description: guide.description,
    mainEntityOfPage: guide.url,
    publisher: {
      "@type": "Organization",
      name: "InkFirst",
      url: siteUrl
    }
  });

  const html = await readFile(`guides/${slug}.html`, "utf8");
  assert.match(html, new RegExp(`<link rel="canonical" href="${escapeRegExp(guide.url)}">`));
  assert.match(html, new RegExp(`<meta property="og:url" content="${escapeRegExp(guide.url)}">`));
  assert.match(html, new RegExp(`"mainEntityOfPage":"${escapeRegExp(guide.url)}"`));
  assert.match(html, new RegExp(`"url":"${escapeRegExp(siteUrl)}"`));
  assert.doesNotMatch(html, /tattoo-pink\.vercel\.app/);
  assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(html, /<body class="guide-body">/);
  assert.match(html, /<main class="guide-page">/);
  assert.match(html, new RegExp(`<h1>${keyword}</h1>`, "i"));
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1);
  assert.equal((html.match(/data-guide-prompt-value/g) ?? []).length, 3);
  assert.equal((html.match(/data-copy-guide-prompt/g) ?? []).length, 3);
  for (const prompt of guide.prompts) {
    assert.match(html, new RegExp(escapeRegExp(prompt)));
  }
  assert.match(html, /class="guide-primary-cta" href="\/#generator"/);
  assert.match(html, /Create your tattoo idea/);
  assert.match(html, /<script src="\/guide-prompts\.js" defer><\/script>/);
  assert.match(html, /creative reference material/i);
  assert.match(html, /qualified tattoo artist/i);
  assert.match(html, /<nav class="guide-related" aria-label="First Tattoo Guides">/);
  assert.doesNotMatch(html, /artist can (help adapt|assess|advise|make the final)/i);
  assert.doesNotMatch(html, /medical|pain|aftercare|healing|needle|machine|ink depth|guarantee/i);
}

const server = await readFile("server.mjs", "utf8");
assert.match(server, /guideSlugs\.includes\(guideSlug\)/);
assert.match(server, /join\("guides", `\$\{guideSlug\}` \+ "\.html"\)/);
assert.doesNotMatch(server, /url\.pathname\.startsWith\("\/guides\/"\)/);

const page = await readFile("app/guides/[slug]/page.tsx", "utf8");
assert.match(page, /export function generateStaticParams/);
assert.match(page, /export async function generateMetadata/);
assert.match(page, /notFound\(\)/);
assert.match(page, /guidesBySlug\[slug\]/);
const metadataFunction = page.slice(
  page.indexOf("export async function generateMetadata"),
  page.indexOf("export default async function GuidePage")
);
assert.match(metadataFunction, /if \(!guide\) notFound\(\);/);
assert.match(metadataFunction, /buildGuideMetadata\(guide\)/);
assert.match(page, /buildGuideArticleJsonLd\(guide\)/);
assert.match(page, /type="application\/ld\+json"/);
assert.match(page, /src="\/guide-prompts\.js"/);

const placementGuide = await readFile("guides/first-tattoo-placement.html", "utf8");
assert.match(placementGuide, /visibility preference/i);
assert.match(placementGuide, /body flow/i);
assert.match(placementGuide, /future tattoo space/i);
assert.match(placementGuide, /clothing coverage/i);
assert.match(placementGuide, /design orientation/i);
assert.doesNotMatch(placementGuide, /[\u2018\u2019]/);

const sizeGuide = await readFile("guides/first-tattoo-size.html", "utf8");
assert.match(sizeGuide, /readable detail/i);
assert.match(sizeGuide, /placement area/i);
assert.match(sizeGuide, /size preference/i);
assert.match(sizeGuide, /future design space/i);

const home = await readFile("index.html", "utf8");
assert.match(home, new RegExp(`<link rel="canonical" href="${escapeRegExp(expectedSiteUrl)}/"\\s*/>`));
assert.match(home, new RegExp(`<meta property="og:url" content="${escapeRegExp(expectedSiteUrl)}/"\\s*/>`));
assert.match(home, new RegExp(`"url": "${escapeRegExp(expectedSiteUrl)}"`));
assert.doesNotMatch(home, /tattoo-pink\.vercel\.app/);
assert.match(home, /<section class="guides-section" id="guides">/);
assert.ok(home.indexOf('id="use-cases"') < home.indexOf('id="guides"'));
assert.ok(home.indexOf('id="guides"') < home.indexOf('id="styles"'));
for (const slug of guideSlugs) {
  assert.match(home, new RegExp(`href="/guides/${slug}"`));
}
assert.match(home, /href="#guides">Guides<\/a>/);
assert.match(home, /href="\/guides\/first-tattoo-ideas">First Tattoo Guides<\/a>/);

for (const stylesheetPath of ["app/globals.css", "styles.css"]) {
  const stylesheet = await readFile(stylesheetPath, "utf8");
  for (const selector of [
    ".guides-section",
    ".guides-grid",
    ".guide-card",
    ".guide-page",
    ".guide-content-card",
    ".guide-prompt-grid",
    ".guide-prompt-card",
    ".guide-primary-cta",
    ".guide-related"
  ]) {
    assert.match(stylesheet, new RegExp(`\\${selector}`));
  }
  assert.match(stylesheet, /@media \(max-width: 720px\) \{[\s\S]*?\.guides-grid/);
  assert.match(stylesheet, /@media \(max-width: 720px\) \{[\s\S]*?\.guide-prompt-grid/);
}

const promptScript = await readFile("public/guide-prompts.js", "utf8");
assert.match(promptScript, /navigator\.clipboard\.writeText/);
assert.match(promptScript, /data-copy-guide-prompt/);
assert.match(promptScript, /data-guide-prompt-value/);

const layout = await readFile("app/layout.tsx", "utf8");
assert.match(layout, new RegExp(`metadataBase: new URL\\("${escapeRegExp(expectedSiteUrl)}"\\)`));

const appHome = await readFile("app/page.tsx", "utf8");
assert.match(appHome, new RegExp(`url: "${escapeRegExp(expectedSiteUrl)}"`));

const port = await reservePort();
const staticServer = spawn(process.execPath, ["server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(`http://127.0.0.1:${port}/guides/first-tattoo-ideas`);

  for (const slug of guideSlugs) {
    const response = await fetch(`http://127.0.0.1:${port}/guides/${slug}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    assert.match(html, /class="guide-prompt-grid"/);
    assert.match(html, /class="guide-primary-cta" href="\/#generator"/);
  }

  const stylesheetResponse = await fetch(`http://127.0.0.1:${port}/styles.css`);
  assert.equal(stylesheetResponse.status, 200);
  assert.match(stylesheetResponse.headers.get("content-type") ?? "", /text\/css/);

  const scriptResponse = await fetch(`http://127.0.0.1:${port}/guide-prompts.js`);
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get("content-type") ?? "", /text\/javascript/);

  const sitemapResponse = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
  assert.equal(sitemapResponse.status, 200);
  assert.deepEqual(
    [...(await sitemapResponse.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]),
    expectedSitemapUrls
  );

  const robotsResponse = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(robotsResponse.status, 200);
  assert.match(await robotsResponse.text(), new RegExp(`Sitemap: ${escapeRegExp(expectedSiteUrl)}/sitemap\\.xml`));

  const missingGuideResponse = await fetch(`http://127.0.0.1:${port}/guides/not-a-guide`);
  assert.equal(missingGuideResponse.status, 404);
} finally {
  staticServer.kill();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Static server did not start in time");
}

console.log("first tattoo guide contracts passed");

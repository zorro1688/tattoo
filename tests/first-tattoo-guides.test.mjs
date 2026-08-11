import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const required = [
  ["first-tattoo-ideas", "first tattoo ideas"],
  ["small-first-tattoo-ideas", "small first tattoo ideas"],
  ["first-tattoo-placement", "first tattoo placement"],
  ["first-tattoo-size", "first tattoo size"]
];

const expectedUrls = {
  "first-tattoo-ideas": "https://tattoo-pink.vercel.app/guides/first-tattoo-ideas",
  "small-first-tattoo-ideas": "https://tattoo-pink.vercel.app/guides/small-first-tattoo-ideas",
  "first-tattoo-placement": "https://tattoo-pink.vercel.app/guides/first-tattoo-placement",
  "first-tattoo-size": "https://tattoo-pink.vercel.app/guides/first-tattoo-size"
};

const { siteUrl, guideSlugs, guidesBySlug } = await import("../guide-catalog.mjs");

assert.equal(siteUrl, "https://tattoo-pink.vercel.app");
assert.deepEqual(guideSlugs, required.map(([slug]) => slug));

const sitemap = await readFile("sitemap.xml", "utf8");
const robots = await readFile("robots.txt", "utf8");
assert.match(robots, /Sitemap: https:\/\/tattoo-pink\.vercel\.app\/sitemap\.xml/);
for (const slug of guideSlugs) {
  assert.match(sitemap, new RegExp(`<loc>https://tattoo-pink\\.vercel\\.app/guides/${slug}</loc>`));
}
assert.match(await readFile("app/robots.ts", "utf8"), /guideSlugs/);
assert.match(await readFile("app/sitemap.ts", "utf8"), /guideSlugs/);

for (const [slug, keyword] of required) {
  const guide = guidesBySlug[slug];
  assert.ok(guide, `registry includes ${slug}`);
  assert.equal(guide.slug, slug);
  assert.equal(guide.url, expectedUrls[slug]);
  assert.ok(guide.title);
  assert.ok(guide.description);
  assert.equal(guide.primaryKeyword, keyword);
  assert.equal(guide.htmlFile, `guides/${slug}.html`);

  const html = await readFile(`guides/${slug}.html`, "utf8");
  assert.match(html, new RegExp(`<h1>${keyword}</h1>`, "i"));
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1);
  assert.equal((html.match(/data-guide-prompt=/g) ?? []).length, 3);
  assert.match(html, /href="\/#generator"/);
  assert.match(html, /creative reference material/i);
  assert.match(html, /qualified tattoo artist/i);
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
  for (const selector of [".guides-section", ".guides-grid", ".guide-card"]) {
    assert.match(stylesheet, new RegExp(`\\${selector}`));
  }
  assert.match(stylesheet, /@media \(max-width: 720px\) \{[\s\S]*?\.guides-grid/);
}

console.log("first tattoo guide contracts passed");

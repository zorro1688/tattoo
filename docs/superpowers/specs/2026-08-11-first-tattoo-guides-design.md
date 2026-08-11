# First Tattoo Guides Design

## Goal

Add four English, people-first long-tail guide pages that help first-time tattoo customers make a design, size, and placement decision, then lead them to InkFirst's generator.

## URLs and intent

- `/guides/first-tattoo-ideas` — general first tattoo ideas.
- `/guides/small-first-tattoo-ideas` — small, subtle first tattoo ideas.
- `/guides/first-tattoo-placement` — choosing a placement for a first tattoo.
- `/guides/first-tattoo-size` — matching tattoo size to a placement.

Each page uses its URL phrase as the primary keyword in the title and H1, with related long-tail questions appearing naturally in sections, FAQs, and example prompts. Pages must be written in English for a global audience and must not claim keyword volume or ranking results.

## Content and conversion

Each guide has a unique decision framework, six concrete design or planning directions, three copyable InkFirst prompts, a prominent generator CTA linking to `/#generator`, a related-guides section, and a short notice that output is creative reference material to discuss with a qualified tattoo artist.

Because no tattoo artist is reviewing the first release, guides must not give medical advice, pain ratings, aftercare advice, or make professional tattooing guarantees. They must not use fabricated expert attribution.

## Discovery and homepage

Add a "First Tattoo Guides" section after the existing "Who This AI Tattoo Generator Is For" section and before the style selector. It features four guide cards and a generator CTA. Add a footer guide link and a `<nav aria-label="First Tattoo Guides">` section to each guide for internal linking.

Add `robots.txt` and `sitemap.xml` with the homepage, the four guide URLs, and existing public legal URLs. The first release uses `https://tattoo-pink.vercel.app` as the sitemap base URL. Guide pages receive unique canonical, title, description, Open Graph data, and Article JSON-LD.

## Runtime compatibility

Implement guides in the Next App Router and make the same URLs work in `server.mjs` static mode. Correct the existing malformed legal-route literal text in `server.mjs` while adding guide routing.

## Acceptance

- All four guide pages render at their exact URLs in Next and static mode.
- Every page has one H1, its primary keyword in title/H1, unique description/canonical/Article JSON-LD, prompts, CTA, notice, and related-guide links.
- Homepage has the four-card guide section in the specified location.
- Sitemap and robots are discoverable and include the intended URLs.
- Tests cover routes, metadata/content contracts, homepage links, sitemap/robots, and malformed static route regression.

export const siteUrl = "https://www.inkfirsttattoo.art";

export const guideSlugs = [
  "first-tattoo-ideas",
  "small-first-tattoo-ideas",
  "first-tattoo-placement",
  "first-tattoo-size"
];

const guides = [
  {
    slug: "first-tattoo-ideas",
    title: "First Tattoo Ideas: A Practical Starting Point | InkFirst",
    headline: "First Tattoo Ideas: A Practical Starting Point",
    description: "Explore first tattoo ideas through symbols, motifs, lettering, and geometry before turning a concept into an artist conversation.",
    primaryKeyword: "first tattoo ideas",
    prompts: [
      "Fine Line first tattoo ideas with a personal symbol, clean delicate contour, creative reference material",
      "Minimalist first tattoo ideas using a nature motif, simple balanced composition, creative reference material",
      "Geometric first tattoo ideas with abstract geometry, precise balanced shapes, creative reference material"
    ]
  },
  {
    slug: "small-first-tattoo-ideas",
    title: "Small First Tattoo Ideas That Stay Personal | InkFirst",
    headline: "Small First Tattoo Ideas That Stay Personal",
    description: "Find small first tattoo ideas with clear, personal starting points that can be discussed with a qualified tattoo artist.",
    primaryKeyword: "small first tattoo ideas",
    prompts: [
      "Fine Line small first tattoo ideas with a tiny botanical, crisp restrained linework, creative reference material",
      "Minimalist small first tattoo ideas with a single-line symbol, compact clean composition, creative reference material",
      "Geometric small first tattoo ideas with a compact abstract mark, precise simple forms, creative reference material"
    ]
  },
  {
    slug: "first-tattoo-placement",
    title: "First Tattoo Placement: How to Choose a Spot | InkFirst",
    headline: "First Tattoo Placement: How to Choose a Spot",
    description: "Use visibility, body flow, clothing, and design orientation to narrow down first tattoo placement options.",
    primaryKeyword: "first tattoo placement",
    prompts: [
      "Fine Line first tattoo placement reference for inner arm body flow, delicate vertical composition, creative reference material",
      "Minimalist first tattoo placement reference for a low-visibility location, calm clear composition, creative reference material",
      "Geometric first tattoo placement reference following shoulder body flow, balanced orientation, creative reference material"
    ]
  },
  {
    slug: "first-tattoo-size",
    title: "First Tattoo Size: Choosing a Design That Reads Well | InkFirst",
    headline: "First Tattoo Size: Choosing a Design That Reads Well",
    description: "Plan first tattoo size around readable detail, placement area, visibility, and future design flexibility.",
    primaryKeyword: "first tattoo size",
    prompts: [
      "Fine Line first tattoo size reference with readable botanical detail at a moderate scale, creative reference material",
      "Minimalist first tattoo size reference with a simple symbol sized for distance visibility, creative reference material",
      "Geometric first tattoo size reference with balanced clear shapes, creative reference material"
    ]
  }
];

export const guidesBySlug = Object.fromEntries(
  guides.map((guide) => [
    guide.slug,
    {
      ...guide,
      url: `${siteUrl}/guides/${guide.slug}`,
      htmlFile: `guides/${guide.slug}.html`
    }
  ])
);

export function buildGuideMetadata(guide) {
  return {
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
  };
}

export function buildGuideArticleJsonLd(guide) {
  return {
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
  };
}

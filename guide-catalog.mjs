export const siteUrl = "https://tattoo-pink.vercel.app";

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
    description: "Explore first tattoo ideas through symbols, motifs, lettering, and geometry before turning a concept into an artist conversation.",
    primaryKeyword: "first tattoo ideas"
  },
  {
    slug: "small-first-tattoo-ideas",
    title: "Small First Tattoo Ideas That Stay Personal | InkFirst",
    description: "Find small first tattoo ideas with clear, personal starting points that can be discussed with a qualified tattoo artist.",
    primaryKeyword: "small first tattoo ideas"
  },
  {
    slug: "first-tattoo-placement",
    title: "First Tattoo Placement: How to Choose a Spot | InkFirst",
    description: "Use visibility, body flow, clothing, and design orientation to narrow down first tattoo placement options.",
    primaryKeyword: "first tattoo placement"
  },
  {
    slug: "first-tattoo-size",
    title: "First Tattoo Size: Choosing a Design That Reads Well | InkFirst",
    description: "Plan first tattoo size around readable detail, placement area, visibility, and future design flexibility.",
    primaryKeyword: "first tattoo size"
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

import type { MetadataRoute } from "next";
import { guideSlugs, siteUrl } from "../guide-catalog.mjs";

const staticPaths = ["", "/privacy", "/terms", "/refunds"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...staticPaths.map((path) => ({ url: `${siteUrl}${path}` })),
    ...guideSlugs.map((slug) => ({ url: `${siteUrl}/guides/${slug}` }))
  ];
}

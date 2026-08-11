import type { MetadataRoute } from "next";
import { guideSlugs, siteUrl } from "../guide-catalog.mjs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}

void guideSlugs;

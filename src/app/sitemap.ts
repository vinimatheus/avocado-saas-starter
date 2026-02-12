import type { MetadataRoute } from "next";

import { resolveSiteOrigin } from "@/lib/seo/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteOrigin = resolveSiteOrigin();

  return [
    {
      url: siteOrigin,
      lastModified: new Date(),
    },
  ];
}

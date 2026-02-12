import type { MetadataRoute } from "next";

import { resolveSiteOrigin } from "@/lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteOrigin = resolveSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/billing",
          "/profile",
          "/produtos",
          "/convites/",
          "/empresa/",
          "/onboarding/",
        ],
      },
    ],
    sitemap: `${siteOrigin}/sitemap.xml`,
    host: siteOrigin,
  };
}

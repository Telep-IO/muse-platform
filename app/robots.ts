import type { MetadataRoute } from "next";
import { catalogOrigin } from "@telep/platform";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${catalogOrigin()}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";

const BASE_URL = "https://moneymaxxxing.ru";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/faq", "/contacts", "/terms", "/privacy"].map((path) => ({
    url: `${BASE_URL}${path === "/" ? "" : path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.6,
  }));
}

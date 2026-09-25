import { catalogOrigin, publicApiUrl } from "@telep/platform";

export const SITE = {
  name: "Telep Muse",
  company: "Telep IO",
  contact: "jon@telep.io",
  musePlatform: "https://muse.ai/platform",
  museHelp: "https://www.meta.com/help/artificial-intelligence/1687253048996149/",
};

export function catalogUrl(path = "/"): string {
  return `${catalogOrigin().replace(/\/$/, "")}${path}`;
}

export function apiUrl(path = "/"): string {
  return `${publicApiUrl("/").replace(/\/$/, "")}${path}`;
}

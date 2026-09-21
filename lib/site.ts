export const SITE = {
  name: "Telep Muse",
  company: "Telep IO",
  contact: "jon@telep.io",
  musePlatform: "https://muse.ai/platform",
  museHelp: "https://www.meta.com/help/artificial-intelligence/1687253048996149/",
};

function catalogOrigin(): string {
  return process.env.NEXT_PUBLIC_CATALOG_URL || "https://muse.telep.io";
}

function apiOrigin(): string {
  return process.env.NEXT_PUBLIC_API_URL || "https://api.muse.telep.io";
}

export function catalogUrl(path = "/"): string {
  return `${catalogOrigin().replace(/\/$/, "")}${path}`;
}

export function apiUrl(path = "/"): string {
  return `${apiOrigin().replace(/\/$/, "")}${path}`;
}

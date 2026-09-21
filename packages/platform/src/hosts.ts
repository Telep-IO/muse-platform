export function isApiHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return host.toLowerCase().includes("api.");
}

export function catalogOrigin(): string {
  return process.env.NEXT_PUBLIC_CATALOG_URL || "https://muse.telep.io";
}

export function apiOrigin(): string {
  return process.env.NEXT_PUBLIC_API_URL || "https://api.muse.telep.io";
}

export function publicApiUrl(path: string): string {
  const base = apiOrigin().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function publicCatalogUrl(path: string): string {
  const base = catalogOrigin().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

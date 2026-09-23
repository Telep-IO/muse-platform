import { HttpError, databaseUrl, readAppMode, type Env } from "@telep/platform";

export function paperDatabaseUrl(env: Env = process.env): string {
  return databaseUrl(env, ["PAPER_SEND_DATABASE_URL", "DATABASE_URL"]);
}

export function assertPaperDatabase(env: Env = process.env): void {
  if (readAppMode("PAPER_SEND_APP_MODE", env) === "demo") return;
  if (!paperDatabaseUrl(env)) {
    throw new HttpError(503, "database_required", "DATABASE_URL required");
  }
}

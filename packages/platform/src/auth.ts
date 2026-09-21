export const KEY_PATTERN = /^muse_sk_(demo|test|live)_[A-Za-z0-9]{8,}$/;

export type ApiKeyEnv = "demo" | "test" | "live";

export type AuthResult = {
  key: string;
  env: ApiKeyEnv;
  keyId: string;
};

export class AuthError extends Error {
  status = 401;
  code = "unauthorized";
  constructor(message = "Missing or invalid API key") {
    super(message);
    this.name = "AuthError";
  }
}

function configuredKeys(): string[] {
  const raw = process.env.MUSE_API_KEYS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function lookupKey(presented: string): AuthResult | null {
  if (!KEY_PATTERN.test(presented)) return null;
  const keys = configuredKeys();
  const matched = keys.find((candidate) => timingSafeEqual(candidate, presented));
  if (!matched) return null;
  const env = presented.split("_")[2] as ApiKeyEnv;
  return {
    key: matched,
    env,
    keyId: `${env}:${matched.slice(-6)}`,
  };
}

export function authenticate(request: Request, opts?: { required: boolean }): AuthResult | null {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) {
    if (opts?.required) throw new AuthError("Authorization: Bearer <key> is required");
    return null;
  }
  const result = lookupKey(token);
  if (!result) {
    throw new AuthError("Unknown API key");
  }
  return result;
}

export function isWriteMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

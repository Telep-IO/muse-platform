export class HttpError extends Error {
  status: number;
  code: string;
  extras?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extras?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extras = extras;
  }
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
  extras?: Record<string, unknown>,
): Response {
  const error = extras ? { code, message, ...extras } : { code, message };
  return Response.json({ error }, { status, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonError(error.status, error.code, error.message, undefined, error.extras);
  }
  const message = error instanceof Error ? error.message : "Invalid request";
  return jsonError(400, "invalid_request", message);
}

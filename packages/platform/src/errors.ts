export type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

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

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
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

export function fromUnknown(error: unknown): Response {
  if (error instanceof HttpError) return errorResponse(error);
  if (error && typeof error === "object" && "status" in error && "code" in error && error instanceof Error) {
    const status = Number((error as { status: number }).status) || 500;
    const code = String((error as { code: string }).code);
    return jsonError(status, code, error.message);
  }
  return jsonError(500, "internal_error", "Internal error");
}

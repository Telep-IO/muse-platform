export type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

export function jsonError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json(errorBody(code, message), { status, headers });
}

export function fromUnknown(error: unknown): Response {
  if (error && typeof error === "object" && "status" in error && "code" in error && error instanceof Error) {
    const status = Number((error as { status: number }).status) || 500;
    const code = String((error as { code: string }).code);
    return jsonError(status, code, error.message);
  }
  return jsonError(500, "internal_error", "Internal error");
}

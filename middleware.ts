import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, isApiHost } from "@telep/platform/edge";

const API_PATHS = ["/v1", "/mcp", "/health"];

function isApiPath(pathname: string): boolean {
  return API_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const { pathname } = request.nextUrl;
  const apiHost = isApiHost(host);

  if (request.method === "OPTIONS" && (apiHost || isApiPath(pathname))) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
  }

  if (apiHost && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/v1";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|txt)$).*)"],
};

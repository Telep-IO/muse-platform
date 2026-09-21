import { dispatchRest } from "@/lib/gateway";

type Ctx = { params: Promise<{ slug: string; path?: string[] }> };

async function handle(request: Request, ctx: Ctx) {
  const { slug, path } = await ctx.params;
  return dispatchRest(request, slug, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

export async function OPTIONS(request: Request) {
  const { withCors } = await import("@telep/platform");
  return withCors(request, new Response(null, { status: 204 }));
}

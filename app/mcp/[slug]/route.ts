import { dispatchMcp } from "@/lib/gateway";

type Ctx = { params: Promise<{ slug: string }> };

async function handle(request: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  return dispatchMcp(request, slug);
}

export const GET = handle;
export const POST = handle;

export async function OPTIONS(request: Request) {
  const { withCors } = await import("@telep/platform");
  return withCors(request, new Response(null, { status: 204 }));
}

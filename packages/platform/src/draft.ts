import type { AuthResult } from "./auth";
import { catalogOrigin } from "./hosts";
import { errorResponse, jsonError } from "./errors";
import { withCors } from "./cors";
import type { OpenApiDocument } from "./openapi";
import { createCheckoutSession } from "./stripe";

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function unauthorized(request: Request): Response {
  return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
}

function send(request: Request, body: unknown, status = 200): Response {
  return withCors(request, Response.json(body, { status }));
}

type Payable = { id: string; status: string; amountCents: number; currency: string };

async function paidCheckout(request: Request, slug: string, label: string, noun: string, item: Payable | undefined, missing: string): Promise<Response> {
  if (!item) return withCors(request, jsonError(404, "not_found", missing));
  if (item.status !== "draft") {
    return withCors(request, jsonError(409, "conflict", `${label} is ${item.status}, checkout only from draft`));
  }
  const page = `${catalogOrigin()}/connectors/${slug}#checkout-${item.id}`;
  const session = await createCheckoutSession({
    connectorSlug: slug,
    jobId: item.id,
    amountCents: item.amountCents,
    currency: item.currency,
    successUrl: page,
    cancelUrl: `${catalogOrigin()}/connectors/${slug}`,
    description: `${label} ${item.id}`,
  });
  const live = session.mode === "live";
  return send(request, {
    checkoutUrl: live ? session.url : page,
    amountCents: item.amountCents,
    currency: item.currency,
    note: live
      ? `Stripe Checkout session ${session.id}. The ${noun} moves to paid only after the billing webhook confirms payment.`
      : `Stub checkout: no payment is collected on the gateway. In production this returns a Stripe Checkout session; the ${noun} moves to paid only after the billing webhook confirms payment.`,
  });
}

type Collection<T> = {
  name: string;
  listKey: string;
  missing: string;
  list: (ownerKeyId: string) => T[];
  get: (id: string, ownerKeyId: string) => T | undefined;
  present: (item: T) => unknown;
  create?: (body: Record<string, unknown>, auth: AuthResult) => Promise<T> | T;
  checkout?: { label: string; noun: string };
  demoEvent?: (id: string, ownerKeyId: string, event: string, body: Record<string, unknown>) => T | Promise<T>;
  actions?: Record<string, (id: string, auth: AuthResult) => Promise<T | undefined> | T | undefined>;
};

export function draftRest<T>(opts: {
  slug: string;
  index: () => Record<string, unknown>;
  openApi: () => OpenApiDocument;
  check?: () => Promise<unknown> | unknown;
  quote?: (request: Request) => unknown;
  reads?: Record<string, (auth: AuthResult) => unknown | Promise<unknown>>;
  match?: (request: Request, segments: string[], auth: AuthResult | null) => Promise<Response | undefined>;
  collection?: Collection<T>;
}): (request: Request, path: string[], auth: AuthResult | null) => Promise<Response> {
  return async function handle(request: Request, path: string[], auth: AuthResult | null): Promise<Response> {
    const segments = path.filter(Boolean);
    if (segments.length === 0) return send(request, opts.index());
    if (segments[0] === "openapi.json") return send(request, opts.openApi());

    if (opts.check && segments.length === 1 && segments[0] === "check" && request.method === "GET") {
      if (!auth) return unauthorized(request);
      try {
        return send(request, await opts.check());
      } catch (error) {
        return withCors(request, errorResponse(error));
      }
    }

    if (opts.quote && segments.length === 1 && segments[0] === "quote" && request.method === "GET") {
      if (!auth) return unauthorized(request);
      return send(request, opts.quote(request));
    }

    const read = opts.reads?.[segments.length === 1 && request.method === "GET" ? segments[0] : ""];
    if (read) {
      if (!auth) return unauthorized(request);
      return send(request, await read(auth));
    }

    const matched = await opts.match?.(request, segments, auth);
    if (matched) return matched;

    const col = opts.collection;
    if (col && segments[0] === col.name) {
      if (segments.length === 1 && request.method === "GET") {
        if (!auth) return unauthorized(request);
        return send(request, { [col.listKey]: col.list(auth.keyId).map(col.present) });
      }
      if (segments.length === 1 && request.method === "POST" && col.create) {
        if (!auth) return unauthorized(request);
        try {
          const item = await col.create(await readJson(request), auth);
          return send(request, col.present(item), 201);
        } catch (error) {
          return withCors(request, errorResponse(error));
        }
      }
      if (segments.length === 2 && request.method === "GET") {
        if (!auth) return unauthorized(request);
        const item = col.get(segments[1], auth.keyId);
        if (!item) return withCors(request, jsonError(404, "not_found", col.missing));
        return send(request, col.present(item));
      }
      if (segments.length === 3 && request.method === "POST") {
        const action = segments[2];
        const known = (action === "checkout" && col.checkout) || (action === "demo-event" && col.demoEvent) || Boolean(col.actions?.[action]);
        if (known && !auth) return unauthorized(request);
        if (known && auth && action === "checkout" && col.checkout) {
          return paidCheckout(request, opts.slug, col.checkout.label, col.checkout.noun, col.get(segments[1], auth.keyId) as Payable | undefined, col.missing);
        }
        if (known && auth && action === "demo-event" && col.demoEvent) {
          const body = await readJson(request);
          try {
            const item = await col.demoEvent(segments[1], auth.keyId, String(body.event ?? ""), body);
            return send(request, col.present(item));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid demo event";
            const status = message === col.missing ? 404 : 400;
            return withCors(request, jsonError(status, status === 404 ? "not_found" : "invalid_request", message));
          }
        }
        const run = known && auth ? col.actions?.[action] : undefined;
        if (run && auth) {
          const item = await run(segments[1], auth);
          if (!item) return withCors(request, jsonError(404, "not_found", col.missing));
          return send(request, col.present(item));
        }
      }
    }

    return withCors(request, jsonError(404, "not_found", `Unknown ${opts.slug} path /${segments.join("/")}`));
  };
}

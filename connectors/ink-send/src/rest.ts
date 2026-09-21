import { catalogOrigin, jsonError, withCors, type AuthResult } from "@telep/platform";
import { PRICE_CENTS, createLetter, demoEvent, getLetter, listLetters, publicLetter } from "./letters";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleInkSendRest(
  request: Request,
  path: string[],
  auth: AuthResult | null,
): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "ink-send",
        name: "InkSend",
        status: "planned",
        fulfillment: "stub",
        price: `$${(PRICE_CENTS / 100).toFixed(2)} per letter`,
        limits: "cards: plain, thank-you, condolence, holiday",
        note: "Create a letter at POST /v1/ink-send/letters. Handwritten-mail provider fulfillment is not wired on this gateway yet.",
        endpoints: {
          letters: "/v1/ink-send/letters",
          openapi: "/v1/ink-send/openapi.json",
          mcp: "/mcp/ink-send",
        },
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { inkSendOpenApi } = await import("./openapi");
    return withCors(request, Response.json(inkSendOpenApi()));
  }

  const needsAuth = (message = "Authorization: Bearer <key> is required") =>
    withCors(request, jsonError(401, "unauthorized", message));

  if (segments[0] === "letters" && segments.length === 1 && request.method === "GET") {
    if (!auth) return needsAuth();
    return withCors(request, Response.json({ letters: listLetters(auth.keyId).map(publicLetter) }));
  }

  if (segments[0] === "letters" && segments.length === 1 && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const letter = createLetter({
        message: body.message,
        to: body.to,
        card: body.card,
        handwriting_style: body.handwriting_style,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
      });
      return withCors(request, Response.json(publicLetter(letter), { status: 201 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid letter";
      return withCors(request, jsonError(400, "invalid_request", message));
    }
  }

  if (segments[0] === "letters" && segments.length === 2 && request.method === "GET") {
    if (!auth) return needsAuth();
    const letter = getLetter(segments[1], auth.keyId);
    if (!letter) return withCors(request, jsonError(404, "not_found", "Letter not found"));
    return withCors(request, Response.json(publicLetter(letter)));
  }

  if (segments[0] === "letters" && segments.length === 3 && segments[2] === "checkout" && request.method === "POST") {
    if (!auth) return needsAuth();
    const letter = getLetter(segments[1], auth.keyId);
    if (!letter) return withCors(request, jsonError(404, "not_found", "Letter not found"));
    if (letter.status !== "draft") {
      return withCors(request, jsonError(409, "conflict", `Letter is ${letter.status}, checkout only from draft`));
    }
    return withCors(
      request,
      Response.json({
        checkoutUrl: `${catalogOrigin()}/connectors/ink-send#checkout-${letter.id}`,
        amountCents: letter.amountCents,
        currency: letter.currency,
        note: "Stub checkout: no payment is collected on the gateway. In production this returns a Stripe Checkout session; the letter moves to paid only after the billing webhook confirms payment.",
      }),
    );
  }

  if (segments[0] === "letters" && segments.length === 3 && segments[2] === "demo-event" && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const letter = demoEvent(segments[1], auth.keyId, String(body.event ?? ""));
      return withCors(request, Response.json(publicLetter(letter)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid demo event";
      const code = message === "Letter not found" ? 404 : 400;
      return withCors(request, jsonError(code, code === 404 ? "not_found" : "invalid_request", message));
    }
  }

  return withCors(request, jsonError(404, "not_found", `Unknown ink-send path /${segments.join("/")}`));
}

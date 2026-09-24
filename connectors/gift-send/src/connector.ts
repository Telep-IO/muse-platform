import { listing } from "./listing";
import { defineConnector, errorResponse, HttpError, mcpAuth, readJson, unauthorized, withCors, type McpTool } from "@telep/platform";
import { fulfillGiftSendPayment } from "./fulfill";
import { cancelGift, createGiftDraft, getGift, listGifts, listRewardProducts, sendGift } from "./jobs";
import { assertGiftSendReady, checkGiftSend, giftSendDescriptor, giftSendRuntime, quoteGiftSend } from "./provider";

const recipient = {
  type: "object",
  properties: {
    email: { type: "string", description: "Required for EMAIL delivery. One of email or phone is required." },
    phone: { type: "string", description: "Required for PHONE delivery. One of email or phone is required." },
    name: { type: "string" },
  },
};

function readyForLive(): void {
  if (giftSendRuntime().mode !== "demo") assertGiftSendReady();
}

const extraTools: McpTool[] = [
  {
    name: "list_reward_products",
    description:
      "List digital gift cards, Visa/Mastercard prepaid, and charity rewards. Read-only. Demo returns a stub catalog and does not call Tremendous. Cash payouts are omitted.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        country: { type: "string", description: "Optional ISO country code, for example US" },
        category: { type: "string", description: "Optional: merchant_card, visa_card, or charity" },
      },
    },
    async handler(args) {
      return listRewardProducts({
        country: args.country ? String(args.country) : undefined,
        category: args.category ? String(args.category) : undefined,
      });
    },
  },
  {
    name: "send_gift",
    description:
      "Open one Stripe checkout for a gift draft. Returns checkout_url. Does not create a Tremendous order. A second checkout for the same draft returns 409. Tremendous sends the reward only after the shared billing webhook reports payment_status paid.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["draft_id"],
      properties: { draft_id: { type: "string" } },
    },
    async handler(args, ctx) {
      readyForLive();
      return sendGift(String(args.draft_id), mcpAuth(ctx).keyId);
    },
  },
  {
    name: "get_gift_status",
    description: "Return status, delivery state, and redemption state for a gift.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["gift_id"],
      properties: { gift_id: { type: "string" } },
    },
    async handler(args, ctx) {
      return getGift(String(args.gift_id), mcpAuth(ctx).keyId);
    },
  },
  {
    name: "cancel_gift",
    description:
      "Cancel a reward before redemption. Tremendous returns HTTP 422 when the reward was already redeemed, and that refusal is returned as-is. Demo mode does not call Tremendous.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["gift_id"],
      properties: { gift_id: { type: "string" } },
    },
    async handler(args, ctx) {
      readyForLive();
      return cancelGift(String(args.gift_id), mcpAuth(ctx).keyId);
    },
  },
];

const giftSend = defineConnector({
  slug: "gift-send",
  name: "GiftSend",
  status: "submitted",
  listing,
  fulfill: (session) => fulfillGiftSendPayment(session),
  descriptor: giftSendDescriptor,
  gate: () => ({ mode: giftSendRuntime().mode, ready: () => assertGiftSendReady() }),
  check: {
    description:
      "Validate GiftSend Tremendous credentials with a read-only product list. Does not create an order. Demo mode skips Tremendous and Stripe.",
    run: checkGiftSend,
  },
  quote: (request) => quoteGiftSend(Number(new URL(request.url).searchParams.get("face_cents") ?? "0")),
  beforeTools: extraTools,
  openapi: {
    description:
      "Digital gift cards and Visa/Mastercard prepaid rewards through Tremendous. The agent drafts a reward. The human pays face value plus a service fee. Tremendous sends the reward only after the shared billing webhook reports payment_status paid.",
    tagDescription: "Draft and send a digital gift card or prepaid reward",
    self: true,
  },
  match: async (request, segments, auth) => {
    const send = async (run: () => Promise<unknown>, status = 200) => {
      if (!auth) return unauthorized(request);
      try {
        return withCors(request, Response.json(await run(), { status }));
      } catch (error) {
        return withCors(request, errorResponse(error));
      }
    };
    if (segments[0] === "products" && segments.length === 1 && request.method === "GET") {
      const url = new URL(request.url);
      return send(() =>
        listRewardProducts(
          {
            country: url.searchParams.get("country") || undefined,
            category: url.searchParams.get("category") || undefined,
          },
          auth?.keyId,
        ),
      );
    }
    if (segments[0] === "gifts" && segments.length === 3 && segments[2] === "checkout" && request.method === "POST") {
      return send(() => sendGift(segments[1], auth!.keyId), 201);
    }
    if (segments[0] === "gifts" && segments.length === 3 && segments[2] === "cancel" && request.method === "POST") {
      return send(() => cancelGift(segments[1], auth!.keyId));
    }
    return undefined;
  },
  resource: {
    name: "gifts",
    missing: "Gift not found",
    list: (owner) => listGifts(owner),
    async get(id, owner) {
      try {
        return await getGift(id, owner);
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) return undefined;
        throw error;
      }
    },
    present: (gift) => gift,
    summaries: {
      list: "List gift drafts",
      create: "Draft a digital gift card or prepaid reward (does not send it)",
      get: "Get gift status",
    },
    schema: {
      type: "object",
      required: ["recipient", "reward_id", "amount_cents", "delivery_method"],
      properties: {
        recipient,
        reward_id: { type: "string" },
        amount_cents: { type: "integer" },
        message: { type: "string" },
        delivery_method: { type: "string", enum: ["EMAIL", "PHONE", "LINK"] },
      },
    },
    checkout: { label: "Gift", noun: "reward" },
    tool: {
      name: "create_gift_draft",
      description:
        "Draft a digital gift card, Visa/Mastercard prepaid reward, or charity reward. Returns draft_id and a quote (face value plus service fee). Does not create a Tremendous order. Demo mode uses a stub catalog and does not call Tremendous.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["recipient", "reward_id", "amount_cents", "delivery_method"],
        properties: {
          recipient,
          reward_id: { type: "string" },
          amount_cents: { type: "integer", description: "Face value in cents. Maximum 200000 ($2,000)." },
          message: { type: "string" },
          delivery_method: { type: "string", enum: ["EMAIL", "PHONE", "LINK"] },
        },
      },
    },
    listTool: { name: "list_gifts", description: "List gift drafts created with this API key." },
    create(body, ctx) {
      return createGiftDraft({
        recipient: body.recipient,
        reward_id: body.reward_id,
        amount_cents: body.amount_cents,
        message: body.message,
        delivery_method: body.delivery_method,
        ownerKeyId: ctx.keyId,
      });
    },
  },
});

export const handleGiftSendRest = giftSend.rest;
export const handleGiftSendMcp = giftSend.mcp;
export const giftSendOpenApi = giftSend.openapi;
export const giftSendTools = giftSend.tools;
export { fulfillGiftSendPayment };

export default giftSend;

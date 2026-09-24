import { fulfillPrintMerchPayment } from "./fulfill";
import { listing } from "./listing";
import { HttpError, defineConnector, errorResponse, mcpAuth, unauthorized, withCors, type McpTool } from "@telep/platform";
import {
  cancelMerchOrder,
  createMerchDraft,
  createMockup,
  getMerchOrder,
  listMerchOrders,
  placeMerchOrder,
  publicOrder,
} from "./jobs";
import {
  assertPrintMerchReady,
  checkPrintMerch,
  getPrintProduct,
  listPrintProducts,
  printMerchDescriptor,
  printMerchRuntime,
  quotePrintMerch,
} from "./provider";

const recipientSchema = {
  type: "object",
  additionalProperties: false,
  required: ["first_name", "last_name", "email", "phone", "country", "address1", "city", "zip"],
  properties: {
    first_name: { type: "string" },
    last_name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    country: { type: "string", description: "ISO 3166-1 alpha-2 country code." },
    region: { type: "string", description: "State or region. Required when country is US." },
    address1: { type: "string" },
    address2: { type: "string" },
    city: { type: "string" },
    zip: { type: "string" },
  },
};

const draftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["blueprint_id", "print_provider_id", "variant_id", "artwork_url", "quantity", "recipient", "artwork_rights_attested"],
  properties: {
    blueprint_id: { type: "integer" },
    print_provider_id: { type: "integer" },
    variant_id: { type: "integer" },
    artwork_url: { type: "string", description: "https URL of artwork you own or are licensed to print." },
    quantity: { type: "integer", description: "1–50." },
    recipient: recipientSchema,
    artwork_rights_attested: {
      type: "boolean",
      description: "Must be true. You attest that you own or are licensed for this artwork.",
    },
  },
};

function tool(name: string, description: string, schema: Record<string, unknown>, run: (args: Record<string, unknown>, owner: string) => Promise<unknown>): McpTool {
  return {
    name,
    description,
    inputSchema: schema,
    async handler(args, ctx) {
      return run(args, mcpAuth(ctx).keyId);
    },
  };
}

function intArg(args: Record<string, unknown>, name: string): number {
  const value = args[name];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, "invalid_request", `${name} must be an integer`);
  }
  return value;
}

const printMerch = defineConnector({
  slug: "print-merch",
  name: "PrintMerch",
  status: "submitted",
  listing,
  fulfill: (session, webhook) => fulfillPrintMerchPayment(session, webhook),
  price: "Live Printify base + shipping + configured markup (default 25%).",
  limits: "Quantity 1–50. Production only after Stripe payment_status is paid. Shop order approval must be manual.",
  descriptor: printMerchDescriptor,
  gate: () => ({ mode: printMerchRuntime().mode, ready: () => assertPrintMerchReady() }),
  indexTools: true,
  check: {
    description:
      "Validate PrintMerch credentials. Demo mode skips Printify. test/live reads the shop and catalog and fails closed unless order approval is manual. Never creates a product.",
    run: checkPrintMerch,
  },
  quote: (request) => quotePrintMerch(request.url),
  openapi: {
    description:
      "Custom printed merchandise. The agent drafts a product and mockups; a human reviews and pays with Stripe; only then is the order sent to Printify. Demo mode never contacts Printify.",
    tagDescription: "Design, quote, and order printed merchandise",
    self: true,
  },
  extraGets: [
    { path: "/v1/print-merch/products", summary: "List print products (read-only catalog)" },
  ],
  extraPosts: [
    {
      path: "/v1/print-merch/mockups",
      summary: "Create a mockup for human review. Does not submit an order to production.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["blueprint_id", "print_provider_id", "variant_id", "artwork_url"],
        properties: {
          blueprint_id: { type: "integer" },
          print_provider_id: { type: "integer" },
          variant_id: { type: "integer" },
          artwork_url: { type: "string" },
        },
      },
    },
  ],
  beforeTools: [
    tool(
      "list_print_products",
      "List Printify catalog products. Read-only. Pass blueprint to include providers and from_price_cents. Omitting blueprint does not fan out a price call per provider. Demo returns a labeled fixture and does not call Printify.",
      {
        type: "object",
        additionalProperties: false,
        properties: { blueprint: { type: "integer", description: "Printify blueprint id." } },
      },
      async (args) => ({
        catalog: await listPrintProducts(args.blueprint == null ? undefined : intArg(args, "blueprint")),
      }),
    ),
    tool(
      "get_print_product",
      "Read one blueprint and print provider: variants, live prices when Printify returns them, print areas, and shipping estimates. Does not create a product.",
      {
        type: "object",
        additionalProperties: false,
        required: ["blueprint_id", "print_provider_id"],
        properties: {
          blueprint_id: { type: "integer" },
          print_provider_id: { type: "integer" },
        },
      },
      async (args) => getPrintProduct(intArg(args, "blueprint_id"), intArg(args, "print_provider_id")),
    ),
    tool(
      "create_mockup",
      "Generate mockup image URLs for human review. test/live uploads artwork and creates a Printify product. It never submits an order to production. Demo returns a stub URL and does not call Printify.",
      {
        type: "object",
        additionalProperties: false,
        required: ["blueprint_id", "print_provider_id", "variant_id", "artwork_url"],
        properties: {
          blueprint_id: { type: "integer" },
          print_provider_id: { type: "integer" },
          variant_id: { type: "integer" },
          artwork_url: { type: "string" },
        },
      },
      (args, owner) => createMockup(args, owner),
    ),
    tool(
      "place_merch_order",
      "Create one Stripe Checkout session for a draft. A second call for the same draft is a conflict and does not create another session. Does not submit the order to Printify production.",
      {
        type: "object",
        additionalProperties: false,
        required: ["draft_id"],
        properties: { draft_id: { type: "string" } },
      },
      async (args, owner) => publicOrder(await placeMerchOrder(String(args.draft_id ?? ""), owner)),
    ),
    tool(
      "get_merch_order_status",
      "Read a PrintMerch order you created with this API key.",
      {
        type: "object",
        additionalProperties: false,
        required: ["order_id"],
        properties: { order_id: { type: "string" } },
      },
      async (args, owner) => {
        const order = await getMerchOrder(String(args.order_id ?? ""), owner);
        if (!order) throw new HttpError(404, "not_found", "Order not found");
        return publicOrder(order);
      },
    ),
    tool(
      "cancel_merch_order",
      "Cancel an order only while Printify still has it on-hold or payment-not-received. Later statuses cannot be canceled here.",
      {
        type: "object",
        additionalProperties: false,
        required: ["order_id"],
        properties: { order_id: { type: "string" } },
      },
      async (args, owner) => publicOrder(await cancelMerchOrder(String(args.order_id ?? ""), owner)),
    ),
  ],
  async match(request, segments, auth) {
    if (segments[0] === "products" && request.method === "GET") {
      if (!auth) return unauthorized(request);
      try {
        if (segments.length === 1) {
          const blueprint = new URL(request.url).searchParams.get("blueprint");
          const catalog = await listPrintProducts(blueprint == null || blueprint === "" ? undefined : intArg({ blueprint: Number(blueprint) }, "blueprint"));
          return withCors(request, Response.json({ catalog }));
        }
        if (segments.length === 3) {
          return withCors(
            request,
            Response.json(await getPrintProduct(intArg({ blueprint_id: Number(segments[1]) }, "blueprint_id"), intArg({ print_provider_id: Number(segments[2]) }, "print_provider_id"))),
          );
        }
      } catch (error) {
        return withCors(request, errorResponse(error));
      }
    }
    if (segments[0] === "mockups" && segments.length === 1 && request.method === "POST") {
      if (!auth) return unauthorized(request);
      try {
        const body = (await request.json()) as Record<string, unknown>;
        return withCors(request, Response.json(await createMockup(body, auth.keyId)));
      } catch (error) {
        return withCors(request, errorResponse(error));
      }
    }
    return undefined;
  },
  resource: {
    name: "merch_orders",
    missing: "Order not found",
    list: (owner) => listMerchOrders(owner),
    get: (id, owner) => getMerchOrder(id, owner),
    present: (item) => publicOrder(item),
    summaries: {
      list: "List merchandise orders for this API key",
      create: "Create a merchandise draft with mockups and a live quote. Does not send anything to production.",
      get: "Get a merchandise order",
    },
    schema: draftSchema,
    tool: {
      name: "create_merch_draft",
      description:
        "Create a PrintMerch draft: product, artwork, quantity, and recipient. Returns draft_id, a quote (base + shipping + markup), and mockup URLs. test/live creates a Printify product for those mockups and never sends it to production. You must set artwork_rights_attested to true. Demo mode does not call Printify.",
      schema: draftSchema,
    },
    listTool: { name: "list_merch_orders", description: "List PrintMerch orders created with this API key." },
    actions: [
      {
        rest: "checkout",
        summary: "Create one Stripe Checkout session for this draft. Does not submit the order to production. A repeat call returns 409.",
        run: (id, owner) => placeMerchOrder(id, owner),
      },
      {
        rest: "cancel",
        summary: "Cancel only while the Printify order is on-hold or payment-not-received.",
        run: (id, owner) => cancelMerchOrder(id, owner),
      },
    ],
    create(body, ctx) {
      return createMerchDraft(body, ctx.keyId);
    },
  },
});

export const handlePrintMerchRest = printMerch.rest;
export const handlePrintMerchMcp = printMerch.mcp;
export const printMerchOpenApi = printMerch.openapi;
export const printMerchTools = printMerch.tools;

export default printMerch;

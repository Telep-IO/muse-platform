import { catalogOrigin, draftRest } from "@telep/platform";
import { createLetter, demoEvent, getLetter, listLetters, publicLetter } from "./letters";
import { inkSendOpenApi } from "./openapi";
import { assertInkReady, checkInk, inkDescriptor, inkRuntime, quoteInk } from "./provider";

export const handleInkSendRest = draftRest({
  slug: "ink-send",
  index: () => ({
    slug: "ink-send",
    name: "InkSend",
    status: "planned",
    price: "$3.99 per letter",
    limits: "cards: plain, thank-you, condolence, holiday",
    ...inkDescriptor(),
    endpoints: {
      letters: "/v1/ink-send/letters",
      quote: "/v1/ink-send/quote",
      check: "/v1/ink-send/check",
      openapi: "/v1/ink-send/openapi.json",
      mcp: "/mcp/ink-send",
    },
  }),
  openApi: inkSendOpenApi,
  check: checkInk,
  quote: () => quoteInk(),
  collection: {
    name: "letters",
    listKey: "letters",
    missing: "Letter not found",
    list: listLetters,
    get: getLetter,
    present: publicLetter,
    checkout: { label: "Letter", noun: "letter" },
    demoEvent: (id, owner, event) => demoEvent(id, owner, event),
    create(body, auth) {
      const runtime = inkRuntime();
      if (runtime.mode !== "demo") assertInkReady();
      return createLetter({
        message: body.message,
        to: body.to,
        card: body.card,
        handwriting_style: body.handwriting_style,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
        live: runtime.mode !== "demo",
      });
    },
  },
});

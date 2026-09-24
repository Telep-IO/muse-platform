import type { ConnectorModule } from "@telep/platform";
import callSend from "./call-send/src";
import domainSend from "./domain-send/src";
import faxSend from "./fax-send/src";
import giftSend from "./gift-send/src";
import inkSend from "./ink-send/src";
import paperSend from "./paper-send/src";
import printMerch from "./print-merch/src";
import shipLabel from "./ship-label/src";
import shipSignal from "./shipsignal/src";
import signSend from "./sign-send/src";
import sumvid from "./sumvid/src";

/**
 * Every connector on the gateway. Adding one = its folder + one line here.
 * Catalog, routing, OpenAPI, docs, legal pages, and billing webhooks all read this list.
 */
export const connectorModules: ConnectorModule[] = [
  paperSend,
  shipLabel,
  giftSend,
  sumvid,
  shipSignal,
  signSend,
  faxSend,
  callSend,
  inkSend,
  domainSend,
  printMerch,
];

const bySlug = new Map(connectorModules.map((mod) => [mod.slug, mod]));

export function getModule(slug: string): ConnectorModule | undefined {
  return bySlug.get(slug);
}

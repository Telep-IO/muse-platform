import { errorResponse, jsonError, withCors, type AuthResult } from "@telep/platform";
import { getParcel, listParcels, publicParcel, setWatching } from "./parcels";
import { checkShip, refreshParcelResolved, shipAccount, shipDescriptor, trackParcel } from "./provider";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function requireAuth(auth: AuthResult | null): auth is AuthResult {
  return Boolean(auth);
}

export async function handleShipSignalRest(
  request: Request,
  path: string[],
  auth: AuthResult | null,
): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "shipsignal",
        name: "ShipSignal",
        status: "ready",
        ...shipDescriptor(),
        endpoints: {
          parcels: "/v1/shipsignal/parcels",
          account: "/v1/shipsignal/account",
          check: "/v1/shipsignal/check",
          openapi: "/v1/shipsignal/openapi.json",
          mcp: "/mcp/shipsignal",
        },
        mcpTools: [
          "track_package",
          "list_parcels",
          "refresh_parcel",
          "watch_parcel",
          "unwatch_parcel",
          "get_account",
        ],
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { shipSignalOpenApi } = await import("./openapi");
    return withCors(request, Response.json(shipSignalOpenApi()));
  }

  if (segments[0] === "check" && segments.length === 1 && request.method === "GET") {
    if (!requireAuth(auth)) {
      return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    }
    try {
      return withCors(request, Response.json(await checkShip()));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (segments[0] === "account" && segments.length === 1 && request.method === "GET") {
    if (!requireAuth(auth)) {
      return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    }
    return withCors(request, Response.json(shipAccount(auth.keyId)));
  }

  if (segments[0] === "parcels" && segments.length === 1 && request.method === "GET") {
    if (!requireAuth(auth)) {
      return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    }
    return withCors(request, Response.json({ parcels: listParcels(auth.keyId).map(publicParcel) }));
  }

  if (segments[0] === "parcels" && segments.length === 1 && request.method === "POST") {
    if (!requireAuth(auth)) {
      return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    }
    const body = await readJson(request);
    try {
      const parcel = await trackParcel({
        trackingNumber: body.trackingNumber ?? body.tracking_number,
        origin: body.origin,
        destination: body.destination,
        ownerKeyId: auth.keyId,
      });
      return withCors(request, Response.json(publicParcel(parcel), { status: 201 }));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (segments[0] === "parcels" && segments.length === 2 && request.method === "GET") {
    if (!requireAuth(auth)) {
      return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    }
    const parcel = getParcel(segments[1], auth.keyId);
    if (!parcel) return withCors(request, jsonError(404, "not_found", "Parcel not found"));
    return withCors(request, Response.json(publicParcel(parcel)));
  }

  if (segments[0] === "parcels" && segments.length === 3 && request.method === "POST") {
    if (!requireAuth(auth)) {
      return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    }
    const action = segments[2];
    let parcel;
    if (action === "refresh") {
      parcel = await refreshParcelResolved(segments[1], auth.keyId);
    } else if (action === "watch") {
      parcel = setWatching(segments[1], auth.keyId, true);
    } else if (action === "unwatch") {
      parcel = setWatching(segments[1], auth.keyId, false);
    } else {
      return withCors(request, jsonError(404, "not_found", `Unknown shipsignal path /${segments.join("/")}`));
    }
    if (!parcel) return withCors(request, jsonError(404, "not_found", "Parcel not found"));
    return withCors(request, Response.json(publicParcel(parcel)));
  }

  return withCors(request, jsonError(404, "not_found", `Unknown shipsignal path /${segments.join("/")}`));
}

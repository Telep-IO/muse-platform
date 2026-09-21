import { apiUrl } from "@/lib/site";
import { TryItForm } from "@/components/TryItForm";
import { SITE } from "@/lib/site";

export const metadata = { title: "Gateway docs" };

export default function DocsPage() {
  return (
    <article className="product-hero prose">
      <div className="kicker">Operators & builders</div>
      <h1>How the gateway works</h1>
      <p>
        One Next.js deploy serves the catalog at <code>muse.telep.io</code> and the API at{" "}
        <code>api.muse.telep.io</code>. Preview and local use a single host: catalog at{" "}
        <code>/</code>, API at <code>/v1</code>, <code>/mcp</code>, and <code>/health</code>.
      </p>

      <h2>Hosts</h2>
      <ul>
        <li>
          Production catalog: <code>https://muse.telep.io</code>
        </li>
        <li>
          Production API: <code>https://api.muse.telep.io</code> — if the Host header contains{" "}
          <code>api.</code>, <code>/</code> rewrites to the connector index.
        </li>
        <li>
          Local: set <code>NEXT_PUBLIC_CATALOG_URL</code> and <code>NEXT_PUBLIC_API_URL</code> (both{" "}
          <code>http://localhost:3000</code> in <code>.env.example</code>).
        </li>
      </ul>

      <h2>Path scheme</h2>
      <pre className="panel">
        <code>{`GET  ${apiUrl("/health")}
GET  ${apiUrl("/v1")}
GET  ${apiUrl("/v1/openapi.json")}
GET  ${apiUrl("/v1/{slug}")}
POST ${apiUrl("/v1/{slug}/...")}
POST ${apiUrl("/mcp/{slug}")}`}</code>
      </pre>

      <h2>Auth</h2>
      <p>
        Write routes and job reads require <code>Authorization: Bearer &lt;key&gt;</code>. Keys look
        like <code>muse_sk_demo_localdev</code> — <code>muse_sk_&#123;demo|test|live&#125;_&#123;token&#125;</code>.
        Configure them in <code>MUSE_API_KEYS</code>. Missing keys on writes return 401.
      </p>

      <h2 id="paper-send">PaperSend stub</h2>
      <p>
        <code>POST /v1/paper-send/jobs</code> records an in-memory draft. It does not print or mail.
        The live PaperSend app still owns PDF rasterization and the mail provider. MCP tools:{" "}
        <code>create_mail_job</code>, <code>get_job</code>, <code>list_jobs</code> at{" "}
        <code>{apiUrl("/mcp/paper-send")}</code>. The try-it form posts to this origin so local,
        preview, and production catalog hosts all work without CORS gymnastics.
      </p>
      <TryItForm />

      <h2 id="sumvid">Sumvid stub</h2>
      <p>
        <code>POST /v1/sumvid/summaries</code> records an in-memory stub from a YouTube URL. It does
        not fetch captions and does not call a paid summarizer. MCP tools:{" "}
        <code>summarize_youtube</code>, <code>get_summary</code>, <code>get_account</code> at{" "}
        <code>{apiUrl("/mcp/sumvid")}</code>.
      </p>
      <pre className="panel">
        <code>{`curl -H "Authorization: Bearer muse_sk_demo_localdev" \\
  -H "Content-Type: application/json" \\
  -d '{"youtubeUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \\
  ${apiUrl("/v1/sumvid/summaries")}`}</code>
      </pre>

      <h2 id="shipsignal">ShipSignal stub</h2>
      <p>
        <code>POST /v1/shipsignal/parcels</code> records an in-memory stub from a tracking number.
        The timeline is hashed from that number; no UPS, USPS, FedEx, or DHL API is called. MCP
        tools: <code>track_package</code>, <code>list_parcels</code>, <code>refresh_parcel</code>,{" "}
        <code>watch_parcel</code>, <code>unwatch_parcel</code>, <code>get_account</code> at{" "}
        <code>{apiUrl("/mcp/shipsignal")}</code>.
      </p>
      <pre className="panel">
        <code>{`curl -H "Authorization: Bearer muse_sk_demo_localdev" \\
  -H "Content-Type: application/json" \\
  -d '{"trackingNumber":"1Z999AA10123456784"}' \\
  ${apiUrl("/v1/shipsignal/parcels")}`}</code>
      </pre>

      <h2>Add a connector module</h2>
      <ol>
        <li>
          Add typed metadata in <code>packages/registry</code>.
        </li>
        <li>
          Create <code>connectors/&#123;slug&#125;</code> with REST, MCP, and OpenAPI.
        </li>
        <li>
          Register the handlers in <code>lib/gateway.ts</code>.
        </li>
        <li>
          Fill out <code>SUBMISSION.md</code> with gateway URLs before sending Meta the listing.
        </li>
      </ol>
      <p>
        Users still apply at{" "}
        <a href={SITE.musePlatform} rel="noreferrer">
          muse.ai/platform
        </a>
        . This repo is Telep’s catalog and edge, not Meta’s directory.
      </p>
    </article>
  );
}

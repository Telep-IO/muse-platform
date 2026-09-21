"use client";

import { useState } from "react";

export function TryItForm() {
  const [out, setOut] = useState("Submit to create a stub PaperSend job.");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = String(form.get("key") || "");
    setBusy(true);
    try {
      const response = await fetch("/v1/paper-send/jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Ada Lovelace",
            address_line1: "10 St James's Square",
            address_city: "Cleveland",
            address_state: "OH",
            address_zip: "44113",
          },
          recipient: {
            name: "Telep IO",
            address_line1: "PO Box 1",
            address_city: "Cleveland",
            address_state: "OH",
            address_zip: "44101",
          },
          document: { filename: "letter.pdf", pages: 1 },
        }),
      });
      const json = await response.json();
      setOut(`${response.status}\n${JSON.stringify(json, null, 2)}`);
    } catch (error) {
      setOut(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tryit" onSubmit={onSubmit}>
      <label htmlFor="key">Demo API key</label>
      <input
        id="key"
        name="key"
        defaultValue="muse_sk_demo_localdev"
        autoComplete="off"
        spellCheck={false}
      />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Sending…" : "POST /v1/paper-send/jobs"}
      </button>
      <pre className="panel">
        <code>{out}</code>
      </pre>
    </form>
  );
}

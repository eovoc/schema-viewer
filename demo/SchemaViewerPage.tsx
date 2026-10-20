// Demo page: loads a JSON Schema from a URL.
// The URL of the schema is kept in the address bar (?schema=…) so a link can be shared.
// Step 1: shows the raw JSON. The UML diagram comes in the next steps.
import { useEffect, useState, type FormEvent } from "react";

export const DEFAULT_SCHEMA = "https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json";

function schemaFromAddressBar(): string {
  return new URLSearchParams(window.location.search).get("schema") || DEFAULT_SCHEMA;
}

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; schema: unknown };

export default function SchemaViewerPage() {
  const [url, setUrl] = useState(schemaFromAddressBar); // schema displayed
  const [draft, setDraft] = useState(url); // text of the input field
  const [result, setResult] = useState<{ url: string; loaded: Loaded } | null>(null);

  // browser back / forward buttons
  useEffect(() => {
    const onPop = () => {
      const u = schemaFromAddressBar();
      setUrl(u);
      setDraft(u);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // load the schema each time the URL changes
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((schema) => {
        if (!controller.signal.aborted) setResult({ url, loaded: { status: "ready", schema } });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setResult({ url, loaded: { status: "error", message: String(e.message ?? e) } });
      });
    return () => controller.abort();
  }, [url]);

  const load = (e: FormEvent) => {
    e.preventDefault();
    const next = draft.trim();
    if (!next || next === url) return;
    setUrl(next);
    window.history.pushState(null, "", next === DEFAULT_SCHEMA ? window.location.pathname : `?schema=${encodeURIComponent(next)}`);
  };

  const loaded: Loaded = result?.url === url ? result.loaded : { status: "loading" };

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">JSON Schema Viewer</span>
        <div className="navbar-links">
          <a href="./" className="nav-link active" aria-current="page">
            UML
          </a>
        </div>
      </nav>

      <main className="page-content">
        <form className="schema-form" onSubmit={load}>
          <label htmlFor="schema-url">JSON Schema URL</label>
          <input id="schema-url" type="url" required value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
          <button type="submit">Load</button>
        </form>

        <section className="panel">
          {loaded.status === "loading" && <p className="message">Loading…</p>}
          {loaded.status === "error" && <p className="message message--error">Could not load the schema: {loaded.message}</p>}
          {loaded.status === "ready" && <pre className="json">{JSON.stringify(loaded.schema, null, 2)}</pre>}
        </section>
      </main>
    </div>
  );
}

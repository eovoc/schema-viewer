// Demo page: loads a JSON Schema from a URL, together with every schema it references.
// The URL of the schema is kept in the address bar (?schema=…) so a link can be shared.
// Step 2: lists the loaded documents. The UML diagram comes in the next steps.
import { useEffect, useState, type FormEvent } from "react";
import { fileName, loadSchemaBundle } from "../src/core/loader";
import type { SchemaBundle } from "../src/core/types";

export const DEFAULT_SCHEMA = "https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json";

function schemaFromAddressBar(): string {
  return new URLSearchParams(window.location.search).get("schema") || DEFAULT_SCHEMA;
}

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; bundle: SchemaBundle };

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

  // load the schema and the documents it references each time the URL changes
  useEffect(() => {
    const controller = new AbortController();
    loadSchemaBundle(url, { signal: controller.signal }).then(
      (bundle) => !controller.signal.aborted && setResult({ url, loaded: { status: "ready", bundle } }),
      (e) => !controller.signal.aborted && setResult({ url, loaded: { status: "error", message: e instanceof Error ? e.message : String(e) } })
    );
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
          {loaded.status === "ready" && <Documents key={url} bundle={loaded.bundle} />}
        </section>
      </main>
    </div>
  );
}

/** Table of the loaded documents; a click on a row shows its JSON */
function Documents({ bundle }: { bundle: SchemaBundle }) {
  const [shown, setShown] = useState(bundle.root);
  const errorOf = (url: string) => bundle.errors.find((e) => e.url === url);
  const definitionCount = (url: string) => {
    const doc = bundle.documents[url];
    return Object.keys(doc?.definitions ?? doc?.$defs ?? {}).length;
  };

  return (
    <>
      <table className="documents">
        <thead>
          <tr>
            <th>Document</th>
            <th>Definitions</th>
            <th>Referenced by</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(bundle.referencedBy).map((url) => {
            const error = errorOf(url);
            return (
              <tr
                key={url}
                className={`${url === shown ? "selected" : ""} ${error ? "failed" : ""}`}
                onClick={() => !error && setShown(url)}
              >
                <td>
                  <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    {fileName(url)}
                  </a>
                  {url === bundle.root && <span className="tag">root</span>}
                </td>
                <td>{error ? `not loaded: ${error.message}` : definitionCount(url)}</td>
                <td>{bundle.referencedBy[url].map(fileName).join(", ") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {bundle.errors
        .filter((e) => !(e.url in bundle.referencedBy))
        .map((e) => (
          <p key={`${e.from}|${e.url}`} className="message message--error">
            {fileName(e.from)}: {e.url}: {e.message}
          </p>
        ))}
      <h2 className="json-title">{fileName(shown)}</h2>
      <pre className="json">{JSON.stringify(bundle.documents[shown], null, 2)}</pre>
    </>
  );
}

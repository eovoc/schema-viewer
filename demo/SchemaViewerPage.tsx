// Demo page: loads a JSON Schema from a URL (and every schema it references) and shows its definitions as UML diagrams.
// The page state is kept in the address bar, so a link can be shared and the back button works:
//   ?schema=<URL of the root schema>&def=<definition, as a $ref from the root: "#/definitions/X", "mdj.json#/definitions/Y">
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { loadSchemaBundle, relativeRef } from "../src/core/loader";
import { buildSchemaModel, findDefinition } from "../src/core/schemaModel";
import type { DefId, SchemaModel } from "../src/core/types";
import Diagram from "../src/ui/Diagram";
import Toc from "../src/ui/Toc";
import "../src/styles.css";

export const DEFAULT_SCHEMA = "https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json";

interface PageState {
  schema: string;
  def?: string;
}

function readAddressBar(): PageState {
  const params = new URLSearchParams(window.location.search);
  return { schema: params.get("schema") || DEFAULT_SCHEMA, def: params.get("def") || undefined };
}

// readable query string: "/" and ":" are kept as is, "#" must be encoded
const encode = (v: string) => encodeURIComponent(v).replace(/%2F/gi, "/").replace(/%3A/gi, ":");

function writeAddressBar(state: PageState, replace = false) {
  const params: string[] = [];
  if (state.schema !== DEFAULT_SCHEMA) params.push(`schema=${encode(state.schema)}`);
  if (state.def) params.push(`def=${encode(state.def)}`);
  const url = `${window.location.pathname}${params.length ? `?${params.join("&")}` : ""}`;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; model: SchemaModel };

export default function SchemaViewerPage() {
  const [state, setState] = useState(readAddressBar);
  const [draft, setDraft] = useState(state.schema); // text of the input field
  const [result, setResult] = useState<{ schema: string; loaded: Loaded } | null>(null);

  // browser back / forward buttons
  useEffect(() => {
    const onPop = () => {
      const s = readAddressBar();
      setState(s);
      setDraft(s.schema);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // load the schema and the documents it references, then build the UML model
  const { schema } = state;
  useEffect(() => {
    const controller = new AbortController();
    loadSchemaBundle(schema, { signal: controller.signal }).then(
      (bundle) => !controller.signal.aborted && setResult({ schema, loaded: { status: "ready", model: buildSchemaModel(bundle) } }),
      (e) => !controller.signal.aborted && setResult({ schema, loaded: { status: "error", message: e instanceof Error ? e.message : String(e) } })
    );
    return () => controller.abort();
  }, [schema]);

  const load = (e: FormEvent) => {
    e.preventDefault();
    const next = draft.trim();
    if (!next || next === state.schema) return;
    const s = { schema: next };
    setState(s);
    writeAddressBar(s);
  };

  const loaded: Loaded = result?.schema === schema ? result.loaded : { status: "loading" };
  const model = loaded.status === "ready" ? loaded.model : undefined;

  const select = useCallback(
    (id: DefId) => {
      if (!model) return;
      const s = { schema, def: relativeRef(id, model.root) };
      setState(s);
      writeAddressBar(s);
    },
    [model, schema]
  );

  const selected = model && (state.def ? findDefinition(model, state.def) : model.defaultDefinition);

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

        {loaded.status === "loading" && <p className="panel message">Loading…</p>}
        {loaded.status === "error" && <p className="panel message message--error">Could not load the schema: {loaded.message}</p>}
        {model && (
          <div className="schema-viewer">
            <Toc model={model} focus={selected} onSelect={select} />
            {selected ? (
              <Diagram model={model} focus={selected} onSelect={select} />
            ) : (
              <section className="panel">
                <p className="message">Definition not found: {state.def}</p>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

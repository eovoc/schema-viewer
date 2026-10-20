// Demo page: <SchemaViewer> on any JSON Schema given by URL.
// It imports the package by its name, exactly like another application would (vite.config.ts maps the name to src/).
// The page state is kept in the address bar, so a link can be shared and the back button works:
//   ?schema=<URL of the root schema>&def=<definition, as a $ref from the root: "#/definitions/X", "mdj.json#/definitions/Y">
import { useEffect, useState, type SubmitEvent } from "react";
import { relativeRef, SchemaViewer, type DefId, type SchemaModel } from "@eovoc/schema-viewer";
import "@eovoc/schema-viewer/style.css";

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

function writeAddressBar(state: PageState) {
  const params: string[] = [];
  if (state.schema !== DEFAULT_SCHEMA) params.push(`schema=${encode(state.schema)}`);
  if (state.def) params.push(`def=${encode(state.def)}`);
  const query = params.length ? "?" + params.join("&") : "";
  window.history.pushState(null, "", window.location.pathname + query);
}

export default function SchemaViewerPage() {
  const [state, setState] = useState(readAddressBar);
  const [draft, setDraft] = useState(state.schema); // text of the input field

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

  const load = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const schema = draft.trim();
    if (!schema || schema === state.schema) return;
    const next = { schema };
    setState(next);
    writeAddressBar(next);
  };

  // the viewer gives the full id of the chosen definition; the address bar keeps the short form
  const select = (id: DefId, model: SchemaModel) => {
    const next = { schema: state.schema, def: relativeRef(id, model.root) };
    setState(next);
    writeAddressBar(next);
  };

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

        <SchemaViewer className="page-viewer" src={state.schema} selected={state.def} onSelect={select} />
      </main>
    </div>
  );
}

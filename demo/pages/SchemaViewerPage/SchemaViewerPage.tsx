// Demo page: <SchemaViewer> on any JSON Schema given by URL.
// It imports the package by its name, exactly like another application would (vite.config.ts maps the name to src/).
// The page state is kept in the address bar (utils/addressBar.ts): a link can be shared and the back button works.
import { useEffect, useState, type SubmitEvent } from "react";
import { relativeRef, SchemaViewer, type DefId, type SchemaModel } from "@eovoc/schema-viewer";
import "@eovoc/schema-viewer/style.css";
import Navbar from "../../components/Navbar";
import { readAddressBar, writeAddressBar } from "../../utils/addressBar";

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
      <Navbar />

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

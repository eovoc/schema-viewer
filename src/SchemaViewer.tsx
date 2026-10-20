// <SchemaViewer>: loads a JSON Schema (and every schema it references) and shows its definitions
// as UML class diagrams: table of contents on the left, diagram of the selected definition on the right.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { loadSchemaBundle, type FetchSchema } from "./core/loader";
import { buildSchemaModel, findDefinition } from "./core/schemaModel";
import type { DefId, SchemaModel } from "./core/types";
import Diagram from "./ui/Diagram";
import Toc from "./ui/Toc";

export interface SchemaViewerProps {
  /** URL of the root JSON Schema. The schemas it references ($ref, relative or absolute) are loaded too. */
  src: string;
  /**
   * Selected definition, as a $ref written in the root schema ("#/definitions/EarthObservation",
   * "mdj.json#/definitions/LI_Lineage") or a full id. When this prop is passed, the selection is controlled:
   * update it in `onSelect`. `undefined` shows the default definition (target of the root $ref, or the first class).
   */
  selected?: string;
  /** A definition was chosen (table of contents, click in the diagram). `id` is its full id, see `relativeRef`. */
  onSelect?: (id: DefId, model: SchemaModel) => void;
  /** The schema and the schemas it references are loaded */
  onLoad?: (model: SchemaModel) => void;
  /** The root schema could not be loaded */
  onError?: (error: Error) => void;
  /** How to download a schema (authentication, cache…). Default: fetch + JSON.parse */
  fetchSchema?: FetchSchema;
  /** Show the table of contents. Default true */
  showToc?: boolean;
  /** Initial state of "Neighbour details" (attributes of the neighbouring classes). Default false */
  neighbourDetails?: boolean;
  /** Initial state of "Constraints" ({unique}, {closed}, {format=…}… in the boxes). Default true */
  showConstraints?: boolean;
  className?: string;
  style?: CSSProperties;
}

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; model: SchemaModel };

export default function SchemaViewer(props: Readonly<SchemaViewerProps>) {
  const { src, selected, onSelect, fetchSchema, showToc = true, neighbourDetails = false, showConstraints = true, className, style } = props;
  const controlled = "selected" in props;

  // callbacks are read through a ref: a new function on each render of the parent must not reload the schema
  const callbacks = useRef({ onLoad: props.onLoad, onError: props.onError, fetchSchema });
  useEffect(() => {
    callbacks.current = { onLoad: props.onLoad, onError: props.onError, fetchSchema };
  });

  // load the schema and the documents it references, then build the UML model
  const [result, setResult] = useState<{ src: string; loaded: Loaded } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadSchemaBundle(src, { signal: controller.signal, fetchSchema: callbacks.current.fetchSchema })
      .then((bundle) => {
        if (controller.signal.aborted) return;
        const model = buildSchemaModel(bundle);
        setResult({ src, loaded: { status: "ready", model } });
        callbacks.current.onLoad?.(model);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        const error = e instanceof Error ? e : new Error(String(e));
        setResult({ src, loaded: { status: "error", message: error.message } });
        callbacks.current.onError?.(error);
      });
    return () => controller.abort();
  }, [src]);
  const loaded: Loaded = result?.src === src ? result.loaded : { status: "loading" };
  const model = loaded.status === "ready" ? loaded.model : undefined;

  // selection: from the `selected` prop when controlled, otherwise kept here
  const [own, setOwn] = useState<string | undefined>(undefined);
  const requested = controlled ? selected : own;
  const focus = model && (requested ? findDefinition(model, requested) : model.defaultDefinition);
  const select = (id: DefId) => {
    if (!model) return;
    if (!controlled) setOwn(id);
    onSelect?.(id, model);
  };

  return (
    <div className={["schema-viewer", showToc && model ? "" : "schema-viewer--no-toc", className].filter(Boolean).join(" ")} style={style}>
      {loaded.status === "loading" && <p className="uml-main uml-message uml-message--delayed">Loading schema…</p>}
      {loaded.status === "error" && <p className="uml-main uml-message uml-message--error">Could not load the schema: {loaded.message}</p>}
      {model && showToc && <Toc model={model} focus={focus} onSelect={select} />}
      {model &&
        (focus ? (
          <Diagram model={model} focus={focus} onSelect={select} neighbourDetails={neighbourDetails} constraints={showConstraints} />
        ) : (
          <p className="uml-main uml-message">
            {requested ? `Definition not found: ${requested}` : "This schema has no definitions."}
          </p>
        ))}
    </div>
  );
}

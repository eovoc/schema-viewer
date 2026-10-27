// <SchemaViewer>: loads a JSON Schema (and every schema it references) and shows its definitions
// as UML class diagrams: table of contents on the left, diagram of the selected definition on the right.
import { useState, type CSSProperties } from "react";
import { useSchemaModel } from "../../hooks/useSchemaModel";
import type { FetchSchema } from "../../services/schemaLoader";
import { findDefinition } from "../../utils/schemaModel";
import type { DefId, SchemaModel } from "../../types/schema";
import Diagram from "../Diagram";
import Toc from "../Toc";

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
  /** Initial state of "Enumerations" (enumerations used by a class, shown on its right). Default true */
  showEnumerations?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function SchemaViewer(props: Readonly<SchemaViewerProps>) {
  const { src, selected, onSelect, fetchSchema, showToc = true, neighbourDetails = false, showConstraints = true, showEnumerations = true, className, style } = props;
  const controlled = "selected" in props;

  // load the schema and the documents it references, then build the UML model
  const loaded = useSchemaModel(src, { onLoad: props.onLoad, onError: props.onError, fetchSchema });
  const model = loaded.status === "ready" ? loaded.model : undefined;

  // selection: from the `selected` prop when controlled, otherwise kept here
  const [ownSelection, setOwnSelection] = useState<string | undefined>(undefined);
  const requested = controlled ? selected : ownSelection;
  const focus = model && (requested ? findDefinition(model, requested) : model.defaultDefinition);
  const select = (id: DefId) => {
    if (!model) return;
    if (!controlled) setOwnSelection(id);
    onSelect?.(id, model);
  };

  return (
    <div className={["schema-viewer", showToc && model ? "" : "schema-viewer--no-toc", className].filter(Boolean).join(" ")} style={style}>
      {loaded.status === "loading" && <p className="uml-main uml-message uml-message--delayed">Loading schema…</p>}
      {loaded.status === "error" && <p className="uml-main uml-message uml-message--error">Could not load the schema: {loaded.message}</p>}
      {model && showToc && <Toc model={model} focus={focus} onSelect={select} />}
      {model &&
        (focus ? (
          <Diagram model={model} focus={focus} onSelect={select} neighbourDetails={neighbourDetails} constraints={showConstraints} enumerations={showEnumerations} />
        ) : (
          <p className="uml-main uml-message">
            {requested ? `Definition not found: ${requested}` : "This schema has no definitions."}
          </p>
        ))}
    </div>
  );
}

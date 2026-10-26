// Loads a JSON Schema and every schema it references, then builds its UML model (used by <SchemaViewer>).
// noinspection ES6PreferShortImport

import { useEffect, useRef, useState } from "react";
import { loadSchemaBundle, type FetchSchema } from "../services/schemaLoader";
import type { SchemaModel } from "../types/schema";
import { buildSchemaModel } from "../utils/schemaModel";

/** Where the load of a schema stands */
export type SchemaLoad = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; model: SchemaModel };

export interface SchemaLoadCallbacks {
  /** The schema and the schemas it references are loaded */
  onLoad?: (model: SchemaModel) => void;
  /** The root schema could not be loaded */
  onError?: (error: Error) => void;
  /** How to download a schema. Default: fetch + JSON.parse */
  fetchSchema?: FetchSchema;
}

/** Loads `src` and the schemas it references, then builds the UML model. Loads again only when `src` changes. */
export function useSchemaModel(src: string, { onLoad, onError, fetchSchema }: SchemaLoadCallbacks): SchemaLoad {
  // callbacks are read through a ref: a new function on each render of the parent must not reload the schema
  const callbacks = useRef({ onLoad, onError, fetchSchema });
  useEffect(() => {
    callbacks.current = { onLoad, onError, fetchSchema };
  });

  const [result, setResult] = useState<{ src: string; loaded: SchemaLoad } | null>(null);
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
  // until the new schema is loaded, a result for a previous `src` is not shown
  return result?.src === src ? result.loaded : { status: "loading" };
}

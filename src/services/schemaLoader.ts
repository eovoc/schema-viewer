// Loads a JSON Schema by URL, then every document it references through $ref (recursively).
//
//   "#/definitions/X"             same document: nothing to load
//   "mdj.json#/definitions/X"     relative: resolved against the URL of the document containing the $ref
//   "https://host/x.json#/…"      absolute: loaded as is
//   "http://json-schema.org/…"    JSON Schema meta-schemas: never loaded
import type { JsonSchema, LoadError, SchemaBundle } from "../core/types";
import { collectRefs, fileName, referencedDocument } from "../utils/refs";

export type FetchSchema = (url: string, signal?: AbortSignal) => Promise<JsonSchema>;

export interface LoadOptions {
  /** How to download a document. Default: fetch + JSON.parse */
  fetchSchema?: FetchSchema;
  /** Maximum number of documents (protects against huge reference graphs). Default 100 */
  maxDocuments?: number;
  signal?: AbortSignal;
}

export const defaultFetchSchema: FetchSchema = async (url, signal) => {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error("network error (unreachable host or cross-origin requests not allowed)", { cause: e });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try {
    return (await res.json()) as JsonSchema;
  } catch (e) {
    throw new Error("not valid JSON", { cause: e });
  }
};

/**
 * Loads `rootUrl` and every document reachable through $ref.
 * Rejects when the root cannot be loaded; other failures are listed in `errors`.
 */
export async function loadSchemaBundle(rootUrl: string, options: LoadOptions = {}): Promise<SchemaBundle> {
  const { fetchSchema = defaultFetchSchema, maxDocuments = 100, signal } = options;
  // relative root URLs are resolved against the current page
  const root = new URL(rootUrl.trim(), globalThis.location?.href).href.replace(/#.*$/, "");

  const documents: Record<string, JsonSchema> = {};
  const referencedBy: Record<string, string[]> = { [root]: [] };
  const errors: LoadError[] = [];

  try {
    documents[root] = await fetchSchema(root, signal);
  } catch (e) {
    throw new Error(`${fileName(root)}: ${e instanceof Error ? e.message : e}`, { cause: e });
  }

  // breadth first: the documents found at one level are loaded in parallel
  let level = [root];
  while (level.length) {
    const next: { url: string; from: string }[] = [];
    for (const from of level) {
      for (const ref of collectRefs(documents[from])) {
        let url: string | undefined;
        try {
          url = referencedDocument(ref, from);
        } catch {
          errors.push({ url: ref, from, message: "invalid reference" });
          continue;
        }
        if (!url || url === from) continue;
        if (referencedBy[url]) {
          if (!referencedBy[url].includes(from)) referencedBy[url].push(from);
          continue; // already loaded or being loaded
        }
        referencedBy[url] = [from];
        if (Object.keys(referencedBy).length > maxDocuments) {
          errors.push({ url, from, message: `not loaded: limit of ${maxDocuments} documents reached` });
          continue;
        }
        next.push({ url, from });
      }
    }
    const results = await Promise.allSettled(next.map(({ url }) => fetchSchema(url, signal)));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    results.forEach((r, i) => {
      if (r.status === "fulfilled") documents[next[i].url] = r.value;
      else errors.push({ ...next[i], message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    });
    level = next.map((n) => n.url).filter((url) => url in documents);
  }

  return { root, documents, referencedBy, errors };
}

// Loads a JSON Schema by URL, then every document it references through $ref (recursively).
//
//   "#/definitions/X"             same document: nothing to load
//   "mdj.json#/definitions/X"     relative: resolved against the URL of the document containing the $ref
//   "https://host/x.json#/…"      absolute: loaded as is
//   "http://json-schema.org/…"    JSON Schema meta-schemas: never loaded
import type { JsonSchema, LoadError, SchemaBundle } from "./types";

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

/** Last part of a URL: "https://host/schemas/mdj.json" -> "mdj.json" */
export const fileName = (url: string) => url.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() || url;

/** Every "$ref" value found in a schema (values of enum, const, examples and default are data, not schemas) */
export function collectRefs(schema: unknown, refs: string[] = []): string[] {
  if (Array.isArray(schema)) {
    schema.forEach((item) => collectRefs(item, refs));
  } else if (schema && typeof schema === "object") {
    for (const [key, value] of Object.entries(schema)) {
      if (key === "$ref" && typeof value === "string") refs.push(value);
      else if (!["enum", "const", "examples", "default"].includes(key)) collectRefs(value, refs);
    }
  }
  return refs;
}

/**
 * URL of the document a $ref points to, or undefined when it points inside the same document
 * or to a JSON Schema meta-schema.
 */
export function referencedDocument(ref: string, from: string): string | undefined {
  const file = ref.split("#")[0];
  if (!file) return undefined;
  const url = new URL(file, from).href;
  return /^https?:\/\/json-schema\.org\//.test(url) ? undefined : url;
}

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

// ---------------------------------------------------------------------------
// Resolution of a $ref to a location inside the loaded documents

export const escapePointer = (segment: string) => segment.replace(/~/g, "~0").replace(/\//g, "~1");
export const unescapePointer = (segment: string) => segment.replace(/~1/g, "/").replace(/~0/g, "~");

/** Last segment of a JSON Pointer: "/definitions/thesaurus/product-types" -> "product-types" */
export const pointerName = (pointer: string) => unescapePointer(pointer.slice(pointer.lastIndexOf("/") + 1));

/** Value at a JSON Pointer ("" = the whole document) */
export function getPointer(doc: JsonSchema, pointer: string): unknown {
  if (pointer === "") return doc;
  let value: unknown = doc;
  for (const segment of pointer.slice(1).split("/")) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as JsonSchema)[unescapePointer(segment)];
  }
  return value;
}

/** Location of a plain-name fragment ("#Foo"): a sub-schema with `$anchor: "Foo"` or (draft-07) `$id: "#Foo"` */
function findAnchor(node: unknown, anchor: string, pointer = ""): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const obj = node as JsonSchema;
  if (obj.$anchor === anchor || obj.$id === `#${anchor}`) return pointer;
  for (const [key, value] of Object.entries(obj)) {
    if (["enum", "const", "examples", "default"].includes(key)) continue;
    const found = findAnchor(value, anchor, `${pointer}/${escapePointer(key)}`);
    if (found !== undefined) return found;
  }
  return undefined;
}

export interface ResolvedRef {
  /** "<document URL>#<JSON Pointer>" of the target, when it exists in the loaded documents */
  id?: string;
  /** Name to show when the target is not found */
  label: string;
}

/**
 * Finds the target of `ref`, written in document `from`, among the loaded `documents`.
 * Tolerates (and reports) the malformed fragments found in mdj.json:
 * "#CountryCode" (anchor never declared) is read as "#/definitions/CountryCode".
 */
export function resolveRef(ref: string, from: string, documents: Record<string, JsonSchema>, report: (message: string) => void): ResolvedRef {
  const hash = ref.indexOf("#");
  let fragment = hash < 0 ? "" : ref.slice(hash + 1);
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    // keep it as is
  }
  let url: string;
  try {
    url = new URL(hash < 0 ? ref : ref.slice(0, hash), from).href;
  } catch {
    report(`${fileName(from)}: invalid reference "${ref}"`);
    return { label: ref };
  }
  if (/^https?:\/\/json-schema\.org\//.test(url)) return { label: "JSONSchema" };
  const doc = documents[url];
  if (!doc) return { label: ref }; // document not loaded: already reported by the loader

  if (fragment === "" || fragment === "/") return { id: `${url}#`, label: fileName(url) };
  let pointer = fragment;
  if (!fragment.startsWith("/")) {
    const anchor = findAnchor(doc, fragment);
    if (anchor !== undefined) {
      pointer = anchor;
    } else {
      const candidates = /^(definitions|\$defs)\//.test(fragment) ? [`/${fragment}`] : [`/definitions/${fragment}`, `/$defs/${fragment}`];
      pointer = candidates.find((p) => getPointer(doc, p) !== undefined) ?? candidates[0];
      report(`${fileName(from)}: malformed reference "${ref}" (JSON Pointer expected), read as ${fileName(url)}#${pointer}`);
    }
  }
  const target = getPointer(doc, pointer);
  if (!target || typeof target !== "object") {
    report(`${fileName(from)}: reference "${ref}" not found`);
    return { label: pointerName(pointer) || ref };
  }
  return { id: `${url}#${pointer}`, label: pointerName(pointer) };
}

/** Inverse of resolveRef for display and URLs: the shortest $ref, written in `base`, that points to `id` */
export function relativeRef(id: string, base: string): string {
  const hash = id.indexOf("#");
  const [url, pointer] = [id.slice(0, hash), id.slice(hash + 1)];
  if (url === base) return `#${pointer}`;
  const dir = base.slice(0, base.lastIndexOf("/") + 1);
  const relative = url.startsWith(dir) && !url.slice(dir.length).includes("/") ? url.slice(dir.length) : url;
  return `${relative}#${pointer}`;
}

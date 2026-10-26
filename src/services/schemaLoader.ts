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

/** A document to load, and the document whose $ref points to it */
interface Pending {
  url: string;
  from: string;
}

/** What a load has found so far */
interface LoadState {
  documents: Record<string, JsonSchema>;
  referencedBy: Record<string, string[]>;
  errors: LoadError[];
  maxDocuments: number;
}

/** URL of the document that `ref` points to; undefined for the same document, a meta-schema or an invalid reference (reported) */
function targetDocument(ref: string, from: string, state: LoadState): string | undefined {
  try {
    const url = referencedDocument(ref, from);
    return url === from ? undefined : url;
  } catch {
    state.errors.push({ url: ref, from, message: "invalid reference" });
    return undefined;
  }
}

/** Records that `from` references `url`. True when `url` must be loaded: seen for the first time, within the limit. */
function register(url: string, from: string, state: LoadState): boolean {
  const referrers = state.referencedBy[url];
  if (referrers) {
    if (!referrers.includes(from)) referrers.push(from);
    return false; // already loaded or being loaded
  }
  state.referencedBy[url] = [from];
  if (Object.keys(state.referencedBy).length > state.maxDocuments) {
    state.errors.push({ url, from, message: `not loaded: limit of ${state.maxDocuments} documents reached` });
    return false;
  }
  return true;
}

/** Documents referenced by the documents of `level` and not seen before */
function newReferences(level: string[], state: LoadState): Pending[] {
  const next: Pending[] = [];
  for (const from of level) {
    for (const ref of collectRefs(state.documents[from])) {
      const url = targetDocument(ref, from, state);
      if (url && register(url, from, state)) next.push({ url, from });
    }
  }
  return next;
}

/**
 * Breadth first: loads in parallel the documents referenced by `level`, then does the same with them.
 * Failures are listed in `state.errors`.
 */
async function loadLevel(level: string[], state: LoadState, fetchSchema: FetchSchema, signal?: AbortSignal): Promise<void> {
  const next = newReferences(level, state);
  const results = await Promise.allSettled(next.map(({ url }) => fetchSchema(url, signal)));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  results.forEach((r, i) => {
    if (r.status === "fulfilled") state.documents[next[i].url] = r.value;
    else state.errors.push({ ...next[i], message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });
  const loaded = next.map((n) => n.url).filter((url) => url in state.documents);
  if (loaded.length) await loadLevel(loaded, state, fetchSchema, signal);
}

/**
 * Loads `rootUrl` and every document reachable through $ref.
 * Rejects when the root cannot be loaded; other failures are listed in `errors`.
 */
export async function loadSchemaBundle(rootUrl: string, options: LoadOptions = {}): Promise<SchemaBundle> {
  const { fetchSchema = defaultFetchSchema, maxDocuments = 100, signal } = options;
  // relative root URLs are resolved against the current page; the fragment is dropped
  const url = new URL(rootUrl.trim(), globalThis.location?.href);
  url.hash = "";
  const root = url.href;

  const state: LoadState = { documents: {}, referencedBy: { [root]: [] }, errors: [], maxDocuments };
  try {
    state.documents[root] = await fetchSchema(root, signal);
  } catch (e) {
    throw new Error(`${fileName(root)}: ${e instanceof Error ? e.message : e}`, { cause: e });
  }
  await loadLevel([root], state, fetchSchema, signal);

  return { root, documents: state.documents, referencedBy: state.referencedBy, errors: state.errors };
}

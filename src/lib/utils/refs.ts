// URLs and $ref: file name of a URL, $ref values of a schema, document a $ref points to,
// target of a $ref in the loaded documents (resolveRef) and the reverse (relativeRef).
import type { JsonSchema } from "../types/schema";
import { escapePointer, getPointer, pointerName } from "./jsonPointer";

/** Last part of a URL: "https://host/schemas/mdj.json" -> "mdj.json" (query, fragment and trailing slashes ignored) */
export function fileName(url: string): string {
  const end = url.search(/[?#]/);
  let path = end < 0 ? url : url.slice(0, end);
  while (path.endsWith("/")) path = path.slice(0, -1);
  return path.split("/").pop() || url;
}

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
  if (!doc) return { label: ref }; // document not loaded: already reported by loadSchemaBundle

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

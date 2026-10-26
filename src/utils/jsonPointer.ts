// JSON Pointers ("/definitions/MD_Metadata"): escaping of the segments, last segment, value at a pointer.
import type { JsonSchema } from "../core/types";

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

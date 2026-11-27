// Page state kept in the address bar, so a link can be shared and the back button works:
//   ?schema=<URL of the root schema>&def=<definition, as a $ref from the root: "#/definitions/X", "mdj.json#/definitions/Y">
// A data: URL schema is kept in the fragment instead (#schema=…&def=…): the fragment is never sent to the
// server, neither in the request nor in the Referer header, so a large schema cannot exceed the server's
// header size limit (HTTP 431 / 414).

export const DEFAULT_SCHEMA = "https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-strict.json";

export interface PageState {
  schema: string;
  def?: string;
}

export function readAddressBar(): PageState {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const params = hash.has("schema") ? hash : new URLSearchParams(window.location.search);
  return { schema: params.get("schema") || DEFAULT_SCHEMA, def: params.get("def") || undefined };
}

// readable query string: "/" and ":" are kept as is, "#" must be encoded
const encode = (v: string) => encodeURIComponent(v).replace(/%2F/gi, "/").replace(/%3A/gi, ":");

export function writeAddressBar(state: PageState) {
  const params: string[] = [];
  if (state.schema !== DEFAULT_SCHEMA) params.push(`schema=${encode(state.schema)}`);
  if (state.def) params.push(`def=${encode(state.def)}`);
  const inFragment = state.schema.startsWith("data:");
  const query = params.length ? (inFragment ? "#" : "?") + params.join("&") : "";
  window.history.pushState(null, "", window.location.pathname + query);
}

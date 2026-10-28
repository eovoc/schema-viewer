// Page state kept in the address bar, so a link can be shared and the back button works:
//   ?schema=<URL of the root schema>&def=<definition, as a $ref from the root: "#/definitions/X", "mdj.json#/definitions/Y">

export const DEFAULT_SCHEMA = "https://eovoc.github.io/eof-eos-validator/schemas/eof-eos-schema-soft.json";

export interface PageState {
  schema: string;
  def?: string;
}

export function readAddressBar(): PageState {
  const params = new URLSearchParams(window.location.search);
  return { schema: params.get("schema") || DEFAULT_SCHEMA, def: params.get("def") || undefined };
}

// readable query string: "/" and ":" are kept as is, "#" must be encoded
const encode = (v: string) => encodeURIComponent(v).replace(/%2F/gi, "/").replace(/%3A/gi, ":");

export function writeAddressBar(state: PageState) {
  const params: string[] = [];
  if (state.schema !== DEFAULT_SCHEMA) params.push(`schema=${encode(state.schema)}`);
  if (state.def) params.push(`def=${encode(state.def)}`);
  const query = params.length ? "?" + params.join("&") : "";
  window.history.pushState(null, "", window.location.pathname + query);
}

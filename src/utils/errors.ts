// Error messages.

/** Message of anything thrown: an Error, a string, or any other value (shown as JSON) */
export function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e) ?? "Unknown error"; // undefined, a function or a symbol give no JSON
  } catch {
    return "Unknown error"; // circular object, BigInt
  }
}

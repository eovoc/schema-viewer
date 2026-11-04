// loadSchemaBundle when the root schema cannot be loaded: the promise is rejected with a readable message
// that starts with the file name (shown by <SchemaViewer> as "Could not load the schema: …" and passed to onError).
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSchemaBundle } from "../../src/lib/services/schemaLoader";

const ROOT = "https://example.org/schemas/root.json";

/** Replaces the global fetch, used by the default fetchSchema */
const stubFetch = (impl: (url: string) => Promise<Response>) => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => impl(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadSchemaBundle: root schema", () => {
  it("rejects with 'network error' when the host cannot be reached", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));

    await expect(loadSchemaBundle(ROOT)).rejects.toThrow(
      "root.json: network error (unreachable host or cross-origin requests not allowed)"
    );
  });

  it("rejects with the HTTP status when the server answers with an error (404)", async () => {
    stubFetch(() => Promise.resolve(new Response("Not Found", { status: 404 })));

    await expect(loadSchemaBundle(ROOT)).rejects.toThrow("root.json: HTTP 404");
  });

  it("rejects with 'not valid JSON' when the document is not JSON", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>login page</html>", { status: 200 })));

    await expect(loadSchemaBundle(ROOT)).rejects.toThrow("root.json: not valid JSON");
  });

  it("keeps the original error as `cause`", async () => {
    const original = new TypeError("fetch failed");
    stubFetch(() => Promise.reject(original));

    const error = await loadSchemaBundle(ROOT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    // root.json: network error (…) <- network error (…) <- fetch failed
    expect(((error as Error).cause as Error).cause).toBe(original);
  });

  it("reports the error of a custom fetchSchema the same way", async () => {
    const fetchSchema = vi.fn(() => Promise.reject(new Error("401 Unauthorized")));

    await expect(loadSchemaBundle(ROOT, { fetchSchema })).rejects.toThrow("root.json: 401 Unauthorized");
    expect(fetchSchema).toHaveBeenCalledWith(ROOT, undefined);
  });

  it("requests the root once, without its fragment", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response("{}", { status: 200 })));

    const bundle = await loadSchemaBundle(`${ROOT}#/definitions/Foo`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ROOT);
    expect(bundle.root).toBe(ROOT);
    expect(bundle.errors).toEqual([]);
  });
});

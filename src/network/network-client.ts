/**
 * The only door to the network for REST. Library code never calls `fetch` directly: it
 * receives a `NetworkClient`. `createFetchNetworkClient` is the default, `fetch`-based one.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface NetworkRequest {
  method: HttpMethod;
  /** Absolute URL, query string included. */
  url: string;
  headers?: Record<string, string>;
  /** Already-serialised body (JSON text). */
  body?: string;
}

export interface NetworkResponse {
  status: number;
  /** Header names lower-cased. */
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface NetworkClient {
  /** Resolves for any HTTP status; rejects only when no response was received. */
  request(req: NetworkRequest): Promise<NetworkResponse>;
}

export function createFetchNetworkClient(
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args)
): NetworkClient {
  return {
    async request(req) {
      const init: RequestInit = { method: req.method };
      if (req.headers) init.headers = req.headers;
      if (req.body !== undefined) init.body = req.body;
      const res = await fetchImpl(req.url, init);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { status: res.status, headers, body: new Uint8Array(await res.arrayBuffer()) };
    },
  };
}

// @vitest-environment happy-dom
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import {
  ApiError,
  ScreenwriterClient,
  ScreenwriterClientProvider,
  queryKeys,
  useApplyCommands,
  useElements,
  useOutline,
  useScene,
  useScenes,
  type NetworkClient,
} from "../src";

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** Fake API for the command and scene-read routes; records every request. */
function fakeNetwork(opts: { commandsStatus?: number } = {}) {
  const calls: Call[] = [];
  let outlineVersion = 1;
  const network: NetworkClient = {
    async request(req) {
      const path = new URL(req.url).pathname;
      calls.push({ method: req.method, path, body: req.body ? JSON.parse(req.body as string) : undefined });
      const ok = (data: unknown) => ({
        status: 200,
        headers: {},
        body: new TextEncoder().encode(JSON.stringify({ success: true, data })),
      });
      if (path.endsWith("/commands")) {
        if (opts.commandsStatus && opts.commandsStatus !== 200) {
          return {
            status: opts.commandsStatus,
            headers: {},
            body: new TextEncoder().encode(
              JSON.stringify({ success: false, error: "stale", code: "CONTENT_CHANGED", details: { ids: ["el_1"] } })
            ),
          };
        }
        const dryRun = (JSON.parse((req.body as string | undefined) ?? "{}") as { dryRun?: boolean }).dryRun;
        if (!dryRun) outlineVersion += 1;
        return ok({ applied: dryRun ? 0 : 1, epoch: 0, effects: { createdIds: [], changedIds: [], deletedIds: [], newHashes: {} }, warnings: [] });
      }
      if (path.endsWith("/outline")) return ok({ scenes: [{ id: "el_s1", number: "1", heading: `V${outlineVersion}`, omitted: false, synopsis: "", elementCount: 3, contentHash: "v1:a" }] });
      if (path.endsWith("/scenes/batch")) return ok({ scenes: [] });
      if (path.endsWith("/elements/batch")) return ok({ elements: [] });
      return ok({ id: "el_s1", number: "1", heading: "H", synopsis: "", contentHash: "v1:a", elements: [] });
    },
  };
  return { network, calls };
}

const setup = (network: NetworkClient) => {
  const client = new ScreenwriterClient({ network, baseUrl: "http://x", getToken: async () => "t" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children?: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, createElement(ScreenwriterClientProvider, { client, children }));
  return { client, qc, wrapper };
};

describe("commands and scene reads", () => {
  it("hits the documented paths with the documented bodies", async () => {
    const { network, calls } = fakeNetwork();
    const { client } = setup(network);
    await client.applyCommands("doc_1", { commands: [{ id: "text.insert" }], baseEpoch: 3, dryRun: true });
    await client.getOutline("doc_1");
    await client.getScene("doc_1", "el/odd id");
    await client.getScenes("doc_1", ["el_a", "el_b"]);
    await client.getElements("doc_1", ["el_c"]);
    expect(calls).toEqual([
      { method: "POST", path: "/api/v1/documents/doc_1/commands", body: { commands: [{ id: "text.insert" }], baseEpoch: 3, dryRun: true } },
      { method: "GET", path: "/api/v1/documents/doc_1/outline", body: undefined },
      { method: "GET", path: "/api/v1/documents/doc_1/scenes/el%2Fodd%20id", body: undefined },
      { method: "POST", path: "/api/v1/documents/doc_1/scenes/batch", body: { sceneIds: ["el_a", "el_b"] } },
      { method: "POST", path: "/api/v1/documents/doc_1/elements/batch", body: { elementIds: ["el_c"] } },
    ]);
  });

  it("surfaces a stale-content refusal as an ApiError with the ids", async () => {
    const { network } = fakeNetwork({ commandsStatus: 409 });
    const { client } = setup(network);
    const err = await client.applyCommands("doc_1", { commands: [{}], baseEpoch: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("CONTENT_CHANGED");
    expect((err as ApiError).details).toEqual({ ids: ["el_1"] });
  });

  it("read hooks stay idle without their inputs", async () => {
    const { network, calls } = fakeNetwork();
    const { wrapper } = setup(network);
    renderHook(() => useOutline(undefined), { wrapper });
    renderHook(() => useScene("doc_1", undefined), { wrapper });
    renderHook(() => useScenes("doc_1", []), { wrapper });
    renderHook(() => useElements("doc_1", []), { wrapper });
    await new Promise(r => setTimeout(r, 20));
    expect(calls).toEqual([]);
  });

  it("a real batch refreshes the outline; a dry run does not", async () => {
    const { network, calls } = fakeNetwork();
    const { wrapper } = setup(network);
    const outline = renderHook(() => useOutline("doc_1"), { wrapper });
    await waitFor(() => expect(outline.result.current.data?.scenes[0]?.heading).toBe("V1"));
    const apply = renderHook(() => useApplyCommands("doc_1"), { wrapper });

    apply.result.current.mutate({ commands: [{ id: "x" }], baseEpoch: 0, dryRun: true });
    await waitFor(() => expect(apply.result.current.isSuccess).toBe(true));
    expect(calls.filter(c => c.path.endsWith("/outline")).length).toBe(1);

    apply.result.current.mutate({ commands: [{ id: "x" }], baseEpoch: 0 });
    await waitFor(() => expect(outline.result.current.data?.scenes[0]?.heading).toBe("V2"));
    expect(calls.filter(c => c.path.endsWith("/outline")).length).toBe(2);
  });

  it("scene and element keys sit under the document family and ignore id order", () => {
    expect(queryKeys.outline("d").slice(0, 3)).toEqual(queryKeys.documentFamily("d").slice(0, 3));
    expect(queryKeys.scenes("d", ["b", "a"])).toEqual(queryKeys.scenes("d", ["a", "b"]));
    expect(queryKeys.elements("d", ["b", "a"])).toEqual(queryKeys.elements("d", ["a", "b"]));
  });
});

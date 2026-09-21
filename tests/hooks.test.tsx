// @vitest-environment happy-dom
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import {
  ScreenwriterClient,
  ScreenwriterClientProvider,
  useCreateProject,
  useProjects,
  type NetworkClient,
} from "../src";

/** In-memory fake API: proves hooks hit the injected NetworkClient and invalidate the list on create. */
function fakeNetwork() {
  const projects: Array<{ id: string; name: string }> = [];
  const calls: string[] = [];
  const network: NetworkClient = {
    async request(req) {
      calls.push(`${req.method} ${new URL(req.url).pathname}`);
      const json = (status: number, data: unknown) => ({
        status,
        headers: {},
        body: new TextEncoder().encode(JSON.stringify({ success: true, data })),
      });
      if (req.method === "POST") {
        const p = { id: `prj_${projects.length + 1}`, ...JSON.parse(req.body ?? "{}") };
        projects.push(p);
        return json(201, p);
      }
      return json(200, { items: [...projects], nextCursor: null });
    },
  };
  return { network, calls };
}

describe("hooks", () => {
  it("creating a project refreshes the project list", async () => {
    const { network, calls } = fakeNetwork();
    const client = new ScreenwriterClient({ network, baseUrl: "http://x", getToken: async () => "t" });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children?: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, createElement(ScreenwriterClientProvider, { client, children }));

    const list = renderHook(() => useProjects("ws_1"), { wrapper });
    await waitFor(() => expect(list.result.current.data?.items).toEqual([]));
    const create = renderHook(() => useCreateProject("ws_1"), { wrapper });
    create.result.current.mutate({ name: "Alpha" });
    await waitFor(() => expect(list.result.current.data?.items.map(p => p.name)).toEqual(["Alpha"]));
    expect(calls).toEqual([
      "GET /api/v1/workspaces/ws_1/projects",
      "POST /api/v1/workspaces/ws_1/projects",
      "GET /api/v1/workspaces/ws_1/projects",
    ]);
  });
});

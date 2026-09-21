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

describe("AI hooks", () => {
  it("useAiJob polls until the job is terminal, then stops; acceptSuggestions surfaces CONTENT_CHANGED", async () => {
    const { useAiJob, useAcceptSuggestions, isApiError } = await import("../src");
    let polls = 0;
    const network: NetworkClient = {
      async request(req) {
        const path = new URL(req.url).pathname;
        const env = (status: number, body: object) => ({ status, headers: {}, body: new TextEncoder().encode(JSON.stringify(body)) });
        if (path.endsWith("/accept"))
          return env(409, { success: false, error: "changed", code: "CONTENT_CHANGED", details: { suggestionIds: ["sug_1"] } });
        polls++;
        return env(200, { success: true, data: { id: "job_1", status: polls < 3 ? "running" : "succeeded" } });
      },
    };
    const client = new ScreenwriterClient({ network, baseUrl: "http://x", getToken: async () => "t" });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children?: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, createElement(ScreenwriterClientProvider, { client, children }));
    const job = renderHook(() => useAiJob("job_1", 20), { wrapper });
    await waitFor(() => expect(job.result.current.data?.status).toBe("succeeded"));
    const seen = polls;
    await new Promise(r => setTimeout(r, 120));
    expect(polls).toBe(seen);

    const accept = renderHook(() => useAcceptSuggestions("doc_1", "sset_1"), { wrapper });
    accept.result.current.mutate(["sug_1"]);
    await waitFor(() => expect(accept.result.current.isError).toBe(true));
    const err = accept.result.current.error;
    expect(isApiError(err) && err.code).toBe("CONTENT_CHANGED");
    expect(isApiError(err) && err.details?.suggestionIds).toEqual(["sug_1"]);
  });
});

// @vitest-environment happy-dom
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  ApiError,
  MacroTriggerTakenError,
  OwnsTeamWorkspaceError,
  ReauthRequiredError,
  ScreenwriterClient,
  ScreenwriterClientProvider,
  StaleWriteError,
  mergeTopLevel,
  newWritingSessionId,
  queryKeys,
  useDeleteAccount,
  useDictionary,
  useMacros,
  useCreateMacro,
  useMyDocumentState,
  usePreferences,
  useRecordWritingSession,
  useSetMyDocumentState,
  useSetPreferences,
  useStarDocument,
  useWritingStats,
  type NetworkClient,
} from "../src";

interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  body: Record<string, unknown> | undefined;
}
type Fail = { __fail: { status: number; code: string; details?: object } };

function fake(handler: (c: Call, n: number) => unknown | Fail) {
  const calls: Call[] = [];
  const network: NetworkClient = {
    async request(req) {
      const u = new URL(req.url);
      const c: Call = { method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: req.body ? JSON.parse(req.body as string) : undefined };
      calls.push(c);
      const r = handler(c, calls.length) as Partial<Fail> | undefined;
      if (r && r.__fail) {
        return { status: r.__fail.status, headers: {}, body: new TextEncoder().encode(JSON.stringify({ success: false, error: "no", code: r.__fail.code, details: r.__fail.details })) };
      }
      return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify({ success: true, data: r ?? null })) };
    },
  };
  return { network, calls };
}

const setup = (network: NetworkClient) => {
  const client = new ScreenwriterClient({ network, baseUrl: "http://x", getToken: async () => "t", retry: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children?: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, createElement(ScreenwriterClientProvider, { client, children }));
  return { client, qc, wrapper };
};

const T0 = "2026-09-21T10:00:00.000Z";
const T1 = "2026-09-21T10:00:01.000Z";
const T2 = "2026-09-21T10:00:02.000Z";

describe("B13 client methods hit the documented routes", () => {
  it("every route, method, path, query and body", async () => {
    const { network, calls } = fake(() => ({}));
    const { client } = setup(network);
    await client.getPreferences();
    await client.getDictionary();
    await client.updateDictionary({ add: ["Voss"], remove: ["Vos"] });
    await client.listMacros();
    await client.createMacro({ name: "sig", trigger: { kind: "alias", value: "sig" }, insertText: "Best" });
    await client.updateMacro("mac_1", { name: "sig2" });
    await client.deleteMacro("mac_1");
    await client.getWritingStats({ from: "2026-09-01", to: "2026-09-21", granularity: "week", documentId: "doc_1" });
    await client.getWritingStats();
    await client.recordWritingSession({ clientSessionId: "wss_abc12345", documentId: "doc_1", startedAt: T0, endedAt: T1, activeSeconds: 1, wordsAdded: 2, wordsRemoved: 0, netPagesEighths: 1 });
    await client.getWritingGoals();
    await client.setWritingGoals([{ kind: "wordsPerDay", target: 500 }]);
    await client.requestAccountExport();
    await client.deleteAccount();
    await client.restoreAccount();
    await client.getMyDocumentState("doc/1");
    await client.starDocument("doc_1");
    await client.unstarDocument("doc_1");
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual([
      "GET /api/v1/me/preferences",
      "GET /api/v1/me/dictionary",
      "PUT /api/v1/me/dictionary",
      "GET /api/v1/me/macros",
      "POST /api/v1/me/macros",
      "PATCH /api/v1/me/macros/mac_1",
      "DELETE /api/v1/me/macros/mac_1",
      "GET /api/v1/me/writing-stats",
      "GET /api/v1/me/writing-stats",
      "POST /api/v1/me/writing-sessions",
      "GET /api/v1/me/writing-goals",
      "PUT /api/v1/me/writing-goals",
      "POST /api/v1/me/export",
      "DELETE /api/v1/me",
      "POST /api/v1/me/restore",
      "GET /api/v1/documents/doc%2F1/my-state",
      "PUT /api/v1/documents/doc_1/star",
      "DELETE /api/v1/documents/doc_1/star",
    ]);
    expect(calls[2]!.body).toEqual({ add: ["Voss"], remove: ["Vos"] });
    expect(calls[7]!.query).toEqual({ from: "2026-09-01", to: "2026-09-21", granularity: "week", documentId: "doc_1" });
    expect(calls[8]!.query).toEqual({});
    expect(calls[11]!.body).toEqual({ goals: [{ kind: "wordsPerDay", target: 500 }] });
    expect(calls[13]!.body).toEqual({ confirm: "DELETE" });
  });

  it("newWritingSessionId makes valid, distinct ids", () => {
    const a = newWritingSessionId();
    expect(a).toMatch(/^wss_[A-Za-z0-9]{32}$/);
    expect(newWritingSessionId()).not.toBe(a);
  });

  it("mergeTopLevel: keys of the update win, undefined is ignored, null deletes, updatedAt is dropped", () => {
    expect(mergeTopLevel<Record<string, unknown>>({ a: 1, b: 2, c: 3, updatedAt: T0 }, { b: 20, c: null, d: undefined, e: 5 })).toEqual({ a: 1, b: 20, e: 5 });
  });
});

describe("setPreferences: merge per top-level key, retry once on STALE_WRITE", () => {
  const server = (state: { doc: Record<string, unknown>; updatedAt: string }, script: string[] = []) =>
    fake(c => {
      if (c.method === "GET") return { ...state.doc, updatedAt: state.updatedAt };
      const { baseUpdatedAt, ...prefs } = c.body!;
      if (script.length) {
        // another device wins the race once: its write is applied first, then ours is refused
        const t = script.shift()!;
        state.doc = { ...state.doc, editor: { guessNextCharacter: true } };
        state.updatedAt = t;
      }
      if (baseUpdatedAt !== state.updatedAt) return { __fail: { status: 409, code: "STALE_WRITE", details: { current: { ...state.doc, updatedAt: state.updatedAt } } } };
      state.doc = prefs;
      state.updatedAt = T2;
      return { updatedAt: T2 };
    });

  it("no conflict: reads, sends the whole document with baseUpdatedAt, returns it", async () => {
    const st = { doc: { version: 1, appearance: { theme: "light" } }, updatedAt: T0 };
    const { network, calls } = server(st);
    const { client } = setup(network);
    const r = await client.setPreferences({ editor: { guessNextCharacter: false } });
    expect(calls.map(c => c.method)).toEqual(["GET", "PUT"]);
    expect(calls[1]!.body).toEqual({ version: 1, appearance: { theme: "light" }, editor: { guessNextCharacter: false }, baseUpdatedAt: T0 });
    expect(r).toEqual({ version: 1, appearance: { theme: "light" }, editor: { guessNextCharacter: false }, updatedAt: T2 });
  });

  it("with a base it skips the read; null removes a key", async () => {
    const st = { doc: { version: 1, appearance: { theme: "light" }, toolbar: { a: 1 } }, updatedAt: T0 };
    const { network, calls } = server(st);
    const { client } = setup(network);
    const r = await client.setPreferences({ toolbar: null }, { ...st.doc, updatedAt: T0 } as never);
    expect(calls.map(c => c.method)).toEqual(["PUT"]);
    expect(calls[0]!.body).not.toHaveProperty("toolbar");
    expect(r).not.toHaveProperty("toolbar");
  });

  it("stale: the other device's key survives, this call's key wins, and the retry uses the server token", async () => {
    const st = { doc: { version: 1 } as Record<string, unknown>, updatedAt: T0 };
    const { network, calls } = server(st, [T1]);
    const { client } = setup(network);
    const r = await client.setPreferences({ appearance: { theme: "dark" } }); // GET (T0), PUT refused because device 2 wrote at T1
    expect(calls.map(c => c.method)).toEqual(["GET", "PUT", "PUT"]);
    expect(calls[2]!.body).toEqual({ version: 1, editor: { guessNextCharacter: true }, appearance: { theme: "dark" }, baseUpdatedAt: T1 });
    expect(r).toMatchObject({ editor: { guessNextCharacter: true }, appearance: { theme: "dark" }, updatedAt: T2 });
    expect(st.doc).toMatchObject({ editor: { guessNextCharacter: true }, appearance: { theme: "dark" } });
  });

  it("stale twice: the second StaleWriteError reaches the caller, carrying the server copy", async () => {
    const { network, calls } = fake(c =>
      c.method === "GET" ? { version: 1, updatedAt: T0 } : { __fail: { status: 409, code: "STALE_WRITE", details: { current: { version: 1, editor: { x: 1 }, updatedAt: T1 } } } }
    );
    const { client } = setup(network);
    const err = await client.setPreferences({ appearance: { theme: "dark" } }).catch(e => e);
    expect(err).toBeInstanceOf(StaleWriteError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.current).toMatchObject({ editor: { x: 1 } });
    expect(calls.filter(c => c.method === "PUT").length).toBe(2); // one retry, no more
  });

  it("other failures are not retried", async () => {
    const { network, calls } = fake(c => (c.method === "GET" ? { version: 1, updatedAt: T0 } : { __fail: { status: 409, code: "LIMIT_EXCEEDED" } }));
    const { client } = setup(network);
    const err = await client.setPreferences({ editor: {} }).catch(e => e);
    expect(err.code).toBe("LIMIT_EXCEEDED");
    expect(calls.filter(c => c.method === "PUT").length).toBe(1);
  });
});

describe("setMyDocumentState", () => {
  it("first save sends baseUpdatedAt null; a stale write merges onto the server copy and retries once", async () => {
    let server: Record<string, unknown> = {};
    const { network, calls } = fake(c => {
      if (c.method === "GET") return server;
      const { baseUpdatedAt, ...state } = c.body!;
      if (calls.length === 2) server = { views: { desktop: { view: "pages" } }, updatedAt: T1 }; // another device saved between our GET and PUT
      if ((baseUpdatedAt ?? undefined) !== (server.updatedAt as string | undefined)) return { __fail: { status: 409, code: "STALE_WRITE", details: { current: server } } };
      server = { ...state, updatedAt: T2 };
      return { updatedAt: T2 };
    });
    const { client } = setup(network);
    const r = await client.setMyDocumentState("doc_1", { navigator: { tabs: [{ id: "scenes" }], activeTab: "scenes" } });
    expect(calls.map(c => c.method)).toEqual(["GET", "PUT", "PUT"]);
    expect(calls[1]!.body).toMatchObject({ baseUpdatedAt: null });
    expect(calls[2]!.body).toEqual({ views: { desktop: { view: "pages" } }, navigator: { tabs: [{ id: "scenes" }], activeTab: "scenes" }, baseUpdatedAt: T1 });
    expect(r).toMatchObject({ navigator: { activeTab: "scenes" }, views: { desktop: { view: "pages" } }, updatedAt: T2 });
  });
});

describe("typed errors", () => {
  it("OWNS_TEAM_WORKSPACE, REAUTH_REQUIRED, MACRO_TRIGGER_TAKEN, STALE_WRITE map to subclasses (still ApiError)", async () => {
    const fail = (status: number, code: string, details?: object) => fake(() => ({ __fail: { status, code, details } })).network;
    const owns = await setup(fail(409, "OWNS_TEAM_WORKSPACE", { workspaces: [{ id: "ws_1", name: "Team", members: 3 }] })).client.deleteAccount().catch(e => e);
    expect(owns).toBeInstanceOf(OwnsTeamWorkspaceError);
    expect(owns.workspaces).toEqual([{ id: "ws_1", name: "Team", members: 3 }]);
    const reauth = await setup(fail(401, "REAUTH_REQUIRED")).client.deleteAccount().catch(e => e);
    expect(reauth).toBeInstanceOf(ReauthRequiredError);
    expect(reauth.status).toBe(401);
    const taken = await setup(fail(409, "MACRO_TRIGGER_TAKEN")).client.createMacro({ name: "x", trigger: { kind: "alias", value: "x" }, insertText: "x" }).catch(e => e);
    expect(taken).toBeInstanceOf(MacroTriggerTakenError);
    expect(taken).toBeInstanceOf(ApiError);
  });
});

describe("recordWritingSession is safe to repeat", () => {
  it("every logical call carries an Idempotency-Key; the body's clientSessionId makes a re-upload a no-op on the server", async () => {
    const seen: (string | undefined)[] = [];
    const network: NetworkClient = {
      async request(req) {
        seen.push(req.headers?.["Idempotency-Key"]);
        return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify({ success: true, data: { accepted: true } })) };
      },
    };
    const { client } = setup(network);
    const body = { clientSessionId: newWritingSessionId(), documentId: "doc_1", startedAt: T0, endedAt: T1, activeSeconds: 5, wordsAdded: 10, wordsRemoved: 0, netPagesEighths: 0 };
    await client.recordWritingSession(body);
    await client.recordWritingSession(body); // an offline queue flushing again
    expect(seen.every(k => !!k)).toBe(true);
    expect(seen[0]).not.toBe(seen[1]); // separate logical calls; idempotency is the server's clientSessionId, proven in the integration test
  });
});

describe("hooks", () => {
  it("usePreferences reads; useSetPreferences uses the cached copy as base and refreshes the cache", async () => {
    const st = { doc: { version: 1 } as Record<string, unknown>, updatedAt: T0 };
    const { network, calls } = fake(c => {
      if (c.method === "GET") return { ...st.doc, updatedAt: st.updatedAt };
      st.doc = { ...c.body! };
      delete st.doc.baseUpdatedAt;
      st.updatedAt = T1;
      return { updatedAt: T1 };
    });
    const { wrapper, qc } = setup(network);
    const prefs = renderHook(() => usePreferences(), { wrapper });
    await waitFor(() => expect(prefs.result.current.data?.updatedAt).toBe(T0));
    const set = renderHook(() => useSetPreferences(), { wrapper });
    await act(async () => {
      await set.result.current.mutateAsync({ appearance: { theme: "dark" } });
    });
    expect(calls.map(c => c.method)).toEqual(["GET", "PUT"]); // no second GET: the cache was the base
    expect(calls[1]!.body).toMatchObject({ baseUpdatedAt: T0, appearance: { theme: "dark" } });
    expect(qc.getQueryData(queryKeys.preferences())).toMatchObject({ appearance: { theme: "dark" }, updatedAt: T1 });
  });

  it("useDictionary, useMacros, useCreateMacro (invalidates the list), useWritingStats", async () => {
    let macros = 0;
    const { network, calls } = fake(c => {
      if (c.path.endsWith("/me/dictionary")) return { words: ["Voss"] };
      if (c.path.endsWith("/me/macros") && c.method === "GET") return Array.from({ length: macros }, (_, i) => ({ id: `mac_${i}` }));
      if (c.path.endsWith("/me/macros")) {
        macros++;
        return { id: "mac_0" };
      }
      if (c.path.endsWith("/writing-stats")) return { buckets: [], streak: { current: 0, longest: 0, lastActiveDate: null, activeToday: false } };
      return {};
    });
    const { wrapper } = setup(network);
    const dict = renderHook(() => useDictionary(), { wrapper });
    await waitFor(() => expect(dict.result.current.data).toEqual({ words: ["Voss"] }));
    const list = renderHook(() => useMacros(), { wrapper });
    await waitFor(() => expect(list.result.current.data).toEqual([]));
    const create = renderHook(() => useCreateMacro(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ name: "n", trigger: { kind: "alias", value: "n" }, insertText: "n" });
    });
    await waitFor(() => expect(list.result.current.data).toEqual([{ id: "mac_0" }]));
    const stats = renderHook(() => useWritingStats({ granularity: "week" }), { wrapper });
    await waitFor(() => expect(stats.result.current.data?.streak.current).toBe(0));
    expect(calls.find(c => c.path.endsWith("/writing-stats"))!.query).toEqual({ granularity: "week" });
  });

  it("useRecordWritingSession refreshes the stats family", async () => {
    let n = 0;
    const { network } = fake(c => {
      if (c.method === "POST") return { accepted: true };
      return { buckets: [{ start: "2026-09-21", wordsAdded: n++ * 10 }], streak: {} };
    });
    const { wrapper } = setup(network);
    const stats = renderHook(() => useWritingStats(), { wrapper });
    await waitFor(() => expect(stats.result.current.data?.buckets[0]!.wordsAdded).toBe(0));
    const rec = renderHook(() => useRecordWritingSession(), { wrapper });
    await act(async () => {
      await rec.result.current.mutateAsync({ clientSessionId: "wss_abcdef12", startedAt: T0, endedAt: T1, activeSeconds: 1, wordsAdded: 1, wordsRemoved: 0, netPagesEighths: 0 });
    });
    await waitFor(() => expect(stats.result.current.data?.buckets[0]!.wordsAdded).toBe(10));
  });

  it("useMyDocumentState and useSetMyDocumentState share the cache; useStarDocument stars and unstars; useDeleteAccount refreshes me", async () => {
    let state: Record<string, unknown> = {};
    const { network, calls } = fake(c => {
      if (c.path.endsWith("/my-state") && c.method === "GET") return state;
      if (c.path.endsWith("/my-state")) {
        const { baseUpdatedAt: _b, ...s } = c.body!;
        state = { ...s, updatedAt: T1 };
        return { updatedAt: T1 };
      }
      if (c.path.endsWith("/star")) return { starred: c.method === "PUT" };
      if (c.path.endsWith("/me") && c.method === "DELETE") return { deletionScheduledFor: T2 };
      return {};
    });
    const { wrapper, qc } = setup(network);
    const view = renderHook(() => useMyDocumentState("doc_1"), { wrapper });
    await waitFor(() => expect(view.result.current.data).toEqual({}));
    const set = renderHook(() => useSetMyDocumentState("doc_1"), { wrapper });
    await act(async () => {
      await set.result.current.mutateAsync({ views: { desktop: { view: "cards" } } });
    });
    expect(calls.filter(c => c.method === "GET").length).toBe(1); // cached `{}` was the base
    expect(calls.find(c => c.method === "PUT" && c.path.endsWith("/my-state"))!.body).toEqual({ views: { desktop: { view: "cards" } }, baseUpdatedAt: null });
    await waitFor(() => expect(view.result.current.data).toMatchObject({ views: { desktop: { view: "cards" } }, updatedAt: T1 }));

    const star = renderHook(() => useStarDocument("doc_1"), { wrapper });
    await act(async () => {
      await star.result.current.mutateAsync(true);
      await star.result.current.mutateAsync(false);
    });
    expect(calls.filter(c => c.path.endsWith("/star")).map(c => c.method)).toEqual(["PUT", "DELETE"]);

    qc.setQueryData(queryKeys.me(), { userId: "u" });
    const del = renderHook(() => useDeleteAccount(), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync();
    });
    expect(qc.getQueryState(queryKeys.me())?.isInvalidated).toBe(true);
  });
});

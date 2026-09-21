import { describe, expect, it } from "vitest";
import { API_ROUTES } from "@sudobility/screenwriter_types";
import { API_ROUTE_METHODS, ScreenwriterClient } from "../src";

describe("route contract", () => {
  it("maps every API_ROUTES entry to a client method (or marks it unserved)", () => {
    expect(Object.keys(API_ROUTE_METHODS).sort()).toEqual(Object.keys(API_ROUTES).sort());
    const unserved = Object.entries(API_ROUTE_METHODS)
      .filter(([, m]) => m === null)
      .map(([r]) => r)
      .sort();
    // Full parity: the client wraps every route the API declares. A route added to API_ROUTES must get a
    // method here in the same change; `null` is only for a server-to-server route no client ever calls
    // (the provider job webhook, HMAC-signed).
    expect(unserved).toEqual(["jobWebhook"]);
    for (const [route, method] of Object.entries(API_ROUTE_METHODS)) {
      if (method === null) continue;
      expect(typeof ScreenwriterClient.prototype[method], `${route} -> ${String(method)}`).toBe("function");
    }
  });

  it("covers the import and export routes", () => {
    expect(API_ROUTE_METHODS.documentImport).toBe("importDocument");
    expect(API_ROUTE_METHODS.documentExport).toBe("exportDocument");
    expect(API_ROUTE_METHODS.formatsList).toBe("getFormats");
  });

  it("covers the API key routes", () => {
    expect(API_ROUTE_METHODS.apiKeysList).toBe("listApiKeys");
    expect(API_ROUTE_METHODS.apiKeyCreate).toBe("createApiKey");
    expect(API_ROUTE_METHODS.apiKeyRevoke).toBe("revokeApiKey");
  });

  it("covers the command and scene-read routes", () => {
    expect(API_ROUTE_METHODS.commands).toBe("applyCommands");
    expect(API_ROUTE_METHODS.outline).toBe("getOutline");
    expect(API_ROUTE_METHODS.scene).toBe("getScene");
    expect(API_ROUTE_METHODS.scenesBatch).toBe("getScenes");
    expect(API_ROUTE_METHODS.elementsBatch).toBe("getElements");
  });

  it("covers the AI routes", () => {
    expect(API_ROUTE_METHODS.aiStatus).toBe("getAiStatus");
    expect(API_ROUTE_METHODS.aiJobCreate).toBe("startAiJob");
    expect(API_ROUTE_METHODS.aiSuggestionSetAccept).toBe("acceptSuggestions");
  });

  it("covers the B8 tenancy and sharing routes", () => {
    expect(API_ROUTE_METHODS.workspaceCreate).toBe("createWorkspace");
    expect(API_ROUTE_METHODS.membersList).toBe("listMembers");
    expect(API_ROUTE_METHODS.memberUpdate).toBe("updateMemberRole");
    expect(API_ROUTE_METHODS.invitationAccept).toBe("acceptInvitation");
    expect(API_ROUTE_METHODS.sharedWithMe).toBe("listSharedWithMe");
    expect(API_ROUTE_METHODS.documentUnlockSession).toBe("createUnlockSession");
    expect(API_ROUTE_METHODS.shareLinkRevoke).toBe("revokeShareLink");
    expect(API_ROUTE_METHODS.publicShareResolve).toBe("resolveShareLink");
    expect(API_ROUTE_METHODS.shareState).toBe("getSharedState");
    // one client method per route, and the dispatchers (inviteMember, createShareLink, ...) are extras on top
    for (const m of ["inviteMember", "createShareLink", "listShareLinks", "listGrants"] as const) {
      expect(typeof ScreenwriterClient.prototype[m]).toBe("function");
    }
  });

  it("covers the B9 job routes (the webhook is provider-to-server and has no client method)", () => {
    expect(API_ROUTE_METHODS.jobsList).toBe("listJobs");
    expect(API_ROUTE_METHODS.jobGet).toBe("getJob");
    expect(API_ROUTE_METHODS.jobCreate).toBe("createJob");
    expect(API_ROUTE_METHODS.jobCancel).toBe("cancelJob");
    expect(API_ROUTE_METHODS.jobOutputs).toBe("getJobOutputs");
    expect(API_ROUTE_METHODS.jobRecipients).toBe("listJobRecipients");
    expect(API_ROUTE_METHODS.jobWebhook).toBeNull();
  });

  it("uses each method once", () => {
    const methods = Object.values(API_ROUTE_METHODS).filter(m => m !== null);
    expect(new Set(methods).size).toBe(methods.length);
  });
});

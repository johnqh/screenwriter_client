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
    // (the provider job webhook and the RevenueCat consumables webhook, both HMAC-signed).
    expect(unserved).toEqual(["consumablesWebhook", "jobWebhook"]);
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

  it("covers the B17 AI completion and credits routes (the webhook is provider-to-server and has no client method)", () => {
    expect(API_ROUTE_METHODS.meAiConsentGet).toBe("getAiConsent");
    expect(API_ROUTE_METHODS.meAiConsentAccept).toBe("acceptAiConsent");
    expect(API_ROUTE_METHODS.meAiActivity).toBe("listMyAiActivity");
    expect(API_ROUTE_METHODS.workspaceAiActivity).toBe("listWorkspaceAiActivity");
    expect(API_ROUTE_METHODS.aiEstimate).toBe("estimateAiJob");
    expect(API_ROUTE_METHODS.aiReportsList).toBe("listAiReports");
    expect(API_ROUTE_METHODS.aiReportGet).toBe("getAiReport");
    expect(API_ROUTE_METHODS.aiReportNoteConvert).toBe("convertAiNote");
    expect(API_ROUTE_METHODS.aiSuggestionSetDecide).toBe("decideSuggestions");
    expect(API_ROUTE_METHODS.consumablesBalance).toBe("getCreditsBalance");
    expect(API_ROUTE_METHODS.consumablesPurchases).toBe("listCreditPurchases");
    expect(API_ROUTE_METHODS.consumablesUsages).toBe("listCreditUsages");
    expect(API_ROUTE_METHODS.consumablesProducts).toBe("listCreditProducts");
    expect(API_ROUTE_METHODS.consumablesWebhook).toBeNull();
    expect(API_ROUTE_METHODS.purchaseHandoffCreate).toBe("createPurchaseHandoff");
  });

  it("covers the B18 public, admin, telemetry routes (/language/* is skipped by decision, not built)", () => {
    expect(API_ROUTE_METHODS.publicTemplatesList).toBe("listPublicTemplates");
    expect(API_ROUTE_METHODS.publicTemplateGet).toBe("getPublicTemplate");
    expect(API_ROUTE_METHODS.publicConfig).toBe("getPublicConfig");
    expect(API_ROUTE_METHODS.publicNamesDb).toBe("getNamesDb");
    expect(API_ROUTE_METHODS.publicHealthDeep).toBe("getDeepHealth");
    expect(API_ROUTE_METHODS.publicWatermarkedGet).toBe("getWatermarkedDownload");
    expect(API_ROUTE_METHODS.purchaseHandoffRedeem).toBe("redeemPurchaseHandoff");
    expect(API_ROUTE_METHODS.telemetryCreate).toBe("sendTelemetry");
    expect(API_ROUTE_METHODS.adminUsersLookup).toBe("adminLookupUser");
    expect(API_ROUTE_METHODS.adminUserRestore).toBe("adminRestoreUser");
    expect(API_ROUTE_METHODS.adminUserPurge).toBe("adminPurgeUser");
    expect(API_ROUTE_METHODS.adminJobsList).toBe("adminListJobs");
    expect(API_ROUTE_METHODS.adminJobRetry).toBe("adminRetryJob");
    expect(API_ROUTE_METHODS.adminJobRefund).toBe("adminRefundJob");
    expect(API_ROUTE_METHODS.adminJobKindUpdate).toBe("adminUpdateJobKind");
    expect(API_ROUTE_METHODS.adminDocumentMeta).toBe("adminGetDocumentMeta");
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

  it("covers the B10 read, search, report and packet routes", () => {
    expect(API_ROUTE_METHODS.entitiesList).toBe("listEntities");
    expect(API_ROUTE_METHODS.entityUsage).toBe("getEntityUsage");
    expect(API_ROUTE_METHODS.resolveBatch).toBe("resolveLocators");
    expect(API_ROUTE_METHODS.resolveOne).toBe("resolveLocator");
    expect(API_ROUTE_METHODS.search).toBe("search");
    expect(API_ROUTE_METHODS.workspaceSearch).toBe("searchWorkspace");
    expect(API_ROUTE_METHODS.documentSearch).toBe("searchDocument");
    expect(API_ROUTE_METHODS.reportKinds).toBe("getReportKinds");
    expect(API_ROUTE_METHODS.reportGet).toBe("getReport");
    expect(API_ROUTE_METHODS.reportCreate).toBe("createReport");
    expect(API_ROUTE_METHODS.packetScene).toBe("getScenePacket");
    expect(API_ROUTE_METHODS.packetShot).toBe("getShotPacket");
    expect(API_ROUTE_METHODS.fountainGet).toBe("getFountain");
  });

  it("covers the B13 account and per-user data routes", () => {
    expect(API_ROUTE_METHODS.mePreferencesGet).toBe("getPreferences");
    expect(API_ROUTE_METHODS.mePreferencesSet).toBe("setPreferences");
    expect(API_ROUTE_METHODS.meDictionaryGet).toBe("getDictionary");
    expect(API_ROUTE_METHODS.meDictionaryUpdate).toBe("updateDictionary");
    expect(API_ROUTE_METHODS.meMacrosList).toBe("listMacros");
    expect(API_ROUTE_METHODS.meMacroCreate).toBe("createMacro");
    expect(API_ROUTE_METHODS.meMacroUpdate).toBe("updateMacro");
    expect(API_ROUTE_METHODS.meMacroDelete).toBe("deleteMacro");
    expect(API_ROUTE_METHODS.meWritingStats).toBe("getWritingStats");
    expect(API_ROUTE_METHODS.meWritingSessionCreate).toBe("recordWritingSession");
    expect(API_ROUTE_METHODS.meWritingGoalsGet).toBe("getWritingGoals");
    expect(API_ROUTE_METHODS.meWritingGoalsSet).toBe("setWritingGoals");
    expect(API_ROUTE_METHODS.meExport).toBe("requestAccountExport");
    expect(API_ROUTE_METHODS.meDelete).toBe("deleteAccount");
    expect(API_ROUTE_METHODS.meRestore).toBe("restoreAccount");
    expect(API_ROUTE_METHODS.documentMyStateGet).toBe("getMyDocumentState");
    expect(API_ROUTE_METHODS.documentMyStateSet).toBe("setMyDocumentState");
    expect(API_ROUTE_METHODS.documentStar).toBe("starDocument");
    expect(API_ROUTE_METHODS.documentUnstar).toBe("unstarDocument");
  });

  it("uses each method once", () => {
    const methods = Object.values(API_ROUTE_METHODS).filter(m => m !== null);
    expect(new Set(methods).size).toBe(methods.length);
  });
});

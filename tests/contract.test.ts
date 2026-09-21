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
    // declared in API_ROUTES but not wrapped by this client (B5 commands and reads, B6 personal API keys)
    expect(unserved).toEqual(
      ["commands", "elementsBatch", "outline", "scene", "scenesBatch"]
    );
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

  it("covers the AI routes", () => {
    expect(API_ROUTE_METHODS.aiStatus).toBe("getAiStatus");
    expect(API_ROUTE_METHODS.aiJobCreate).toBe("startAiJob");
    expect(API_ROUTE_METHODS.aiSuggestionSetAccept).toBe("acceptSuggestions");
  });

  it("uses each method once", () => {
    const methods = Object.values(API_ROUTE_METHODS).filter(m => m !== null);
    expect(new Set(methods).size).toBe(methods.length);
  });
});

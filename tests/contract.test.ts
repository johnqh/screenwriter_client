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
    // B5 routes are declared but the API does not serve them yet
    expect(unserved).toEqual(["commands", "outline", "scene"]);
    for (const [route, method] of Object.entries(API_ROUTE_METHODS)) {
      if (method === null) continue;
      expect(typeof ScreenwriterClient.prototype[method], `${route} -> ${String(method)}`).toBe("function");
    }
  });

  it("uses each method once", () => {
    const methods = Object.values(API_ROUTE_METHODS).filter(m => m !== null);
    expect(new Set(methods).size).toBe(methods.length);
  });
});

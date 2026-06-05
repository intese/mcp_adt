import { describe, it, expect, beforeEach } from "@jest/globals";
import { SessionManager } from "../../src/adt/session.js";

describe("SessionManager", () => {
  let session: SessionManager;

  beforeEach(() => {
    session = new SessionManager("stateful");
  });

  it("starts unauthenticated", () => {
    expect(session.isAuthenticated).toBe(false);
    expect(session.getInfo().loginTime).toBeNull();
  });

  it("csrfToken returns fetch before first response", () => {
    expect(session.csrfToken).toBe("fetch");
  });

  it("updates CSRF token from response headers", () => {
    session.updateFromResponseHeaders({ "x-csrf-token": "my-token-abc" });
    expect(session.csrfToken).toBe("my-token-abc");
  });

  it("does not update CSRF token with 'fetch' value", () => {
    session.updateFromResponseHeaders({ "x-csrf-token": "real-token" });
    session.updateFromResponseHeaders({ "x-csrf-token": "fetch" });
    expect(session.csrfToken).toBe("real-token");
  });

  it("parses cookies from set-cookie header", () => {
    session.updateFromResponseHeaders({
      "set-cookie": ["SAP_SESSIONID_DEV=abc123; Path=/; HttpOnly"],
    });
    expect(session.cookieHeader).toContain("SAP_SESSIONID_DEV=abc123");
  });

  it("detects CSRF errors", () => {
    expect(session.isCsrfError(403, { "x-csrf-token": "Required" })).toBe(true);
    expect(session.isCsrfError(403, {})).toBe(false);
    expect(session.isCsrfError(200, { "x-csrf-token": "Required" })).toBe(false);
  });

  it("marks authenticated", () => {
    session.markAuthenticated();
    expect(session.isAuthenticated).toBe(true);
    expect(session.getInfo().loginTime).toBeInstanceOf(Date);
  });

  it("clears session on clearSession", () => {
    session.markAuthenticated();
    session.updateFromResponseHeaders({ "x-csrf-token": "token123" });
    session.clearSession();
    expect(session.isAuthenticated).toBe(false);
    expect(session.csrfToken).toBe("fetch");
    expect(session.cookieHeader).toBe("");
  });
});

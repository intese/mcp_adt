import { describe, it, expect } from "@jest/globals";
import { AdtHttpClient } from "../../src/adt/client.js";
import type { AdtTransport, TransportRequest, TransportResponse } from "../../src/adt/transport.js";
import { LockService } from "../../src/services/LockService.js";
import type { AdtClientConfig } from "../../src/types/index.js";
import { MOCK_LOCK_RESULT_XML } from "../mocks/adtResponses.js";

const config: AdtClientConfig = {
  baseUrl: "https://sap.invalid", client: "100", user: "TESTUSER", password: "x", language: "EN",
  tlsVerify: true, requestTimeout: 1000, connectTimeout: 1000, maxRetries: 0, retryDelay: 0,
  sessionKeepaliveInterval: 60000,
};

describe("lock probe on a fresh HTTP session", () => {
  it("fetches a CSRF token, locks, unlocks, logs out and closes the transport", async () => {
    const calls: string[] = [];
    let closed = false;
    // Behaves like SAP over HTTP: writing requests need a token obtained by logging in
    const request = async (r: TransportRequest): Promise<TransportResponse> => {
      calls.push(`${r.method} ${r.url}`);
      if (r.method === "POST" && r.headers["x-csrf-token"] !== "TOKEN") {
        return { status: 403, headers: { "x-csrf-token": "Required" }, data: "" };
      }
      const data = r.url.includes("_action=LOCK") ? MOCK_LOCK_RESULT_XML : "";
      return { status: 200, headers: { "x-csrf-token": "TOKEN" }, data };
    };
    const probe: AdtTransport = { request, clone: () => probe, close: async () => { closed = true; } };
    const main: AdtTransport = { request: async () => { throw new Error("main session used"); }, clone: () => probe };

    const service = new LockService(new AdtHttpClient(config, main));
    await expect(service.getLockInfo("/sap/bc/adt/oo/classes/zcl_test_class")).resolves.toEqual({ isLocked: false });

    expect(calls.map((c) => c.replace(/lockHandle=.*/, "lockHandle=…"))).toEqual([
      "POST /sap/bc/adt/oo/classes/zcl_test_class?_action=LOCK&accessMode=MODIFY",
      "GET /sap/bc/adt/compatibility/graph",
      "POST /sap/bc/adt/oo/classes/zcl_test_class?_action=LOCK&accessMode=MODIFY",
      "POST /sap/bc/adt/oo/classes/zcl_test_class?_action=UNLOCK&lockHandle=…",
      "DELETE /sap/bc/adt/login",
    ]);
    expect(closed).toBe(true);
  });
});

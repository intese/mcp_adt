import { describe, it, expect } from "@jest/globals";
import {
  AdtAuthenticationError,
  AdtNotFoundError,
  AdtLockError,
  AdtCsrfError,
  mapHttpError,
  parseSapErrorBody,
} from "../../src/adt/errors.js";
import { MOCK_SAP_ERROR_XML } from "../mocks/adtResponses.js";

describe("ADT Error handling", () => {
  describe("AdtBaseError.toMcpError", () => {
    it("formats authentication error correctly", () => {
      const err = new AdtAuthenticationError();
      const mcp = err.toMcpError();
      expect(mcp.success).toBe(false);
      expect(mcp.errorCode).toBe("ADT_AUTH_FAILED");
    });

    it("formats not found error with URI", () => {
      const err = new AdtNotFoundError("/sap/bc/adt/classes/classes/ZCL_MISSING");
      const mcp = err.toMcpError();
      expect(mcp.success).toBe(false);
      expect(mcp.errorCode).toBe("ADT_NOT_FOUND");
      expect(mcp.details).toMatchObject({
        uri: "/sap/bc/adt/classes/classes/ZCL_MISSING",
      });
    });
  });

  describe("mapHttpError", () => {
    it("maps 401 to authentication error", () => {
      const err = mapHttpError(401, "/sap/bc/adt/test", "", {});
      expect(err).toBeInstanceOf(AdtAuthenticationError);
    });

    it("maps 403 with CSRF header to CSRF error", () => {
      const err = mapHttpError(403, "/test", "", { "x-csrf-token": "Required" });
      expect(err).toBeInstanceOf(AdtCsrfError);
    });

    it("maps 404 to not found error", () => {
      const err = mapHttpError(404, "/sap/bc/adt/classes/ZCL_MISSING", "", {});
      expect(err).toBeInstanceOf(AdtNotFoundError);
    });

    it("maps 423 to lock error", () => {
      const err = mapHttpError(423, "/test", "", {});
      expect(err).toBeInstanceOf(AdtLockError);
    });
  });

  describe("parseSapErrorBody", () => {
    it("parses SAP exception XML", () => {
      const result = parseSapErrorBody(MOCK_SAP_ERROR_XML);
      expect(result.message).toContain("ZCL_NONEXISTENT");
    });

    it("handles non-XML body gracefully", () => {
      const result = parseSapErrorBody("Internal Server Error");
      expect(result.message).toBe("Internal Server Error");
    });

    it("handles empty body", () => {
      const result = parseSapErrorBody("");
      expect(result.message).toBeTruthy();
    });
  });
});

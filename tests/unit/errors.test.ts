import { describe, it, expect } from "@jest/globals";
import {
  AdtAuthenticationError,
  AdtNotFoundError,
  AdtLockError,
  AdtCsrfError,
  AdtNotAcceptableError,
  mapHttpError,
  parseSapErrorBody,
  parseSap406AcceptedTypes,
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

    it("maps 406 with German 'Zulässige Inhaltstypen' wording to not-acceptable error", () => {
      const body = `<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">Nachrichteninhalt ist nicht zulässig. Zulässige Inhaltstypen: application/xml</message></exc:exception>`;
      const err = mapHttpError(406, "/test", body, {});
      expect(err).toBeInstanceOf(AdtNotAcceptableError);
      expect((err as AdtNotAcceptableError).details.acceptedTypes).toBe("application/xml");
    });
  });

  describe("parseSap406AcceptedTypes", () => {
    it("parses the English 'Accepted content type' wording", () => {
      expect(parseSap406AcceptedTypes("Accepted content type: application/xml")).toBe(
        "application/xml",
      );
    });

    it("parses the German 'Zulässige Inhaltstypen' wording", () => {
      expect(
        parseSap406AcceptedTypes(
          "Nachrichteninhalt ist nicht zulässig. Zulässige Inhaltstypen: application/atc.worklist.v1+xml",
        ),
      ).toBe("application/atc.worklist.v1+xml");
    });

    it("returns null when no accepted type is present", () => {
      expect(parseSap406AcceptedTypes("Zulässige Inhaltstypen:")).toBeNull();
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

import { describe, it, expect } from "@jest/globals";
import {
  classUri,
  interfaceUri,
  reportUri,
  functionGroupUri,
  sourceUri,
  packageUri,
  cdsViewUri,
  validateAdtUri,
  extractObjectNameFromUri,
  withCorrNr,
} from "../../src/utils/uri.js";

describe("URI utilities", () => {
  describe("classUri", () => {
    it("builds class URI", () => {
      expect(classUri("ZCL_MY_CLASS")).toBe(
        "/sap/bc/adt/classes/classes/ZCL_MY_CLASS",
      );
    });

    it("uppercases the name", () => {
      expect(classUri("zcl_my_class")).toBe(
        "/sap/bc/adt/classes/classes/ZCL_MY_CLASS",
      );
    });
  });

  describe("sourceUri", () => {
    it("builds source URI with default include", () => {
      expect(sourceUri("/sap/bc/adt/classes/classes/ZCL_TEST")).toBe(
        "/sap/bc/adt/classes/classes/ZCL_TEST/source/main",
      );
    });

    it("builds source URI with specific include", () => {
      expect(sourceUri("/sap/bc/adt/classes/classes/ZCL_TEST", "definitions")).toBe(
        "/sap/bc/adt/classes/classes/ZCL_TEST/source/definitions",
      );
    });
  });

  describe("validateAdtUri", () => {
    it("accepts valid ADT URIs", () => {
      expect(() =>
        validateAdtUri("/sap/bc/adt/classes/classes/ZCL_TEST"),
      ).not.toThrow();
    });

    it("rejects URIs not starting with /sap/bc/adt/", () => {
      expect(() => validateAdtUri("/some/other/path")).toThrow();
    });

    it("rejects path traversal attempts", () => {
      expect(() => validateAdtUri("/sap/bc/adt/../etc/passwd")).toThrow();
    });
  });

  describe("withCorrNr", () => {
    it("appends corrNr parameter", () => {
      expect(withCorrNr("/sap/bc/adt/classes", "DEVK900001")).toBe(
        "/sap/bc/adt/classes?corrNr=DEVK900001",
      );
    });

    it("does not append when no transport", () => {
      expect(withCorrNr("/sap/bc/adt/classes")).toBe("/sap/bc/adt/classes");
    });
  });

  describe("extractObjectNameFromUri", () => {
    it("extracts name from URI", () => {
      expect(
        extractObjectNameFromUri("/sap/bc/adt/classes/classes/ZCL_TEST"),
      ).toBe("ZCL_TEST");
    });
  });
});

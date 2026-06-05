import { describe, it, expect } from "@jest/globals";
import { parseXml, buildXml, extractText, attr, ensureArray } from "../../src/utils/xml.js";

describe("XML utilities", () => {
  describe("parseXml", () => {
    it("parses simple XML", () => {
      const xml = `<root attr="value"><child>text</child></root>`;
      const result = parseXml(xml);
      expect(result).toBeDefined();
    });

    it("parses XML with namespaces", () => {
      const xml = `<ns:root xmlns:ns="http://example.com" ns:name="test">value</ns:root>`;
      const result = parseXml(xml);
      expect(result).toBeDefined();
    });

    it("handles empty XML gracefully", () => {
      expect(() => parseXml("")).not.toThrow();
    });
  });

  describe("attr", () => {
    it("extracts attribute value", () => {
      const node = { "@_adtcore:name": "ZCL_TEST", "@_type": "CLAS/OC" };
      expect(attr(node, "adtcore:name")).toBe("ZCL_TEST");
      expect(attr(node, "type")).toBe("CLAS/OC");
    });

    it("returns empty string for missing attribute", () => {
      expect(attr({}, "missing")).toBe("");
      expect(attr(null, "test")).toBe("");
      expect(attr(undefined, "test")).toBe("");
    });
  });

  describe("extractText", () => {
    it("extracts text node", () => {
      expect(extractText({ "#text": "hello" })).toBe("hello");
      expect(extractText("direct string")).toBe("direct string");
      expect(extractText(42)).toBe("42");
      expect(extractText(null)).toBe("");
    });
  });

  describe("ensureArray", () => {
    it("wraps single item in array", () => {
      expect(ensureArray("single")).toEqual(["single"]);
      expect(ensureArray({ x: 1 })).toEqual([{ x: 1 }]);
    });

    it("returns array as-is", () => {
      const arr = [1, 2, 3];
      expect(ensureArray(arr)).toBe(arr);
    });

    it("returns empty array for undefined/null", () => {
      expect(ensureArray(undefined)).toEqual([]);
      expect(ensureArray(null)).toEqual([]);
    });
  });
});

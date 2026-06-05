import { XMLParser, XMLBuilder, type X2jOptions, type XmlBuilderOptions } from "fast-xml-parser";

const PARSE_OPTIONS: X2jOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  trimValues: true,
  parseTagValue: false,
  allowBooleanAttributes: true,
  removeNSPrefix: false,
};

const BUILD_OPTIONS: XmlBuilderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  suppressBooleanAttributes: false,
  format: true,
  indentBy: "  ",
};

const parser = new XMLParser(PARSE_OPTIONS);
const builder = new XMLBuilder(BUILD_OPTIONS);

export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

export function buildXml(obj: unknown): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(obj) as string}`;
}

export function extractText(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object" && "#text" in node) {
    return String((node as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

export function attr(node: unknown, name: string): string {
  if (!node || typeof node !== "object") return "";
  const v = (node as Record<string, unknown>)[`@_${name}`];
  return typeof v === "string" ? v : String(v ?? "");
}

export function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function getNestedValue(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

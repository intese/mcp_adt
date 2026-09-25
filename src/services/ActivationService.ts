import type { AdtHttpClient } from "../adt/client.js";
import type {
  ActivationResult,
  ActivationMessage,
  InactiveObject,
  AdtObjectReference,
} from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { validateAdtUri } from "../utils/uri.js";

export class ActivationService {
  constructor(private readonly client: AdtHttpClient) {}

  async activateObject(
    objectUri: string,
    objectName: string,
    preaudit = true,
  ): Promise<ActivationResult> {
    validateAdtUri(objectUri);
    return this.activateObjects([{ uri: objectUri, name: objectName }], preaudit);
  }

  async activateObjects(
    objects: AdtObjectReference[],
    preaudit = true,
  ): Promise<ActivationResult> {
    logger.debug("Activating objects", { count: objects.length, preaudit });

    const body = this.buildActivationRequest(objects);
    const xml = await this.client.post<string>(
      `/sap/bc/adt/activation?method=activate&preauditRequested=${preaudit}`,
      body,
      {
        headers: {
          "Content-Type": "application/vnd.sap.adt.activation.request+xml",
          Accept: "application/vnd.sap.adt.activation.result+xml",
        },
      },
    );

    logger.debug("Activation response XML", { xml });

    const result = this.parseActivationResult(xml);
    if (result.success) {
      logger.info("Activation successful", { objects: objects.map((o) => o.name) });
    } else {
      logger.warn("Activation failed", {
        messages: result.messages.filter((m) => m.type === "E" || m.type === "A"),
        inactiveCount: result.inactiveObjects.length,
      });
    }

    return result;
  }

  async getInactiveObjects(): Promise<InactiveObject[]> {
    const xml = await this.client.get<string>("/sap/bc/adt/activation/inactiveobjects", {
      headers: { Accept: "application/vnd.sap.adt.activation.objectregistries+xml" },
    });
    return this.parseInactiveObjects(xml);
  }

  private buildActivationRequest(objects: AdtObjectReference[]): string {
    const refs = objects
      .map(
        (o) =>
          `  <adtcore:objectReference adtcore:uri="${this.escapeXml(o.uri)}" adtcore:name="${this.escapeXml(o.name)}"/>`,
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
${refs}
</adtcore:objectReferences>`;
  }

  private parseActivationResult(xml: string): ActivationResult {
    if (!xml || xml.trim() === "") {
      return { success: true, messages: [], inactiveObjects: [] };
    }

    try {
      const parsed = parseXml(xml);
      const messages = this.extractMessages(parsed);
      const inactiveObjects = this.extractInactiveObjects(parsed);

      const hasErrors = messages.some((m) => m.type === "E" || m.type === "A" || m.type === "X");
      const success = !hasErrors && inactiveObjects.length === 0;

      return { success, messages, inactiveObjects };
    } catch {
      return { success: true, messages: [], inactiveObjects: [] };
    }
  }

  private extractMessages(parsed: Record<string, unknown>): ActivationMessage[] {
    const msgNodes = ensureArray(
      getNestedValue(parsed, ["chkl:messages", "msg"]) as unknown ??
        getNestedValue(parsed, ["messages", "msg"]) as unknown,
    );

    return msgNodes.map((node) => ({
      type: (attr(node, "type") || "I") as ActivationMessage["type"],
      line: parseInt(attr(node, "line") || "0", 10) || undefined,
      column: parseInt(attr(node, "column") || "0", 10) || undefined,
      description: this.extractMessageText(node),
      objectUri: attr(node, "adtcore:uri") || undefined,
    }));
  }

  /**
   * Live-verified (2026-09-25, BDEF activation abort, `strict ( 2 );` without a
   * matching `authorization master`/`authorization dependent` clause): the
   * `shortText`/`txt` nesting can carry the message text split across *multiple*
   * `txt` elements (fast-xml-parser then yields an array) rather than a single
   * string — apparently how SAP wraps a long line. `ensureArray` + join
   * reconstructs the original single-line text. Any other, still-unknown shape
   * falls back to a raw dump of the node's attributes/children instead of a
   * silent `""`, and the raw response XML is logged at debug level in
   * `activateObjects()` so a genuinely new shape can be diagnosed from there.
   */
  private extractMessageText(node: unknown): string {
    const direct = extractText(node);
    if (direct) return direct;

    const n = node as Record<string, unknown>;
    const shortText = n["shortText"] as Record<string, unknown> | undefined;
    if (shortText) {
      const parts = ensureArray(shortText["txt"])
        .map((t) => extractText(t))
        .filter((t) => t.length > 0);
      if (parts.length > 0) return parts.join(" ");
    }

    return this.describeUnknownMessageNode(node);
  }

  private describeUnknownMessageNode(node: unknown): string {
    if (!node || typeof node !== "object" || Object.keys(node).length === 0) return "";
    return `[SAP sent no message text; raw node: ${JSON.stringify(node)}]`;
  }

  private extractInactiveObjects(parsed: Record<string, unknown>): InactiveObject[] {
    const entries = ensureArray(
      getNestedValue(parsed, ["ioc:inactiveObjects", "ioc:entry"]) as unknown ??
        getNestedValue(parsed, ["inactiveObjects", "entry"]) as unknown,
    );

    return entries.map((entry) => {
      const obj = (entry as Record<string, unknown>)["ioc:object"] ??
        (entry as Record<string, unknown>)["object"] ??
        entry;
      return {
        uri: attr(obj, "adtcore:uri"),
        name: attr(obj, "adtcore:name"),
        type: attr(obj, "adtcore:type") || undefined,
      };
    });
  }

  private parseInactiveObjects(xml: string): InactiveObject[] {
    try {
      const parsed = parseXml(xml);
      return this.extractInactiveObjects(parsed);
    } catch {
      return [];
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

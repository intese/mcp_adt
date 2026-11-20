import type { AdtHttpClient } from "../adt/client.js";
import type { SyntaxCheckResult, SyntaxCheckFinding } from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { validateAdtUri } from "../utils/uri.js";

export class SyntaxService {
  constructor(private readonly client: AdtHttpClient) {}

  async checkObject(objectUri: string, version: "active" | "inactive" = "inactive"): Promise<SyntaxCheckResult> {
    validateAdtUri(objectUri);
    logger.debug("Running syntax check", { uri: objectUri, version });

    const body = this.buildCheckRequest(objectUri, version);
    const xml = await this.client.post<string>(
      "/sap/bc/adt/checkruns?reporters=abapCheckRun",
      body,
      {
        headers: {
          "Content-Type": "application/vnd.sap.adt.checkobjects+xml",
          Accept: "application/vnd.sap.adt.checkmessages+xml",
        },
      },
    );

    return this.parseCheckResult(xml);
  }

  async checkSource(
    source: string,
    contextUri: string,
  ): Promise<SyntaxCheckResult> {
    validateAdtUri(contextUri);
    logger.debug("Running syntax check on source", { contextUri });

    const body = this.buildSourceCheckRequest(source, contextUri);
    const xml = await this.client.post<string>(
      "/sap/bc/adt/checkruns?reporters=abapCheckRun",
      body,
      {
        headers: {
          "Content-Type": "application/vnd.sap.adt.checkobjects+xml",
          Accept: "application/vnd.sap.adt.checkmessages+xml",
        },
      },
    );

    return this.parseCheckResult(xml);
  }

  private buildCheckRequest(objectUri: string, version: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun">
  <chkrun:checkObject adtcore:uri="${this.escapeXml(objectUri)}"
    xmlns:adtcore="http://www.sap.com/adt/core"
    chkrun:version="${version}"/>
</chkrun:checkObjectList>`;
  }

  /**
   * Inline-source check: a checkObjectList whose checkObject carries the unsaved
   * source as a base64 artifact (format as used by Eclipse ADT / abap-adt-api).
   * adtcore:uri is the object providing the context, chkrun:uri the source part
   * the content replaces.
   */
  private buildSourceCheckRequest(source: string, contextUri: string): string {
    const objectUri = contextUri.replace(/\/source\/[^/]+$/, "");
    const sourceUri = objectUri === contextUri ? `${contextUri}/source/main` : contextUri;
    const content = Buffer.from(source, "utf8").toString("base64");
    return `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">
  <chkrun:checkObject adtcore:uri="${this.escapeXml(objectUri)}" chkrun:version="inactive">
    <chkrun:artifacts>
      <chkrun:artifact chkrun:contentType="text/plain; charset=utf-8" chkrun:uri="${this.escapeXml(sourceUri)}">
        <chkrun:content>${content}</chkrun:content>
      </chkrun:artifact>
    </chkrun:artifacts>
  </chkrun:checkObject>
</chkrun:checkObjectList>`;
  }

  private parseCheckResult(xml: string): SyntaxCheckResult {
    if (!xml || xml.trim() === "") {
      return { hasErrors: false, hasWarnings: false, findings: [] };
    }
    logger.debug("Syntax check raw response", { xml });

    const parsed = parseXml(xml);
    const known =
      "chkrun:checkRunReports" in parsed ||
      "checkRun:checkResultList" in parsed ||
      "checkResultList" in parsed;
    if (!known) {
      // Never report output we cannot read as "no errors"
      throw new Error(`Unrecognised syntax check response: ${xml.trim().slice(0, 300)}`);
    }

    const findings = this.extractFindings(parsed);
    return {
      hasErrors: findings.some((f) => f.severity === "E"),
      hasWarnings: findings.some((f) => f.severity === "W"),
      findings,
    };
  }

  private extractFindings(parsed: Record<string, unknown>): SyntaxCheckFinding[] {
    // Real SAP response (checkmessages+xml):
    //   chkrun:checkRunReports > chkrun:checkReport > chkrun:checkMessageList > chkrun:checkMessage
    //   attributes chkrun:type / chkrun:shortText / chkrun:uri="<uri>#start=<line>,<column>"
    const reports = ensureArray(
      getNestedValue(parsed, ["chkrun:checkRunReports", "chkrun:checkReport"]) as unknown,
    );
    const messages = reports.flatMap((r) =>
      ensureArray(
        getNestedValue(r as Record<string, unknown>, [
          "chkrun:checkMessageList",
          "chkrun:checkMessage",
        ]) as unknown,
      ),
    );
    if (messages.length > 0) {
      return messages.map((node) => {
        const rawUri = attr(node, "chkrun:uri");
        const m = rawUri.match(/^([^#]*)#start=(\d+)(?:,(\d+))?/);
        return {
          severity: (attr(node, "chkrun:type") || "I") as SyntaxCheckFinding["severity"],
          line: m ? parseInt(m[2]!, 10) : 0,
          column: m && m[3] ? parseInt(m[3], 10) : 0,
          message: attr(node, "chkrun:shortText") || extractText(node),
          uri: (m ? m[1] : rawUri) || undefined,
        };
      });
    }

    // Legacy/alternative shapes (kept for compatibility)
    const findingNodes = ensureArray(
      getNestedValue(parsed, [
        "checkRun:checkResultList",
        "checkRun:checkResult",
        "checkRun:findings",
        "checkRun:finding",
      ]) as unknown ??
        getNestedValue(parsed, ["checkResultList", "checkResult", "findings", "finding"]) as unknown,
    );

    return findingNodes.map((node) => ({
      severity: (attr(node, "checkRun:type") || attr(node, "type") || "I") as SyntaxCheckFinding["severity"],
      line: parseInt(attr(node, "checkRun:line") || attr(node, "line") || "0", 10),
      column: parseInt(attr(node, "checkRun:column") || attr(node, "column") || "0", 10),
      message: attr(node, "checkRun:text") || attr(node, "text") || extractText(node),
      uri: attr(node, "checkRun:uri") || attr(node, "uri") || undefined,
    }));
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

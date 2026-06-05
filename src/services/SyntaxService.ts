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
          Accept: "application/vnd.sap.adt.checkrun.result+xml",
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
          "Content-Type": "application/vnd.sap.adt.checkrun.request+xml",
          Accept: "application/vnd.sap.adt.checkrun.result+xml",
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

  private buildSourceCheckRequest(source: string, contextUri: string): string {
    const escaped = this.escapeXml(source);
    return `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkRunRequest xmlns:chkrun="http://www.sap.com/adt/checkrun">
  <chkrun:checkObjects>
    <chkrun:checkObject adtcore:uri="${this.escapeXml(contextUri)}"
      xmlns:adtcore="http://www.sap.com/adt/core">
      <chkrun:source>${escaped}</chkrun:source>
    </chkrun:checkObject>
  </chkrun:checkObjects>
</chkrun:checkRunRequest>`;
  }

  private parseCheckResult(xml: string): SyntaxCheckResult {
    if (!xml || xml.trim() === "") {
      return { hasErrors: false, hasWarnings: false, findings: [] };
    }

    try {
      const parsed = parseXml(xml);
      const findings = this.extractFindings(parsed);

      return {
        hasErrors: findings.some((f) => f.severity === "E"),
        hasWarnings: findings.some((f) => f.severity === "W"),
        findings,
      };
    } catch {
      return { hasErrors: false, hasWarnings: false, findings: [] };
    }
  }

  private extractFindings(parsed: Record<string, unknown>): SyntaxCheckFinding[] {
    // Try multiple possible XML paths for findings
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

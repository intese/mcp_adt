import type { AdtHttpClient } from "../adt/client.js";
import type { ATCRunResult, ATCFinding, ATCRunOptions, ATCPriority } from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { validateAdtUri } from "../utils/uri.js";

export class ATCService {
  constructor(private readonly client: AdtHttpClient) {}

  async runATC(options: ATCRunOptions): Promise<ATCRunResult> {
    logger.debug("Starting ATC run", { objectCount: options.objects.length });

    // SAP expects the client to generate the worklist ID up front and pass it
    // as a query parameter; the run response body confirms/echoes it (there is
    // no Location header for this endpoint, despite what older docs assumed).
    const clientWorklistId = crypto.randomUUID();
    const body = this.buildRunRequest(options);

    const runResponseXml = await this.client.post<string>(
      `/sap/bc/adt/atc/runs?worklistId=${clientWorklistId}&maximumVerdicts=${options.maximumVerdicts ?? 100}`,
      body,
      {
        headers: {
          "Content-Type": "application/vnd.sap.adt.atc.run.request+xml",
          // SAP's ICF content negotiation rejects the vnd.sap.* run-result
          // type here with a generic "Accept header missing" error; only a
          // plain application/xml Accept is actually registered for this run.
          Accept: "application/xml",
        },
      },
    );

    const worklistId = this.extractWorklistId(runResponseXml) ?? clientWorklistId;
    logger.debug("ATC run initiated", { worklistId });

    return this.getWorklistResult(worklistId);
  }

  async getWorklistResult(worklistId: string): Promise<ATCRunResult> {
    logger.debug("Fetching ATC worklist", { worklistId });

    const xml = await this.client.get<string>(
      `/sap/bc/adt/atc/worklists/${worklistId}`,
      // The registered representation for this resource is
      // application/atc.worklist.v1+xml (no "vnd.sap." prefix).
      { headers: { Accept: "application/atc.worklist.v1+xml" } },
    );

    return this.parseWorklistResult(xml, worklistId);
  }

  private buildRunRequest(options: ATCRunOptions): string {
    const refs = options.objects
      .map(
        (o) =>
          `          <adtcore:objectReference adtcore:uri="${this.escapeXml(o.uri)}" adtcore:name="${this.escapeXml(o.name)}"/>`,
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<atc:run xmlns:atc="http://www.sap.com/adt/atc" maximumVerdicts="${options.maximumVerdicts ?? 100}">
  <objectSets>
    <objectSet kind="inclusive">
      <adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
${refs}
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>`;
  }

  /** Reads <atcworklist:worklistId> from the run response body (element text, not an attribute). */
  private extractWorklistId(xml: string): string | null {
    const parsed = parseXml(xml);
    const run = getNestedValue(parsed, ["atcworklist:worklistRun"]) as Record<string, unknown> | undefined;
    const id = run ? extractText(run["atcworklist:worklistId"]) : "";
    return id || null;
  }

  private parseWorklistResult(xml: string, worklistId: string): ATCRunResult {
    const findings: ATCFinding[] = [];

    const parsed = parseXml(xml);
    const worklist = getNestedValue(parsed, ["atcworklist:worklist"]) as Record<string, unknown> | undefined;

    if (worklist) {
      const objects = ensureArray(
        getNestedValue(worklist, ["atcworklist:objects", "atcobject:object"]) as unknown,
      );

      for (const obj of objects) {
        const objRecord = obj as Record<string, unknown>;
        const objectName = attr(objRecord, "adtcore:name");
        const objectType = attr(objRecord, "adtcore:type");
        const objectUri = attr(objRecord, "adtcore:uri");
        const packageName = attr(objRecord, "adtcore:packageName");

        const checkFindings = ensureArray(
          getNestedValue(objRecord, ["atcobject:findings", "atcfinding:finding"]) as unknown,
        );

        for (const finding of checkFindings) {
          findings.push(this.parseFinding(finding, {
            objectName,
            objectType,
            objectUri,
            packageName,
          }));
        }
      }
    }

    const byPriority: Record<ATCPriority, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const f of findings) {
      byPriority[f.priority] = (byPriority[f.priority] ?? 0) + 1;
    }

    return {
      worklistId,
      findings,
      totalFindings: findings.length,
      byPriority,
    };
  }

  private parseFinding(
    node: unknown,
    context: { objectName: string; objectType: string; objectUri: string; packageName: string },
  ): ATCFinding {
    const n = node as Record<string, unknown>;
    const priority = parseInt(attr(n, "atcfinding:priority") || "3", 10) as ATCPriority;
    // Line/column are not separate attributes — they're encoded in the
    // location URI fragment, e.g. ".../includes/implementations#start=297,0".
    const location = attr(n, "atcfinding:location");
    const locationMatch = location.match(/#start=(\d+),(\d+)/);
    const exemptionApproval = attr(n, "atcfinding:exemptionApproval");

    return {
      id: attr(n, "atcfinding:quickfixInfo") || attr(n, "adtcore:uri") || crypto.randomUUID(),
      checkId: attr(n, "atcfinding:checkId"),
      checkTitle: attr(n, "atcfinding:checkTitle"),
      messageTitle: attr(n, "atcfinding:messageTitle"),
      priority: (priority >= 1 && priority <= 4 ? priority : 3) as ATCPriority,
      objectUri: context.objectUri,
      objectName: context.objectName,
      objectType: context.objectType,
      packageName: context.packageName || undefined,
      line: locationMatch?.[1] ? parseInt(locationMatch[1], 10) : undefined,
      column: locationMatch?.[2] ? parseInt(locationMatch[2], 10) : undefined,
      exemptionApproval: exemptionApproval && exemptionApproval !== "-" ? exemptionApproval : undefined,
    };
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

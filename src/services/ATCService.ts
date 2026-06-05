import type { AdtHttpClient } from "../adt/client.js";
import type { ATCRunResult, ATCFinding, ATCRunOptions, ATCPriority } from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { validateAdtUri } from "../utils/uri.js";

export class ATCService {
  constructor(private readonly client: AdtHttpClient) {}

  async runATC(options: ATCRunOptions): Promise<ATCRunResult> {
    logger.debug("Starting ATC run", { objectCount: options.objects.length });

    const body = this.buildRunRequest(options);
    const runResponseXml = await this.client.post<string>(
      `/sap/bc/adt/atc/runs?maximumVerdicts=${options.maximumVerdicts ?? 100}`,
      body,
      {
        headers: {
          "Content-Type": "application/vnd.sap.adt.atc.run.request+xml",
          Accept: "application/vnd.sap.adt.atc.run.result+xml",
        },
      },
    );

    const worklistId = this.extractWorklistId(runResponseXml);
    logger.debug("ATC run initiated", { worklistId });

    const worklistXml = await this.client.get<string>(
      `/sap/bc/adt/atc/worklists/${worklistId}`,
      {
        headers: { Accept: "application/vnd.sap.adt.atc.worklist+xml" },
      },
    );

    return this.parseWorklistResult(worklistXml, worklistId);
  }

  async getWorklistResult(worklistId: string): Promise<ATCRunResult> {
    logger.debug("Fetching ATC worklist", { worklistId });

    const xml = await this.client.get<string>(
      `/sap/bc/adt/atc/worklists/${worklistId}`,
      {
        headers: { Accept: "application/vnd.sap.adt.atc.worklist+xml" },
      },
    );

    return this.parseWorklistResult(xml, worklistId);
  }

  private buildRunRequest(options: ATCRunOptions): string {
    const refs = options.objects
      .map(
        (o) =>
          `        <adtcore:objectReference adtcore:uri="${this.escapeXml(o.uri)}" adtcore:name="${this.escapeXml(o.name)}"/>`,
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<atcrun:run xmlns:atcrun="http://www.sap.com/adt/atc/run">
  <objectSets>
    <atcobjectset:objectSet xmlns:atcobjectset="http://www.sap.com/adt/atc/atcobjectset">
      <atcobjectset:adtCoreObjectSet>
        <adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
${refs}
        </adtcore:objectReferences>
      </atcobjectset:adtCoreObjectSet>
    </atcobjectset:objectSet>
  </objectSets>
</atcrun:run>`;
  }

  private extractWorklistId(xml: string): string {
    try {
      const parsed = parseXml(xml);
      const run = getNestedValue(parsed, ["atcrun:run"]) as Record<string, unknown> | undefined;
      if (run) {
        const id = attr(run, "atcrun:worklistId") || attr(run, "worklistId");
        if (id) return id;
      }
    } catch {
      // Try regex fallback
    }
    const match = xml.match(/worklistId="([^"]+)"/);
    if (match?.[1]) return match[1];
    throw new Error("Could not extract ATC worklist ID from response");
  }

  private parseWorklistResult(xml: string, worklistId: string): ATCRunResult {
    const findings: ATCFinding[] = [];

    try {
      const parsed = parseXml(xml);
      const worklist = getNestedValue(parsed, ["worklist:worklist"]) as Record<string, unknown> | undefined;
      const objectSets = getNestedValue(
        worklist ?? parsed,
        ["worklist:objectSets", "worklist:objectSet"],
      ) as unknown;

      for (const objectSet of ensureArray(objectSets)) {
        const objects = ensureArray(
          (objectSet as Record<string, unknown>)["worklist:objects"] as unknown,
        );

        for (const obj of objects) {
          const objRecord = obj as Record<string, unknown>;
          const objectName = attr(objRecord, "adtcore:name");
          const objectType = attr(objRecord, "adtcore:type");
          const objectUri = attr(objRecord, "adtcore:uri");
          const packageName = attr(objRecord, "adtcore:packageName");

          const checkFindings = ensureArray(
            (objRecord["worklist:findings"] as Record<string, unknown>)?.["worklist:finding"] as unknown,
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
    } catch {
      // Return partial results
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
    const priority = parseInt(attr(n, "atcworklist:priority") || attr(n, "priority") || "3", 10) as ATCPriority;
    const line = parseInt(attr(n, "adtcore:line") || "0", 10);
    const column = parseInt(attr(n, "adtcore:column") || "0", 10);

    return {
      id: attr(n, "atcworklist:id") || attr(n, "id") || crypto.randomUUID(),
      checkId: attr(n, "atcworklist:checkId") || attr(n, "checkId") || "",
      checkTitle: attr(n, "atcworklist:checkTitle") || attr(n, "checkTitle") || "",
      messageTitle: attr(n, "atcworklist:messageTitle") || attr(n, "messageTitle") || extractText(n),
      priority: (priority >= 1 && priority <= 4 ? priority : 3) as ATCPriority,
      objectUri: context.objectUri,
      objectName: context.objectName,
      objectType: context.objectType,
      packageName: context.packageName || undefined,
      line: line > 0 ? line : undefined,
      column: column > 0 ? column : undefined,
    };
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

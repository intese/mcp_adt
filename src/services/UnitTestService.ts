import type { AdtHttpClient } from "../adt/client.js";
import type {
  UnitTestRunResult,
  UnitTestRunOptions,
  UnitTestProgram,
  UnitTestClass,
  UnitTestMethod,
  UnitTestAlert,
  UnitTestStatus,
} from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { validateAdtUri } from "../utils/uri.js";

export class UnitTestService {
  constructor(private readonly client: AdtHttpClient) {}

  async runTests(options: UnitTestRunOptions): Promise<UnitTestRunResult> {
    validateAdtUri(options.objectUri);
    logger.debug("Running unit tests", { uri: options.objectUri });

    const body = this.buildRunRequest(options);
    const xml = await this.client.post<string>(
      `${options.objectUri}?method=unittest`,
      body,
      {
        headers: {
          "Content-Type": "application/vnd.sap.adt.abapunit.testrequest+xml",
          Accept: "application/vnd.sap.adt.abapunit.testresult+xml",
        },
      },
    );

    return this.parseTestResult(xml);
  }

  private buildRunRequest(options: UnitTestRunOptions): string {
    const risks = options.riskLevels ?? { harmless: true, dangerous: true, critical: true };
    const durations = options.durations ?? { short: true, medium: true, long: false };

    return `<?xml version="1.0" encoding="UTF-8"?>
<aunit:run xmlns:aunit="http://www.sap.com/adt/aunit">
  <aunit:options>
    <aunit:measurements measure="none"/>
    <aunit:scope ownTests="true" foreignTests="false"/>
    <aunit:riskLevel
      harmless="${risks.harmless ? "true" : "false"}"
      dangerous="${risks.dangerous ? "true" : "false"}"
      critical="${risks.critical ? "true" : "false"}"/>
    <aunit:duration
      short="${durations.short ? "true" : "false"}"
      medium="${durations.medium ? "true" : "false"}"
      long="${durations.long ? "true" : "false"}"/>
  </aunit:options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <adtcore:objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference
          adtcore:uri="${this.escapeXml(options.objectUri)}"
          adtcore:name="${this.escapeXml(options.objectName)}"/>
      </adtcore:objectReferences>
    </adtcore:objectSet>
  </adtcore:objectSets>
</aunit:run>`;
  }

  private parseTestResult(xml: string): UnitTestRunResult {
    if (!xml || xml.trim() === "") {
      return {
        status: "passed",
        programs: [],
        summary: { total: 0, passed: 0, failed: 0, errors: 0 },
      };
    }

    const programs: UnitTestProgram[] = [];

    try {
      const parsed = parseXml(xml);
      const programNodes = ensureArray(
        getNestedValue(parsed, ["aunit:runResult", "aunit:program"]) as unknown ??
          getNestedValue(parsed, ["runResult", "program"]) as unknown,
      );

      for (const progNode of programNodes) {
        programs.push(this.parseProgram(progNode));
      }
    } catch {
      // Return partial results
    }

    const summary = this.computeSummary(programs);
    const status = summary.failed > 0 || summary.errors > 0 ? "failed" : "passed";

    return { status, programs, summary };
  }

  private parseProgram(node: unknown): UnitTestProgram {
    const n = node as Record<string, unknown>;
    const name = attr(n, "adtcore:name");
    const uri = attr(n, "adtcore:uri");

    const classNodes = ensureArray(
      getNestedValue(n, ["aunit:testClasses", "aunit:testClass"]) as unknown ??
        getNestedValue(n, ["testClasses", "testClass"]) as unknown,
    );

    const testClasses: UnitTestClass[] = classNodes.map((cn) => this.parseClass(cn));
    const status = testClasses.some((c) => c.status === "failed" || c.status === "error")
      ? "failed"
      : "passed";

    return { name, uri, status, testClasses };
  }

  private parseClass(node: unknown): UnitTestClass {
    const n = node as Record<string, unknown>;
    const name = attr(n, "adtcore:name");
    const uri = attr(n, "adtcore:uri");

    const methodNodes = ensureArray(
      getNestedValue(n, ["aunit:testMethods", "aunit:testMethod"]) as unknown ??
        getNestedValue(n, ["testMethods", "testMethod"]) as unknown,
    );

    const methods: UnitTestMethod[] = methodNodes.map((mn) => this.parseMethod(mn));
    const status: UnitTestStatus =
      methods.some((m) => m.status === "error")
        ? "error"
        : methods.some((m) => m.status === "failed")
        ? "failed"
        : "passed";

    return { name, uri, status, methods };
  }

  private parseMethod(node: unknown): UnitTestMethod {
    const n = node as Record<string, unknown>;
    const name = attr(n, "adtcore:name");
    const execTime = parseInt(attr(n, "aunit:executionTime") || "0", 10);

    const alertNodes = ensureArray(
      getNestedValue(n, ["aunit:alerts", "aunit:alert"]) as unknown ??
        getNestedValue(n, ["alerts", "alert"]) as unknown,
    );

    const alerts: UnitTestAlert[] = alertNodes.map((an) => this.parseAlert(an));
    const status: UnitTestStatus =
      alerts.some((a) => a.severity === "fatal" || a.severity === "critical")
        ? "failed"
        : "passed";

    return {
      name,
      executionTime: execTime > 0 ? execTime : undefined,
      status,
      alerts,
    };
  }

  private parseAlert(node: unknown): UnitTestAlert {
    const n = node as Record<string, unknown>;
    const kind = (attr(n, "aunit:kind") || "assertion") as UnitTestAlert["kind"];
    const severity = (attr(n, "aunit:severity") || "critical") as UnitTestAlert["severity"];

    const title = extractText(
      (n["aunit:title"] ?? n["title"]) as unknown,
    );

    const detailNodes = ensureArray(
      getNestedValue(n, ["aunit:details", "aunit:detail"]) as unknown ??
        getNestedValue(n, ["details", "detail"]) as unknown,
    );
    const details = detailNodes.map((d) =>
      extractText(d) || attr(d as unknown, "aunit:text"),
    );

    const stackNodes = ensureArray(
      getNestedValue(n, ["aunit:stack", "aunit:stackEntry"]) as unknown ??
        getNestedValue(n, ["stack", "stackEntry"]) as unknown,
    );
    const stack = stackNodes.map((s) => ({
      uri: attr(s as unknown, "adtcore:uri"),
      description: attr(s as unknown, "aunit:description") || extractText(s),
    }));

    return { kind, severity, title, details, stack: stack.length > 0 ? stack : undefined };
  }

  private computeSummary(programs: UnitTestProgram[]): UnitTestRunResult["summary"] {
    let total = 0;
    let passed = 0;
    let failed = 0;
    let errors = 0;

    for (const prog of programs) {
      for (const cls of prog.testClasses) {
        for (const method of cls.methods) {
          total++;
          if (method.status === "passed") passed++;
          else if (method.status === "failed") failed++;
          else errors++;
        }
      }
    }

    return { total, passed, failed, errors };
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

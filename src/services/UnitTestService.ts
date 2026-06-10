import type { AdtHttpClient } from "../adt/client.js";
import type {
  UnitTestRunResult,
  UnitTestRunOptions,
  UnitTestProgram,
  UnitTestClass,
  UnitTestMethod,
  UnitTestAlert,
  UnitTestStatus,
  AUnitObjectUriStrategy,
} from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { validateAdtUri } from "../utils/uri.js";
import { AdtNotAcceptableError } from "../adt/errors.js";

const EMPTY_RESULT_NOTE =
  "ADT endpoint accepted the request, but returned an empty aunit:runResult. " +
  "This usually means the object set did not resolve to executable ABAP Unit tests " +
  "or the selected URI strategy is not accepted by this backend.";

const DEFAULT_STRATEGY_ORDER: AUnitObjectUriStrategy[] = ["oo-class", "vit-class"];

export class UnitTestService {
  constructor(private readonly client: AdtHttpClient) {}

  async runTests(options: UnitTestRunOptions): Promise<UnitTestRunResult> {
    validateAdtUri(options.objectUri);

    await this.fetchCsrfViaMetadata();

    const strategies = this.buildStrategyOrder(options);
    let lastResult: UnitTestRunResult | null = null;

    for (const strategy of strategies) {
      const result = await this.runWithStrategy(options, strategy);
      lastResult = result;

      if (result.status !== "no_tests_selected") {
        return result;
      }
      logger.debug("Empty runResult, trying next URI strategy", { triedStrategy: strategy });
    }

    return lastResult ?? {
      status: "no_tests_selected",
      programs: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, diagnosticNote: EMPTY_RESULT_NOTE },
    };
  }

  private buildStrategyOrder(options: UnitTestRunOptions): AUnitObjectUriStrategy[] {
    const all: AUnitObjectUriStrategy[] = [...DEFAULT_STRATEGY_ORDER];
    if (options.packageName) all.push("vit-package");

    if (options.uriStrategy) {
      const idx = all.indexOf(options.uriStrategy);
      if (idx > 0) {
        return [...all.slice(idx), ...all.slice(0, idx)];
      }
    }
    return all;
  }

  private async fetchCsrfViaMetadata(): Promise<void> {
    try {
      await this.client.get<string>("/sap/bc/adt/abapunit/metadata", {
        headers: {
          Accept: "application/vnd.sap.adt.abapunit.metadata.result.v1+xml",
          "x-csrf-token": "fetch",
        },
      });
      const session = this.client.getSessionInfo();
      logger.debug("ABAP Unit metadata fetched", {
        csrfPresent: session.csrfToken !== null,
        cookieCount: Object.keys(session.cookies).length,
      });
    } catch (err) {
      logger.debug("ABAP Unit metadata pre-fetch failed, using existing CSRF token", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async runWithStrategy(
    options: UnitTestRunOptions,
    strategy: AUnitObjectUriStrategy,
  ): Promise<UnitTestRunResult> {
    const objectRef = this.buildObjectReference(options, strategy);
    const body = this.buildRunRequest(options, objectRef);
    const session = this.client.getSessionInfo();

    logger.debug("Posting unit test run", {
      endpoint: "/sap/bc/adt/abapunit/testruns",
      strategy,
      objectRefPreview: objectRef.replace(/\s+/g, " ").trim().slice(0, 200),
      csrfPresent: session.csrfToken !== null,
      cookiesPresent: Object.keys(session.cookies).length > 0,
    });

    try {
      const xml = await this.client.post<string>(
        "/sap/bc/adt/abapunit/testruns",
        body,
        {
          headers: {
            "Content-Type": "application/xml",
            Accept: "application/xml",
          },
        },
      );

      logger.debug("Unit test run response received", {
        strategy,
        responsePreview: xml?.slice(0, 1000),
      });

      return this.parseTestResult(xml, strategy);
    } catch (err) {
      if (err instanceof AdtNotAcceptableError) {
        logger.warn("Unit test run returned 406 Not Acceptable", {
          strategy,
          acceptedTypes: err.details["acceptedTypes"],
          message: err.message,
        });
      }
      throw err;
    }
  }

  private buildObjectReference(
    options: UnitTestRunOptions,
    strategy: AUnitObjectUriStrategy,
  ): string {
    const name = this.escapeXml(options.objectName.toUpperCase());

    switch (strategy) {
      case "oo-class":
        return `<adtcore:objectReference adtcore:uri="${this.escapeXml(options.objectUri)}"/>`;

      case "vit-class":
        return `<adtcore:objectReference adtcore:uri="/sap/bc/adt/vit/wb/object_type/clas/object_name/${name}"/>`;

      case "vit-package":
        if (!options.packageName) {
          throw new Error("packageName is required for vit-package strategy");
        }
        return `<adtcore:objectReference
          adtcore:uri="/sap/bc/adt/vit/wb/object_type/devck/object_name/${this.escapeXml(options.packageName.toUpperCase())}"/>`;
    }
  }

  private buildRunRequest(options: UnitTestRunOptions, objectRef: string): string {
    const risks = options.riskLevels ?? { harmless: true, dangerous: true, critical: true };
    const durations = options.durations ?? { short: true, medium: true, long: true };
    const b = (v: boolean | undefined) => (v !== false ? "true" : "false");

    return `<?xml version="1.0" encoding="UTF-8"?>
<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">
  <external>
    <coverage active="false"/>
  </external>
  <options>
    <uriType value="semantic"/>
    <testDeterminationStrategy sameProgram="true" assignedTests="false"/>
    <testRiskLevels harmless="${b(risks.harmless)}" dangerous="${b(risks.dangerous)}" critical="${b(risks.critical)}"/>
    <testDurations short="${b(durations.short)}" medium="${b(durations.medium)}" long="${b(durations.long)}"/>
    <withNavigationUri enabled="true"/>
  </options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        ${objectRef}
      </adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`;
  }

  private isEmptyRunResult(xml: string): boolean {
    if (!xml || xml.trim() === "") return true;

    const compact = xml.replace(/\s+/g, " ").trim();
    if (/<aunit:runResult[^>]*\/>/.test(compact)) return true;
    if (/<aunit:runResult[^>]*>\s*<\/aunit:runResult>/.test(compact)) return true;

    try {
      const parsed = parseXml(xml);
      const runResult = getNestedValue(parsed, ["aunit:runResult"]) as Record<string, unknown> | undefined;
      if (!runResult) return true;
      // SAP returns child elements without namespace prefix (just "program", not "aunit:program")
      if (!runResult["aunit:program"] && !runResult["program"]) return true;
    } catch {
      // fall through — regex check above already covers the common cases
    }

    return false;
  }

  private parseTestResult(xml: string, strategy: AUnitObjectUriStrategy): UnitTestRunResult {
    if (this.isEmptyRunResult(xml)) {
      logger.debug("Empty aunit:runResult detected", { strategy });
      return {
        status: "no_tests_selected",
        programs: [],
        summary: { total: 0, passed: 0, failed: 0, errors: 0, diagnosticNote: EMPTY_RESULT_NOTE },
      };
    }

    const programs: UnitTestProgram[] = [];

    try {
      const parsed = parseXml(xml);
      const programNodes = ensureArray(
        getNestedValue(parsed, ["aunit:runResult", "aunit:program"]) as unknown ??
          getNestedValue(parsed, ["aunit:runResult", "program"]) as unknown ??
          getNestedValue(parsed, ["runResult", "program"]) as unknown,
      );

      for (const progNode of programNodes) {
        programs.push(this.parseProgram(progNode));
      }
    } catch (err) {
      logger.debug("Failed to parse unit test XML", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const summary = this.computeSummary(programs);
    const status: UnitTestStatus = summary.failed > 0 || summary.errors > 0 ? "failed" : "passed";

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
    const status: UnitTestStatus =
      testClasses.some((c) => c.status === "failed" || c.status === "error") ? "failed" : "passed";

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
      alerts.some((a) => a.severity === "fatal" || a.severity === "critical") ? "failed" : "passed";

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

    const title = extractText((n["aunit:title"] ?? n["title"]) as unknown);

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
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

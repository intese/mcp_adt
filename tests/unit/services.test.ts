import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ActivationService } from "../../src/services/ActivationService.js";
import { SyntaxService } from "../../src/services/SyntaxService.js";
import { UnitTestService } from "../../src/services/UnitTestService.js";
import { ObjectService } from "../../src/services/ObjectService.js";
import { AdtBaseError } from "../../src/adt/errors.js";
import { LockService } from "../../src/services/LockService.js";
import { ATCService } from "../../src/services/ATCService.js";
import { TransportService } from "../../src/services/TransportService.js";
import { TableService } from "../../src/services/TableService.js";
import { PackageService } from "../../src/services/PackageService.js";
import {
  MOCK_ACTIVATION_SUCCESS_XML,
  MOCK_ACTIVATION_ERROR_XML,
  MOCK_ACTIVATION_ERROR_NESTED_TEXT_XML,
  MOCK_ACTIVATION_ERROR_EMPTY_XML,
  MOCK_ACTIVATION_ERROR_WRAPPED_TEXT_XML,
  MOCK_SYNTAX_CHECK_CLEAN_XML,
  MOCK_SYNTAX_CHECK_ERROR_XML,
  MOCK_SYNTAX_CHECK_REAL_XML,
  MOCK_SYNTAX_CHECK_REAL_CLEAN_XML,
  MOCK_SYNTAX_CHECK_REAL_SINGLE_XML,
  MOCK_UNIT_TEST_RESULT_XML,
  MOCK_UNIT_TEST_FAILURE_XML,
  MOCK_UNIT_TEST_EMPTY_XML,
  MOCK_ATC_RUN_RESPONSE_XML,
  MOCK_ATC_WORKLIST_XML,
  MOCK_ATC_WORKLIST_OTHER_OBJECT_XML,
  MOCK_ATC_WORKLIST_EMPTY_XML,
  MOCK_CLASS_METADATA_XML,
  MOCK_LOCK_RESULT_XML,
  MOCK_TABLE_QUERY_XML,
  MOCK_TABLE_QUERY_EMPTY_XML,
} from "../mocks/adtResponses.js";
import type { AdtHttpClient } from "../../src/adt/client.js";

const NOT_PROCESSED_CT_XML = `<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:triggeringUri="/sap/bc/adt/programs/programs/rsparam" chkrun:status="notProcessed" chkrun:statusText="Dirty-Source: Inkorrekter Inhaltstyp text/plain; charset=utf-8, erwartet wurde text/plain"/></chkrun:checkRunReports>`;
const NOT_PROCESSED_OTHER_XML = `<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="notProcessed" chkrun:statusText="Objekt gesperrt"/></chkrun:checkRunReports>`;

function createMockClient(
  responses: Record<string, string>,
  postSequence?: string[],
): AdtHttpClient {
  let postCallCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: Record<string, any> = {
    get: jest.fn().mockImplementation(async (path: unknown) => {
      const p = String(path);
      for (const [key, val] of Object.entries(responses)) {
        if (p.includes(key)) return val;
      }
      return "";
    }),
    post: jest.fn().mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (postSequence && p.includes("testruns")) {
        const idx = postCallCount++;
        return postSequence[idx] ?? "";
      }
      for (const [key, val] of Object.entries(responses)) {
        if (p.includes(key)) return val;
      }
      return "";
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    put: jest.fn().mockImplementation(async () => ""),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    delete: jest.fn().mockImplementation(async () => ""),
    login: jest.fn().mockImplementation(async () => undefined),
    logout: jest.fn().mockImplementation(async () => undefined),
    getSessionInfo: jest.fn().mockReturnValue({
      isAuthenticated: true,
      csrfToken: "test-csrf-token",
      cookies: { SAP_SESSIONID_XXX: "abc123" },
      type: "stateless",
      loginTime: new Date(),
    }),
    postForHeaders: jest.fn().mockImplementation(async (path: unknown, _body: unknown, _opts: unknown) => {
      const p = String(path);
      for (const [key, val] of Object.entries(responses)) {
        if (p.includes(key)) return { data: val, headers: {} };
      }
      return { data: "", headers: {} };
    }),
    createStatelessClone: jest.fn(),
    getUsername: jest.fn().mockReturnValue("TESTUSER"),
    getLanguage: jest.fn().mockReturnValue("EN"),
    setSessionType: jest.fn(),
  };
  return mock as unknown as AdtHttpClient;
}

describe("ActivationService", () => {
  it("passes timeoutMs through as per-request timeout and omits it by default", async () => {
    const client = createMockClient({ activation: MOCK_ACTIVATION_SUCCESS_XML });
    const service = new ActivationService(client);
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const objs = [{ uri: "/sap/bc/adt/classes/classes/ZCL_TEST", name: "ZCL_TEST" }];

    await service.activateObjects(objs, true, 240000);
    await service.activateObjects(objs, true);

    const calls = mockPost.mock.calls as [string, string, { timeout?: number }][];
    expect(calls[0]?.[2].timeout).toBe(240000);
    expect(calls[1]?.[2]).not.toHaveProperty("timeout");
  });

  it("returns success for clean activation response", async () => {
    const client = createMockClient({ activation: MOCK_ACTIVATION_SUCCESS_XML });
    const service = new ActivationService(client);

    const result = await service.activateObject(
      "/sap/bc/adt/classes/classes/ZCL_TEST",
      "ZCL_TEST",
    );

    expect(result.success).toBe(true);
    expect(result.inactiveObjects).toHaveLength(0);
  });

  it("returns failure for activation with errors", async () => {
    const client = createMockClient({ activation: MOCK_ACTIVATION_ERROR_XML });
    const service = new ActivationService(client);

    const result = await service.activateObject(
      "/sap/bc/adt/classes/classes/ZCL_TEST",
      "ZCL_TEST",
    );

    expect(result.success).toBe(false);
    expect(result.inactiveObjects.length).toBeGreaterThan(0);
  });

  it("handles empty activation response as success", async () => {
    const client = createMockClient({ activation: "" });
    const service = new ActivationService(client);

    const result = await service.activateObject(
      "/sap/bc/adt/classes/classes/ZCL_TEST",
      "ZCL_TEST",
    );

    expect(result.success).toBe(true);
  });

  it("extracts the message description when sent as direct element text", async () => {
    const client = createMockClient({ activation: MOCK_ACTIVATION_ERROR_XML });
    const service = new ActivationService(client);

    const result = await service.activateObject(
      "/sap/bc/adt/classes/classes/ZCL_TEST",
      "ZCL_TEST",
    );

    expect(result.messages[0]?.description).toContain("Unknown identifier");
  });

  it("extracts the message description when nested under shortText/txt", async () => {
    const client = createMockClient({ activation: MOCK_ACTIVATION_ERROR_NESTED_TEXT_XML });
    const service = new ActivationService(client);

    const result = await service.activateObject(
      "/sap/bc/adt/classes/classes/ZCL_TEST",
      "ZCL_TEST",
    );

    expect(result.messages[0]?.description).toContain("not allowed outside a loop");
  });

  it("never silently drops a message with no text in any known shape", async () => {
    const client = createMockClient({ activation: MOCK_ACTIVATION_ERROR_EMPTY_XML });
    const service = new ActivationService(client);

    const result = await service.activateObject(
      "/sap/bc/adt/classes/classes/ZCL_TEST",
      "ZCL_TEST",
    );

    const errorMessage = result.messages.find((m) => m.type === "E");
    expect(errorMessage?.description).not.toBe("");
    expect(errorMessage?.description).toContain("line");
  });

  it("joins a shortText/txt split across multiple sibling elements into one line", async () => {
    const client = createMockClient({ activation: MOCK_ACTIVATION_ERROR_WRAPPED_TEXT_XML });
    const service = new ActivationService(client);

    const result = await service.activateObject(
      "/sap/bc/adt/bo/behaviordefinitions/Z_TEST_BDEF",
      "Z_TEST_BDEF",
    );

    expect(result.messages[0]?.description).toBe(
      'Da die Verhaltensdefinition "strict" ist, muss jede Entität entweder als "authorization master" oder als "authorization dependent" gekennzeichnet werden.',
    );
  });
});

describe("SyntaxService", () => {
  it("returns no findings for clean syntax check", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_CLEAN_XML });
    const service = new SyntaxService(client);

    const result = await service.checkObject("/sap/bc/adt/classes/classes/ZCL_TEST");

    expect(result.hasErrors).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it("returns findings for syntax errors", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_ERROR_XML });
    const service = new SyntaxService(client);

    const result = await service.checkObject("/sap/bc/adt/classes/classes/ZCL_TEST");

    expect(result.hasErrors).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]?.severity).toBe("E");
    expect(result.findings[0]?.line).toBe(5);
    expect(result.findings[0]?.column).toBe(10);
  });

  it("parses the real checkRunReports/checkMessageList response with line and column from the uri fragment", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_REAL_XML });
    const result = await new SyntaxService(client).checkSource("x", "/sap/bc/adt/programs/programs/rsparam");

    expect(result.hasErrors).toBe(true);
    expect(result.hasWarnings).toBe(true);
    expect(result.findings).toEqual([
      { severity: "E", line: 3, column: 0, message: '"LV_X" is not defined.', uri: "/sap/bc/adt/programs/programs/rsparam/source/main" },
      { severity: "W", line: 4, column: 5, message: "Statement is not accessible.", uri: "/sap/bc/adt/programs/programs/rsparam/source/main" },
    ]);
  });

  it("exposes SAP's per-report status so an empty result can be explained", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_REAL_CLEAN_XML });
    const result = await new SyntaxService(client).checkObject("/sap/bc/adt/programs/programs/zr_x");
    expect(result.reports).toEqual([
      { reporter: "abapCheckRun", status: "processed", statusText: "Processing finished" },
    ]);
    expect(result.raw).toBeUndefined();
  });

  it("passes version into the inline request and returns the raw response on request", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_REAL_CLEAN_XML });
    const result = await new SyntaxService(client).checkSource("x", "/sap/bc/adt/programs/programs/rsparam", {
      version: "active",
      includeRaw: true,
    });
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    expect((mockPost.mock.calls[0] as [string, string])[1]).toContain('chkrun:version="active"');
    expect(result.raw).toBe(MOCK_SYNTAX_CHECK_REAL_CLEAN_XML);
  });

  it("throws with SAP's reason when a check report is notProcessed", async () => {
    const client = createMockClient({ checkruns: NOT_PROCESSED_OTHER_XML });
    await expect(new SyntaxService(client).checkObject("/sap/bc/adt/programs/programs/zr_x")).rejects.toThrow(
      /did not process the syntax check: Objekt gesperrt/,
    );
  });

  it("retries inline source with plain text/plain when SAP rejects the charset content type, and remembers it", async () => {
    const post = jest
      .fn<(...a: unknown[]) => Promise<string>>()
      .mockResolvedValueOnce(NOT_PROCESSED_CT_XML)
      .mockResolvedValue(MOCK_SYNTAX_CHECK_REAL_XML);
    const service = new SyntaxService({ post } as unknown as AdtHttpClient);

    const first = await service.checkSource("x", "/sap/bc/adt/programs/programs/rsparam");
    await service.checkSource("x", "/sap/bc/adt/programs/programs/rsparam");

    expect(first.findings).toHaveLength(2);
    const bodies = post.mock.calls.map((c) => c[1] as string);
    expect(bodies[0]).toContain('chkrun:contentType="text/plain; charset=utf-8"');
    expect(bodies[1]).toContain('chkrun:contentType="text/plain"');
    expect(bodies).toHaveLength(3); // 2 for the first call, 1 for the second (content type remembered)
    expect(bodies[2]).toContain('chkrun:contentType="text/plain"');
  });

  it("parses a real response with exactly one message", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_REAL_SINGLE_XML });
    const result = await new SyntaxService(client).checkObject("/sap/bc/adt/programs/programs/zr_x");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ severity: "E", line: 7, column: 2 });
  });

  it("reports a clean real response as clean", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_REAL_CLEAN_XML });
    const result = await new SyntaxService(client).checkObject("/sap/bc/adt/programs/programs/zr_x");
    expect(result).toMatchObject({ hasErrors: false, hasWarnings: false, findings: [] });
  });

  it("does not report unrecognisable non-empty output as clean", async () => {
    const client = createMockClient({ checkruns: "<html><body>Gateway error</body></html>" });
    await expect(new SyntaxService(client).checkObject("/sap/bc/adt/programs/programs/zr_x")).rejects.toThrow(
      /unrecognised syntax check response/i,
    );
  });

  it("sends the only content type SAP accepts when checking inline source", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_CLEAN_XML });
    const service = new SyntaxService(client);

    await service.checkSource("report zprobe.", "/sap/bc/adt/programs/programs/zr_test");

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [, , options] = mockPost.mock.calls[0] as [string, string, { headers: Record<string, string> }];
    expect(options.headers["Content-Type"]).toBe("application/vnd.sap.adt.checkobjects+xml");
  });

  it("sends inline source as a checkObjectList with a base64 artifact", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_CLEAN_XML });
    const service = new SyntaxService(client);
    const source = "REPORT zprobe.\nWRITE 'ä <&>'.";

    await service.checkSource(source, "/sap/bc/adt/programs/programs/zr_test");

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const body = (mockPost.mock.calls[0] as [string, string])[1];
    expect(body).toContain("<chkrun:checkObjectList");
    expect(body).not.toContain("checkRunRequest");
    expect(body).toContain('adtcore:uri="/sap/bc/adt/programs/programs/zr_test"');
    expect(body).toContain('chkrun:uri="/sap/bc/adt/programs/programs/zr_test/source/main"');
    expect(body).toContain(`<chkrun:content>${Buffer.from(source, "utf8").toString("base64")}</chkrun:content>`);
  });

  it("does not append /source/main twice when the context is already a source URI", async () => {
    const client = createMockClient({ checkruns: MOCK_SYNTAX_CHECK_CLEAN_XML });
    const service = new SyntaxService(client);

    await service.checkSource("x", "/sap/bc/adt/programs/includes/zi_test/source/main");

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const body = (mockPost.mock.calls[0] as [string, string])[1];
    expect(body).toContain('chkrun:uri="/sap/bc/adt/programs/includes/zi_test/source/main"');
    expect(body).toContain('adtcore:uri="/sap/bc/adt/programs/includes/zi_test"');
    expect(body).not.toContain("source/main/source/main");
  });
});

describe("UnitTestService", () => {
  it("passes timeoutMs through as per-request timeout and omits it by default", async () => {
    const client = createMockClient({ testruns: MOCK_UNIT_TEST_RESULT_XML });
    const service = new UnitTestService(client);
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const base = { objectUri: "/sap/bc/adt/classes/classes/ZCL_TEST", objectName: "ZCL_TEST" };

    await service.runTests({ ...base, timeoutMs: 300000 });
    await service.runTests(base);

    const calls = mockPost.mock.calls as [string, string, { timeout?: number }][];
    expect(calls[0]?.[2].timeout).toBe(300000);
    expect(calls[1]?.[2]).not.toHaveProperty("timeout");
  });

  it("returns passed status for all-passing tests", async () => {
    const client = createMockClient({ testruns: MOCK_UNIT_TEST_RESULT_XML });
    const service = new UnitTestService(client);

    const result = await service.runTests({
      objectUri: "/sap/bc/adt/classes/classes/ZCL_TEST",
      objectName: "ZCL_TEST",
    });

    expect(result.status).toBe("passed");
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
  });

  it("returns failed status for failed tests", async () => {
    const client = createMockClient({ testruns: MOCK_UNIT_TEST_FAILURE_XML });
    const service = new UnitTestService(client);

    const result = await service.runTests({
      objectUri: "/sap/bc/adt/classes/classes/ZCL_TEST",
      objectName: "ZCL_TEST",
    });

    expect(result.status).toBe("failed");
    expect(result.summary.failed).toBe(1);
    const alert = result.programs[0]?.testClasses[0]?.methods[0]?.alerts[0];
    expect(alert?.kind).toBe("assertion");
    expect(alert?.severity).toBe("critical");
  });

  it("returns no_tests_selected for empty runResult and includes diagnosticNote", async () => {
    const client = createMockClient({ testruns: MOCK_UNIT_TEST_EMPTY_XML });
    const service = new UnitTestService(client);

    const result = await service.runTests({
      objectUri: "/sap/bc/adt/classes/classes/ZCL_TEST",
      objectName: "ZCL_TEST",
    });

    expect(result.status).toBe("no_tests_selected");
    expect(result.programs).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.summary.diagnosticNote).toContain("empty aunit:runResult");
  });

  it("parses real SAP shape (unprefixed children and attributes) incl. alerts", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"><program adtcore:uri="/sap/bc/adt/oo/classes/zcl_t" adtcore:name="ZCL_T" xmlns:adtcore="http://www.sap.com/adt/core"><testClasses><testClass adtcore:name="LTC_A"><testMethods><testMethod adtcore:name="OK" executionTime="0.04"/><testMethod adtcore:name="BAD" executionTime="0.10"><alerts><alert kind="failedAssertion" severity="critical"><title>Assertion failed</title><details><detail text="Expected 1"/></details></alert></alerts></testMethod></testMethods></testClass></testClasses></program></aunit:runResult>`;
    const service = new UnitTestService(createMockClient({ testruns: xml }));
    const result = await service.runTests({ objectUri: "/sap/bc/adt/oo/classes/zcl_t", objectName: "ZCL_T" });

    expect(result.status).toBe("failed");
    expect(result.summary).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(result.programs[0]?.testClasses[0]?.methods[1]?.alerts[0]?.kind).toBe("failedAssertion");
  });

  it("parses a runResult whose alerts contain thousands of XML entities", async () => {
    // Real failing runs embed escaped XML in <detail text="...">; fast-xml-parser's default
    // maxTotalExpansions (1000) used to abort parsing, which surfaced as passed/0 tests.
    const noisy = "&lt;a&gt;".repeat(1500);
    const xml = `<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"><program adtcore:name="ZCL_T" xmlns:adtcore="http://www.sap.com/adt/core"><testClasses><testClass adtcore:name="LTC_A"><testMethods><testMethod adtcore:name="BAD"><alerts><alert kind="failedAssertion" severity="critical"><title>x</title><details><detail text="${noisy}"/></details></alert></alerts></testMethod></testMethods></testClass></testClasses></program></aunit:runResult>`;
    const service = new UnitTestService(createMockClient({ testruns: xml }));
    const result = await service.runTests({ objectUri: "/sap/bc/adt/oo/classes/zcl_t", objectName: "ZCL_T" });

    expect(result.status).toBe("failed");
    expect(result.summary).toMatchObject({ total: 1, failed: 1 });
  });

  it("never reports passed when the response contains no test methods", async () => {
    const xml = `<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"><program adtcore:name="ZCL_T" xmlns:adtcore="http://www.sap.com/adt/core"><testClasses/></program></aunit:runResult>`;
    const service = new UnitTestService(createMockClient({ testruns: xml }));
    const result = await service.runTests({ objectUri: "/sap/bc/adt/oo/classes/zcl_t", objectName: "ZCL_T" });

    expect(result.status).not.toBe("passed");
  });

  it("falls back to vit-class strategy when oo-class returns empty result", async () => {
    // First POST (oo-class) → empty, second POST (vit-class) → real result
    const client = createMockClient({}, [MOCK_UNIT_TEST_EMPTY_XML, MOCK_UNIT_TEST_RESULT_XML]);
    const service = new UnitTestService(client);

    const result = await service.runTests({
      objectUri: "/sap/bc/adt/oo/classes/zcl_test",
      objectName: "ZCL_TEST",
    });

    expect(result.status).toBe("passed");
    expect(result.summary.passed).toBe(1);
    // post should have been called twice (once per strategy)
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});

describe("ObjectService", () => {
  it("defaults adtcore:responsible to the configured user when not supplied", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    await service.createClass({
      name: "ZCL_TEST",
      description: "Test class",
      packageName: "$TMP",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [, body] = mockPost.mock.calls[0] as [string, string];
    expect(body).toContain('adtcore:responsible="TESTUSER"');
    expect(body).not.toContain('adtcore:responsible=""');
  });

  it("retries creation with the generic application/* type when the backend has no content handler for the vendor type", async () => {
    const client = createMockClient({});
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    mockPost.mockImplementationOnce(async () => {
      throw new AdtBaseError(
        "ADT_UNKNOWN_ERROR",
        "Kein Content-Behandler für Content-Typ 'application/vnd.sap.adt.oo.classes+xml' gefunden",
      );
    });
    const service = new ObjectService(client, new LockService(client));

    const ref = await service.createClass({
      name: "ZCL_TEST",
      description: "Test class",
      packageName: "$TMP",
    });

    expect(ref.name).toBe("ZCL_TEST");
    expect(mockPost).toHaveBeenCalledTimes(2);
    const first = mockPost.mock.calls[0] as [string, string, { headers: Record<string, string> }];
    const second = mockPost.mock.calls[1] as [string, string, { headers: Record<string, string> }];
    // SAP_BASIS 740 SP04 only knows the unversioned oo.classes type for class creation.
    expect(first[2].headers["Content-Type"]).toBe("application/vnd.sap.adt.oo.classes+xml");
    expect(first[2].headers["Accept"]).toBeUndefined();
    expect(second[2].headers["Content-Type"]).toBe("application/*");
    expect(second[1]).toBe(first[1]);
  });

  it("does not retry creation for unrelated errors", async () => {
    const client = createMockClient({});
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    mockPost.mockImplementationOnce(async () => {
      throw new AdtBaseError("ADT_PERMISSION_DENIED", "Objektkatalogeintrag R3TR INTF ZX existiert nicht");
    });
    const service = new ObjectService(client, new LockService(client));

    await expect(
      service.createInterface({ name: "ZX", description: "d", packageName: "ZPKG" }),
    ).rejects.toThrow("Objektkatalogeintrag");
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("class and interface create bodies carry adtcore:type and masterLanguage like the reference implementations (needed on 740 to derive the TADIR entry)", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;

    await service.createClass({ name: "ZCL_TEST", description: "d", packageName: "$TMP" });
    await service.createInterface({ name: "ZIF_TEST", description: "d", packageName: "$TMP" });

    const [, classBody] = mockPost.mock.calls[0] as [string, string];
    const [, intfBody] = mockPost.mock.calls[1] as [string, string];
    expect(classBody).toContain('adtcore:type="CLAS/OC"');
    expect(classBody).toMatch(/adtcore:masterLanguage="[A-Z]{2}"/);
    expect(intfBody).toContain('adtcore:type="INTF/OI"');
    expect(intfBody).toMatch(/adtcore:masterLanguage="[A-Z]{2}"/);
  });

  it("honors an explicitly supplied responsible value", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    await service.createClass({
      name: "ZCL_TEST",
      description: "Test class",
      packageName: "$TMP",
      responsible: "OTHERUSER",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [, body] = mockPost.mock.calls[0] as [string, string];
    expect(body).toContain('adtcore:responsible="OTHERUSER"');
  });

  it("createObject delegates CLAS/OC to the class-specific endpoint", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    await service.createObject("CLAS/OC", {
      name: "ZCL_TEST",
      description: "Test class",
      packageName: "$TMP",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [path] = mockPost.mock.calls[0] as [string, string];
    expect(path).toContain("/sap/bc/adt/oo/classes");
    expect(path).not.toContain("/sap/bc/adt/repository/objects");
  });

  it("createObject delegates INTF/OI to the interface-specific endpoint", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    await service.createObject("INTF/OI", {
      name: "ZIF_TEST",
      description: "Test interface",
      packageName: "$TMP",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [path] = mockPost.mock.calls[0] as [string, string];
    expect(path).toContain("/sap/bc/adt/oo/interfaces");
  });

  it("createObject rejects unsupported object types", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    await expect(
      service.createObject("XYZ/X", {
        name: "ZXYZ_TEST",
        description: "Unsupported",
        packageName: "$TMP",
      }),
    ).rejects.toThrow(/Unsupported object type/);
  });

  it("getObjectMetadata requests Accept: */* (SAP rejects every vnd.sap.* type here)", async () => {
    const client = createMockClient({ classes: MOCK_CLASS_METADATA_XML });
    const service = new ObjectService(client, new LockService(client));

    const metadata = await service.getObjectMetadata(
      "/sap/bc/adt/oo/classes/ZCL_TEST_CLASS",
    );

    const mockGet = (client as unknown as { get: ReturnType<typeof jest.fn> }).get;
    const [, options] = mockGet.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers.Accept).toBe("*/*");
    expect(metadata.name).toBe("ZCL_TEST_CLASS");
  });

  it("does not lock or create a test include when generateTestClass is not set", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    await service.createClass({
      name: "ZCL_TEST",
      description: "Test class",
      packageName: "$TMP",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    expect(mockPost.mock.calls).toHaveLength(1);
  });

  it("generateTestClass: true locks the class, creates the CCAU include, then unlocks", async () => {
    const client = createMockClient({ "_action=LOCK": MOCK_LOCK_RESULT_XML });
    const service = new ObjectService(client, new LockService(client));

    await service.createClass({
      name: "ZCL_TEST",
      description: "Test class",
      packageName: "$TMP",
      generateTestClass: true,
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const calls = mockPost.mock.calls as [string, string, { headers: Record<string, string> }][];
    expect(calls).toHaveLength(4);

    const [createPath] = calls[0]!;
    expect(createPath).toContain("/sap/bc/adt/oo/classes?packageName=");

    const [lockPath] = calls[1]!;
    expect(lockPath).toBe("/sap/bc/adt/oo/classes/ZCL_TEST?_action=LOCK&accessMode=MODIFY");

    const [includePath, includeBody, includeOptions] = calls[2]!;
    expect(includePath).toBe(
      "/sap/bc/adt/oo/classes/ZCL_TEST/includes?lockHandle=LOCK_HANDLE_ABC123",
    );
    expect(includeBody).toContain('class:includeType="testclasses"');
    expect(includeOptions.headers["Content-Type"]).toBe("application/*");

    const [unlockPath] = calls[3]!;
    expect(unlockPath).toBe(
      "/sap/bc/adt/oo/classes/ZCL_TEST?_action=UNLOCK&lockHandle=LOCK_HANDLE_ABC123",
    );
  });

  it("addTestClassInclude creates the CCAU include on an existing class without re-creating the class", async () => {
    const client = createMockClient({ "_action=LOCK": MOCK_LOCK_RESULT_XML });
    const service = new ObjectService(client, new LockService(client));

    const ref = await service.addTestClassInclude("ZCL_TEST", "DEVK900001");

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const paths = (mockPost.mock.calls as [string][]).map(([p]) => p);
    expect(paths).toHaveLength(3);
    expect(paths[0]).toContain("_action=LOCK");
    expect(paths[1]).toBe(
      "/sap/bc/adt/oo/classes/ZCL_TEST/includes?lockHandle=LOCK_HANDLE_ABC123&corrNr=DEVK900001",
    );
    expect(paths[2]).toContain("_action=UNLOCK");
    expect(ref.uri).toBe("/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses");
  });

  it("propagates the error and still unlocks when CCAU include creation fails", async () => {
    const client = createMockClient({ "_action=LOCK": MOCK_LOCK_RESULT_XML });
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    mockPost.mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes("_action=LOCK")) return MOCK_LOCK_RESULT_XML;
      if (p.includes("/includes?lockHandle")) throw new Error("500 keine inaktive Fassung");
      return "";
    });
    const service = new ObjectService(client, new LockService(client));

    await expect(
      service.createClass({
        name: "ZCL_TEST",
        description: "Test class",
        packageName: "$TMP",
        generateTestClass: true,
      }),
    ).rejects.toThrow(/keine inaktive Fassung/);

    const calls = mockPost.mock.calls as [string][];
    const unlockCall = calls.find(([path]) => String(path).includes("_action=UNLOCK"));
    expect(unlockCall).toBeDefined();
  });

  it("createCdsView posts to the ddic/ddl/sources collection, not the legacy services/datas endpoint", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    const ref = await service.createCdsView({
      name: "ZI_TEST_VIEW",
      description: "Test view",
      packageName: "$TMP",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [path, body, options] = mockPost.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    expect(path).toContain("/sap/bc/adt/ddic/ddl/sources?packageName=");
    expect(path).not.toContain("services/datas");
    expect(body).toContain("<ddl:ddlSource");
    expect(body).toContain('adtcore:type="DDLS/DF"');
    expect(options.headers["Content-Type"]).toBe("application/*");
    expect(ref.uri).toBe("/sap/bc/adt/ddic/ddl/sources/ZI_TEST_VIEW");
  });

  it("createCdsView falls back to the client's configured language, not a hardcoded EN (SAP rejects language != masterLanguage of the system)", async () => {
    const client = createMockClient({});
    (client as unknown as { getLanguage: ReturnType<typeof jest.fn> }).getLanguage.mockReturnValue(
      "DE",
    );
    const service = new ObjectService(client, new LockService(client));

    await service.createCdsView({
      name: "ZI_TEST_VIEW",
      description: "Test view",
      packageName: "$TMP",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [, body] = mockPost.mock.calls[0] as [string, string];
    expect(body).toContain('adtcore:language="DE"');
    expect(body).toContain('adtcore:masterLanguage="DE"');
  });

  it("createBehaviorDefinition posts to bo/behaviordefinitions with the blue:blueSource schema", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    const ref = await service.createBehaviorDefinition({
      name: "ZBP_I_TEST",
      description: "Test behavior definition",
      packageName: "$TMP",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [path, body, options] = mockPost.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    expect(path).toContain("/sap/bc/adt/bo/behaviordefinitions?packageName=");
    expect(body).toContain("<blue:blueSource");
    expect(body).toContain('adtcore:type="BDEF/BDO"');
    expect(options.headers["Content-Type"]).toBe("application/*");
    expect(ref.uri).toBe("/sap/bc/adt/bo/behaviordefinitions/ZBP_I_TEST");
  });

  it("createObject delegates BDEF/BDO to the behavior-definition-specific endpoint", async () => {
    const client = createMockClient({});
    const service = new ObjectService(client, new LockService(client));

    await service.createObject("BDEF/BDO", {
      name: "ZBP_I_TEST",
      description: "Test behavior definition",
      packageName: "$TMP",
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [path] = mockPost.mock.calls[0] as [string];
    expect(path).toContain("/sap/bc/adt/bo/behaviordefinitions");
  });
});

describe("ATCService", () => {
  it("extracts the worklist ID from the run response body and returns parsed findings", async () => {
    const client = createMockClient({
      "atc/runs": MOCK_ATC_RUN_RESPONSE_XML,
      "atc/worklists": MOCK_ATC_WORKLIST_XML,
    });
    const service = new ATCService(client);

    const result = await service.runATC({
      objects: [{ uri: "/sap/bc/adt/oo/classes/zcl_test_class", name: "ZCL_TEST_CLASS" }],
    });

    expect(result.worklistId).toBe("00000000000000000000000000000000");
    expect(result.totalFindings).toBe(2);
    expect(result.findings[0]?.checkId).toBe("CHECK123");
    expect(result.findings[0]?.priority).toBe(3);
    expect(result.findings[0]?.line).toBe(34);
    expect(result.findings[0]?.column).toBe(0);
    expect(result.findings[1]?.priority).toBe(1);
    expect(result.byPriority[1]).toBe(1);
    expect(result.byPriority[3]).toBe(1);
  });

  it("returns zero findings for an empty worklist without treating it as an error", async () => {
    const client = createMockClient({ "atc/worklists": MOCK_ATC_WORKLIST_EMPTY_XML });
    const service = new ATCService(client);

    const result = await service.getWorklistResult("00000000000000000000000000000000");

    expect(result.totalFindings).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it("sends a client-generated worklistId and the atc namespace in the run request", async () => {
    const client = createMockClient({
      "atc/runs": MOCK_ATC_RUN_RESPONSE_XML,
      "atc/worklists": MOCK_ATC_WORKLIST_XML,
    });
    const service = new ATCService(client);

    await service.runATC({
      objects: [{ uri: "/sap/bc/adt/oo/classes/zcl_test_class", name: "ZCL_TEST_CLASS" }],
    });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [path, body] = mockPost.mock.calls[0] as [string, string];
    expect(path).toMatch(/worklistId=[0-9a-f-]{36}/);
    expect(body).toContain('xmlns:atc="http://www.sap.com/adt/atc"');
    expect(body).toContain('<objectSet kind="inclusive">');
  });

  it("filters out findings for objects that were not part of the request", async () => {
    const client = createMockClient({
      "atc/runs": MOCK_ATC_RUN_RESPONSE_XML,
      "atc/worklists": MOCK_ATC_WORKLIST_OTHER_OBJECT_XML,
    });
    const service = new ATCService(client);

    const result = await service.runATC({
      objects: [{ uri: "/sap/bc/adt/oo/classes/zcl_test_class", name: "ZCL_TEST_CLASS" }],
    });

    expect(result.totalFindings).toBe(1);
    expect(result.findings.every((f) => f.objectName === "ZCL_TEST_CLASS")).toBe(true);
    expect(result.byPriority[2]).toBe(0);
  });
});

describe("TransportService", () => {
  it("prefers the Location header over the body when creating a transport", async () => {
    const client = createMockClient({});
    (client as unknown as { postForHeaders: unknown }).postForHeaders = jest
      .fn()
      .mockImplementation(async () => ({
        data: '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA/></asx:values></asx:abap>',
        headers: { location: "/sap/bc/adt/cts/transportrequests/DEVK900123" },
      }));
    const service = new TransportService(client);

    const number = await service.createTransport({
      description: "Test transport",
      packageName: "ZTEST",
    });

    expect(number).toBe("DEVK900123");
  });

  it("falls back to parsing the ASX response body when no Location header is present", async () => {
    const client = createMockClient({});
    (client as unknown as { postForHeaders: unknown }).postForHeaders = jest
      .fn()
      .mockImplementation(async () => ({
        data: '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TRKORR>DEVK900456</TRKORR></DATA></asx:values></asx:abap>',
        headers: {},
      }));
    const service = new TransportService(client);

    const number = await service.createTransport({
      description: "Test transport",
      packageName: "ZTEST",
    });

    expect(number).toBe("DEVK900456");
  });

  it("sends the AS-ABAP envelope with the CreateCorrectionRequest dataname when creating a transport", async () => {
    const client = createMockClient({});
    (client as unknown as { postForHeaders: unknown }).postForHeaders = jest
      .fn()
      .mockImplementation(async () => ({
        data: '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TRKORR>DEVK900789</TRKORR></DATA></asx:values></asx:abap>',
        headers: {},
      }));
    const service = new TransportService(client);

    await service.createTransport({
      description: "Test transport",
      type: "Customizing",
      packageName: "ZTEST",
    });

    const mockPostForHeaders = (
      client as unknown as { postForHeaders: ReturnType<typeof jest.fn> }
    ).postForHeaders;
    const [, body, options] = mockPostForHeaders.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    expect(options.headers["Content-Type"]).toBe(
      "application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.CreateCorrectionRequest.v1",
    );
    expect(options.headers.Accept).toBe("application/vnd.sap.as+xml");
    expect(body).toContain('xmlns:asx="http://www.sap.com/abapxml"');
    expect(body).toContain("<CATEGORY>W</CATEGORY>");
    expect(body).toContain("<DEVCLASS>ZTEST</DEVCLASS>");
    expect(body).toContain("<REQUEST_TEXT>Test transport</REQUEST_TEXT>");
  });

  it("requests the generic AS-ABAP XML type when listing transports", async () => {
    const client = createMockClient({});
    const service = new TransportService(client);

    await service.listTransports();

    const mockGet = (client as unknown as { get: ReturnType<typeof jest.fn> }).get;
    const [, options] = mockGet.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers.Accept).toBe("application/vnd.sap.as+xml");
  });
});

describe("TableService", () => {
  it("transposes column-oriented data preview XML into row objects", async () => {
    const client = createMockClient({ freestyle: MOCK_TABLE_QUERY_XML });
    const service = new TableService(client);

    const result = await service.runSqlQuery({ sql: "SELECT matnr, maktx FROM makt" });

    expect(result.totalRows).toBe(2);
    expect(result.queryExecutionTime).toBe(12.5);
    expect(result.columns.map((c) => c.name)).toEqual(["MATNR", "MAKTX"]);
    expect(result.columns[0]?.keyAttribute).toBe(true);
    expect(result.rows).toEqual([
      { MATNR: "100000", MAKTX: "Schraube M8" },
      { MATNR: "100001", MAKTX: "Mutter M8" },
    ]);
  });

  it("returns an empty row set for a query with no matching rows", async () => {
    const client = createMockClient({ freestyle: MOCK_TABLE_QUERY_EMPTY_XML });
    const service = new TableService(client);

    const result = await service.runSqlQuery({ sql: "SELECT matnr FROM makt WHERE matnr = 'X'" });

    expect(result.totalRows).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.columns).toHaveLength(1);
  });

  it("returns a safe empty result on malformed XML instead of throwing", async () => {
    const client = createMockClient({ freestyle: "not xml at all {{{" });
    const service = new TableService(client);

    const result = await service.runSqlQuery({ sql: "SELECT * FROM makt" });

    expect(result).toEqual({ totalRows: 0, columns: [], rows: [] });
  });

  it("rejects non-SELECT statements before sending the request", async () => {
    const client = createMockClient({});
    const service = new TableService(client);

    await expect(service.runSqlQuery({ sql: "DELETE FROM makt" })).rejects.toThrow(
      "Only SELECT statements are allowed",
    );
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("rejects SQL containing a semicolon", async () => {
    const client = createMockClient({});
    const service = new TableService(client);

    await expect(
      service.runSqlQuery({ sql: "SELECT * FROM makt; DROP TABLE makt" }),
    ).rejects.toThrow("Multiple statements are not allowed");
    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("accepts a lowercase select with leading whitespace", async () => {
    const client = createMockClient({ freestyle: MOCK_TABLE_QUERY_XML });
    const service = new TableService(client);

    const result = await service.runSqlQuery({ sql: "  select matnr, maktx from makt" });

    expect(result.rows).toHaveLength(2);
  });

  it("sends rowNumber as a query param, defaulting to 100 when maxRows is omitted", async () => {
    const client = createMockClient({ freestyle: MOCK_TABLE_QUERY_XML });
    const service = new TableService(client);

    await service.runSqlQuery({ sql: "SELECT matnr FROM makt" });

    const mockPost = (client as unknown as { post: ReturnType<typeof jest.fn> }).post;
    const [path, body, options] = mockPost.mock.calls[0] as [
      string,
      string,
      { params: Record<string, unknown>; headers: Record<string, string> },
    ];
    expect(path).toBe("/sap/bc/adt/datapreview/freestyle");
    expect(body).toBe("SELECT matnr FROM makt");
    expect(options.params.rowNumber).toBe(100);
    expect(options.headers["Content-Type"]).toBe("text/plain");
  });
});

describe("PackageService", () => {
  it("requests the generic XML type when getting package content", async () => {
    const client = createMockClient({});
    const service = new PackageService(client);

    await service.getPackageContent("Z_TEST");

    const mockGet = (client as unknown as { get: ReturnType<typeof jest.fn> }).get;
    const [, options] = mockGet.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers.Accept).toBe("application/xml");
  });
});

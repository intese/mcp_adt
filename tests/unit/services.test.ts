import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ActivationService } from "../../src/services/ActivationService.js";
import { SyntaxService } from "../../src/services/SyntaxService.js";
import { UnitTestService } from "../../src/services/UnitTestService.js";
import { ObjectService } from "../../src/services/ObjectService.js";
import { LockService } from "../../src/services/LockService.js";
import { ATCService } from "../../src/services/ATCService.js";
import { TransportService } from "../../src/services/TransportService.js";
import { TableService } from "../../src/services/TableService.js";
import { PackageService } from "../../src/services/PackageService.js";
import {
  MOCK_ACTIVATION_SUCCESS_XML,
  MOCK_ACTIVATION_ERROR_XML,
  MOCK_ACTIVATION_ERROR_NESTED_TEXT_XML,
  MOCK_SYNTAX_CHECK_CLEAN_XML,
  MOCK_SYNTAX_CHECK_ERROR_XML,
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
});

describe("UnitTestService", () => {
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
        data: '<tm:request xmlns:tm="http://www.sap.com/adt/cts/transports"/>',
        headers: { location: "/sap/bc/adt/cts/transportrequests/DEVK900123" },
      }));
    const service = new TransportService(client);

    const number = await service.createTransport({ description: "Test transport" });

    expect(number).toBe("DEVK900123");
  });

  it("falls back to parsing the body when no Location header is present", async () => {
    const client = createMockClient({});
    (client as unknown as { postForHeaders: unknown }).postForHeaders = jest
      .fn()
      .mockImplementation(async () => ({
        data: '<tm:request xmlns:tm="http://www.sap.com/adt/cts/transports" tm:number="DEVK900456"/>',
        headers: {},
      }));
    const service = new TransportService(client);

    const number = await service.createTransport({ description: "Test transport" });

    expect(number).toBe("DEVK900456");
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

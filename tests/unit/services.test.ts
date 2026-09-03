import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ActivationService } from "../../src/services/ActivationService.js";
import { SyntaxService } from "../../src/services/SyntaxService.js";
import { UnitTestService } from "../../src/services/UnitTestService.js";
import { ObjectService } from "../../src/services/ObjectService.js";
import {
  MOCK_ACTIVATION_SUCCESS_XML,
  MOCK_ACTIVATION_ERROR_XML,
  MOCK_SYNTAX_CHECK_CLEAN_XML,
  MOCK_SYNTAX_CHECK_ERROR_XML,
  MOCK_UNIT_TEST_RESULT_XML,
  MOCK_UNIT_TEST_FAILURE_XML,
  MOCK_UNIT_TEST_EMPTY_XML,
} from "../mocks/adtResponses.js";
import type { AdtHttpClient } from "../../src/adt/client.js";

function createMockClient(
  responses: Record<string, string>,
  postSequence?: string[],
): AdtHttpClient {
  let postCallCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: Record<string, any> = {
    get: jest.fn().mockImplementation(async () => ""),
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
    createStatelessClone: jest.fn(),
    getUsername: jest.fn().mockReturnValue("TESTUSER"),
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
    const service = new ObjectService(client);

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
    const service = new ObjectService(client);

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
    const service = new ObjectService(client);

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
    const service = new ObjectService(client);

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
    const service = new ObjectService(client);

    await expect(
      service.createObject("XYZ/X", {
        name: "ZXYZ_TEST",
        description: "Unsupported",
        packageName: "$TMP",
      }),
    ).rejects.toThrow(/Unsupported object type/);
  });
});

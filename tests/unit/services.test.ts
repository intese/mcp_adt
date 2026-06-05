import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ActivationService } from "../../src/services/ActivationService.js";
import { SyntaxService } from "../../src/services/SyntaxService.js";
import { UnitTestService } from "../../src/services/UnitTestService.js";
import {
  MOCK_ACTIVATION_SUCCESS_XML,
  MOCK_ACTIVATION_ERROR_XML,
  MOCK_SYNTAX_CHECK_CLEAN_XML,
  MOCK_SYNTAX_CHECK_ERROR_XML,
  MOCK_UNIT_TEST_RESULT_XML,
  MOCK_UNIT_TEST_FAILURE_XML,
} from "../mocks/adtResponses.js";
import type { AdtHttpClient } from "../../src/adt/client.js";

function createMockClient(responses: Record<string, string>): AdtHttpClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: Record<string, any> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    get: jest.fn().mockImplementation(async () => ""),
    post: jest.fn().mockImplementation(async (path: unknown) => {
      const p = String(path);
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
    getSessionInfo: jest.fn().mockReturnValue({ isAuthenticated: true }),
    createStatelessClone: jest.fn(),
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
    const client = createMockClient({ unittest: MOCK_UNIT_TEST_RESULT_XML });
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
    const client = createMockClient({ unittest: MOCK_UNIT_TEST_FAILURE_XML });
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
});

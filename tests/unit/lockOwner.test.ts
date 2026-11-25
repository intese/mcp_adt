import { describe, it, expect, jest } from "@jest/globals";
import type { AdtHttpClient } from "../../src/adt/client.js";
import { AdtNotFoundError, AdtPermissionError } from "../../src/adt/errors.js";
import { LockService } from "../../src/services/LockService.js";
import { MOCK_LOCK_RESULT_XML } from "../mocks/adtResponses.js";

const URI = "/sap/bc/adt/oo/classes/zcl_test_class";

/** Main client plus the separate probe session that getLockInfo has to use. */
function mockClients(post: (path: string) => Promise<string>) {
  const probe = {
    post: jest.fn(post),
    get: jest.fn(async () => ""),
    setSessionType: jest.fn(),
    close: jest.fn(async () => {}),
  };
  const main = {
    post: jest.fn(async () => ""),
    get: jest.fn(async () => ""),
    setSessionType: jest.fn(),
    createStatelessClone: jest.fn(() => probe),
  };
  return { main, probe, service: new LockService(main as unknown as AdtHttpClient) };
}

const refuse = (message: string) => async (): Promise<string> => {
  throw new AdtPermissionError(message);
};

describe("LockService.getLockInfo", () => {
  it("reports the lock owner when SAP refuses the probe lock (German)", async () => {
    const { service, probe } = mockClients(refuse("Benutzer DEVUSER bearbeitet bereits ZCL_TEST_CLASS"));
    await expect(service.getLockInfo(URI)).resolves.toEqual({ isLocked: true, lockedBy: "DEVUSER" });
    expect(probe.close).toHaveBeenCalled();
  });

  it("reports the lock owner when SAP refuses the probe lock (English)", async () => {
    const { service } = mockClients(refuse("User DEVUSER is currently editing ZCL_TEST_CLASS"));
    await expect(service.getLockInfo(URI)).resolves.toEqual({ isLocked: true, lockedBy: "DEVUSER" });
  });

  it("reports unlocked after taking and immediately releasing the probe lock", async () => {
    const { service, probe } = mockClients(async (p) => (p.includes("_action=LOCK") ? MOCK_LOCK_RESULT_XML : ""));
    await expect(service.getLockInfo(URI)).resolves.toEqual({ isLocked: false });
    const paths = probe.post.mock.calls.map((c) => c[0]);
    expect(paths).toHaveLength(2);
    expect(paths[1]).toContain("_action=UNLOCK");
    expect(probe.close).toHaveBeenCalled();
  });

  it("never touches the main session, so locks held there survive", async () => {
    const { service, main } = mockClients(async (p) => (p.includes("_action=LOCK") ? MOCK_LOCK_RESULT_XML : ""));
    await service.getLockInfo(URI);
    expect(main.post).not.toHaveBeenCalled();
    expect(main.setSessionType).not.toHaveBeenCalled();
  });

  it("probes programs on the include URI", async () => {
    const { service, probe } = mockClients(refuse("Benutzer DEVUSER bearbeitet bereits ZTEST_REPORT"));
    await service.getLockInfo("/sap/bc/adt/programs/programs/ztest_report");
    expect(probe.post.mock.calls[0]?.[0]).toContain("/programs/includes/ztest_report?_action=LOCK");
    expect(probe.get).not.toHaveBeenCalled();
  });

  it("passes on refusals that are not a lock conflict instead of guessing", async () => {
    const { service, probe } = mockClients(refuse("Fehlende Entwicklerlizenz für Benutzer DEVUSER"));
    await expect(service.getLockInfo(URI)).rejects.toThrow(/Entwicklerlizenz/);
    expect(probe.close).toHaveBeenCalled();
  });

  it("passes on a missing object", async () => {
    const { service } = mockClients(async () => {
      throw new AdtNotFoundError(URI);
    });
    await expect(service.getLockInfo(URI)).rejects.toBeInstanceOf(AdtNotFoundError);
  });
});

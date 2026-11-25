import { describe, it, expect, jest } from "@jest/globals";
import type { AdtHttpClient } from "../../src/adt/client.js";
import { AdtBaseError, mapHttpError } from "../../src/adt/errors.js";
import { LockService } from "../../src/services/LockService.js";
import { ObjectService } from "../../src/services/ObjectService.js";
import { MOCK_CLASS_METADATA_XML } from "../mocks/adtResponses.js";

// Shape of SAP's real refusal (names anonymised)
const refusalXml = (message: string): string =>
  `<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">` +
  `<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAccess"/><message lang="EN">${message}</message>` +
  `<localizedMessage lang="DE">${message}</localizedMessage><properties/></exc:exception>`;

describe("mapHttpError for refused locks", () => {
  it.each([
    "Benutzer DEVUSER bearbeitet bereits ZCL_TEST_CLASS",
    "User DEVUSER is currently editing ZCL_TEST_CLASS",
  ])("maps '%s' to ADT_LOCK_CONFLICT with the owner", (message) => {
    const err = mapHttpError(403, "/sap/bc/adt/oo/classes/zcl_test_class", refusalXml(message), {});
    expect(err.errorCode).toBe("ADT_LOCK_CONFLICT");
    expect(err.message).toBe(message);
    expect(err.details).toMatchObject({ lockedBy: "DEVUSER" });
  });

  it("keeps other 403 refusals as ADT_PERMISSION_DENIED", () => {
    const err = mapHttpError(403, "/x", refusalXml("Fehlende Entwicklerlizenz für Benutzer DEVUSER"), {});
    expect(err.errorCode).toBe("ADT_PERMISSION_DENIED");
  });
});

describe("ObjectService.getObjectMetadata content negotiation", () => {
  const CLASS_URI = "/sap/bc/adt/oo/classes/zcl_test_class";
  const noHandler = new AdtBaseError("ADT_UNKNOWN_ERROR", "Kein Content-Behandler für Content-Typ '*/*' gefunden");

  function setup(get: (path: string, options: { headers: Record<string, string> }) => Promise<string>) {
    const mock = jest.fn(get);
    const client = { get: mock } as unknown as AdtHttpClient;
    return { mock, service: new ObjectService(client, new LockService(client)) };
  }

  it("retries a class with the class media type when the wildcard has no content handler", async () => {
    const { mock, service } = setup(async (_p, o) => {
      if (o.headers["Accept"] === "*/*") throw noHandler;
      return MOCK_CLASS_METADATA_XML;
    });
    const meta = await service.getObjectMetadata(CLASS_URI);
    expect(meta.name).toBe("ZCL_TEST_CLASS");
    expect(mock.mock.calls[1]?.[1].headers["Accept"]).toBe("application/vnd.sap.adt.oo.classes+xml");
  });

  it("reads the source link from the abapsource namespace SAP actually sends", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><intf:abapInterface abapsource:sourceUri="source/main" adtcore:name="ZIF_TEST" adtcore:type="INTF/OI" xmlns:intf="http://www.sap.com/adt/oo/interfaces" xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore="http://www.sap.com/adt/core"/>`;
    const { service } = setup(async () => xml);
    const meta = await service.getObjectMetadata("/sap/bc/adt/oo/interfaces/zif_test");
    expect(meta.sourceUri).toBe("source/main");
  });

  it("takes a class's source link from its main include", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><class:abapClass adtcore:name="ZCL_TEST_CLASS" adtcore:type="CLAS/OC" xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore="http://www.sap.com/adt/core"><class:include class:includeType="definitions" abapsource:sourceUri="includes/definitions"/><class:include class:includeType="main" abapsource:sourceUri="source/main"/></class:abapClass>`;
    const { service } = setup(async () => xml);
    const meta = await service.getObjectMetadata(CLASS_URI);
    expect(meta.sourceUri).toBe("source/main");
  });

  it("does not retry unrelated errors", async () => {
    const { mock, service } = setup(async () => {
      throw new AdtBaseError("ADT_PERMISSION_DENIED", "no authorization");
    });
    await expect(service.getObjectMetadata(CLASS_URI)).rejects.toThrow("no authorization");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does not send the class media type for other object types", async () => {
    const { mock, service } = setup(async () => {
      throw noHandler;
    });
    await expect(service.getObjectMetadata("/sap/bc/adt/oo/interfaces/zif_test")).rejects.toBe(noHandler);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

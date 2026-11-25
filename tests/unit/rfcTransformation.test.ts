import { describe, it, expect, jest } from "@jest/globals";
import type { AdtHttpClient } from "../../src/adt/client.js";
import { AdtBaseError, AdtNotFoundError } from "../../src/adt/errors.js";
import { parseBridgeError } from "../../src/adt/rfcCodec.js";
import type { RfcCallRequest, RfcCallResult } from "../../src/adt/rfcCodec.js";
import { RfcTransformationService } from "../../src/services/RfcTransformationService.js";
import { TransformationService } from "../../src/services/TransformationService.js";

const ST = '<?sap.transform simple?>\n<tt:transform xmlns:tt="http://www.sap.com/transformation-templates">\n\n</tt:transform>\n';

const abapError = (key: string, text = "SAP text") =>
  new AdtBaseError("ADT_ABAP_EXCEPTION", `${key}: ${text}`, { exception: key, sapMessage: text });

const existing: RfcCallResult = {
  tables: {
    E_XSLT_ATTRIBUTES: [
      { XSLTDESC: "ZST_X", DEVCLASS: "$TMP", AUTHOR: "OWNER", LANGU: "D", DESCRIPT: "Alt" },
    ],
    E_XSLT_SOURCE: [{ LINE: "<?sap.transform simple?>" }, { LINE: "<tt:transform/>" }],
    E_STATE: [{ VALUE: "A" }],
  },
};

/** Fake client: answers per I_OPERATION and records every call. */
function fakeClient(answers: Record<string, RfcCallResult | Error> = {}) {
  const callFunction = jest.fn(async (req: RfcCallRequest): Promise<RfcCallResult> => {
    const a = answers[req.params?.["I_OPERATION"] ?? ""] ?? { tables: {} };
    if (a instanceof Error) throw a;
    return a;
  });
  const client = { callFunction, supportsRfc: () => true } as unknown as AdtHttpClient;
  const ops = () => callFunction.mock.calls.map((c) => c[0].params?.["I_OPERATION"]);
  return { client, callFunction, ops, service: new RfcTransformationService(client) };
}

describe("parseBridgeError", () => {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

  it("turns an ABAP exception into a typed error with key and SAP text", () => {
    const err = parseBridgeError(["7", "ABAP", b64("SYNTAX_ERRORS"), b64("Zeile 3: Fehler")]);
    expect(err.errorCode).toBe("ADT_ABAP_EXCEPTION");
    expect(err.details).toMatchObject({ exception: "SYNTAX_ERRORS", sapMessage: "Zeile 3: Fehler" });
    expect(err.message).toContain("SYNTAX_ERRORS");
    expect(err.message).toContain("Zeile 3: Fehler");
  });

  it("adds the SAP message id and variables, since the text is often only a variable", () => {
    const err = parseBridgeError(
      ["7", "ABAP", b64("SYNTAX_ERRORS"), b64("ZST_X"), b64("XSLT_TOOL"), b64("308"), b64("ZST_X"), b64(""), b64(""), b64("")],
    );
    expect(err.message).toContain("XSLT_TOOL 308");
    expect(err.details).toMatchObject({ messageId: "XSLT_TOOL 308", messageParameters: ["ZST_X"] });
  });

  it("keeps other bridge errors as network errors", () => {
    const err = parseBridgeError(["7", "ERR", b64("JCoException: no connection")]);
    expect(err.errorCode).toBe("ADT_NETWORK_ERROR");
    expect(err.message).toContain("no connection");
  });
});

describe("RfcTransformationService.read", () => {
  it("returns source, attributes and state from SHOW", async () => {
    const { service, callFunction } = fakeClient({ SHOW: existing });
    await expect(service.read("zst_x")).resolves.toEqual({
      name: "ZST_X",
      packageName: "$TMP",
      description: "Alt",
      language: "D",
      author: "OWNER",
      state: "active",
      source: "<?sap.transform simple?>\n<tt:transform/>",
    });
    expect(callFunction.mock.calls[0]?.[0]).toMatchObject({
      name: "XSLT_MAINTENANCE_RFC",
      params: { I_OPERATION: "SHOW", I_XSLT_NAME: "ZST_X" },
    });
  });

  it("maps NOT_EXISTING to ADT_NOT_FOUND", async () => {
    const { service } = fakeClient({ SHOW: abapError("NOT_EXISTING") });
    await expect(service.read("ZST_NO")).rejects.toBeInstanceOf(AdtNotFoundError);
  });

  it("asks for a bridge rebuild when the old bridge cannot return structures", async () => {
    const { service } = fakeClient({
      SHOW: new AdtBaseError("ADT_NETWORK_ERROR", "RFC call failed: ConversionException: E_XSLT_ATTRIBUTES"),
    });
    await expect(service.read("ZST_X")).rejects.toThrow(/build:bridge/);
  });

  it("asks for a bridge rebuild when the old bridge reports an exception untyped", async () => {
    const { service } = fakeClient({
      SHOW: new AdtBaseError("ADT_NETWORK_ERROR", "RFC call failed: AbapException: NOT_EXISTING"),
    });
    await expect(service.read("ZST_X")).rejects.toThrow(/build:bridge/);
  });

  it("asks for a bridge rebuild when attributes are missing from the result", async () => {
    const { service } = fakeClient({ SHOW: { tables: {} } });
    await expect(service.read("ZST_X")).rejects.toThrow(/build:bridge/);
  });
});

describe("RfcTransformationService.create", () => {
  const opts = { name: "zst_x", description: "Neu", packageName: "$tmp", source: ST };

  it("sends the source line-wise and keeps empty lines", async () => {
    const { service, callFunction, ops } = fakeClient({ SHOW: abapError("NOT_EXISTING") });
    await service.create(opts);
    expect(ops()).toEqual(["SHOW", "CREATE"]);
    const req = callFunction.mock.calls[1]![0];
    expect(req.params).toMatchObject({ I_XSLT_NAME: "ZST_X", I_PACKAGE: "$TMP", I_DESCRIPT: "Neu" });
    expect(req.tables?.["I_XSLT_SOURCE"]?.map((r) => r["LINE"])).toEqual(ST.trimEnd().split("\n"));
  });

  it("refuses to touch an existing object", async () => {
    const { service, ops } = fakeClient({ SHOW: existing });
    await expect(service.create(opts)).rejects.toMatchObject({ errorCode: "ADT_OBJECT_EXISTS" });
    expect(ops()).toEqual(["SHOW"]);
  });

  it("rejects lines longer than 255 characters instead of truncating them", async () => {
    const { service, callFunction } = fakeClient();
    await expect(service.create({ ...opts, source: "ok\n" + "x".repeat(256) })).rejects.toThrow(/line 2.*255/i);
    expect(callFunction).not.toHaveBeenCalled();
  });

  it("requires a transport request outside local packages (SAP would open a popup)", async () => {
    const { service, callFunction } = fakeClient();
    await expect(service.create({ ...opts, packageName: "ZPKG" })).rejects.toMatchObject({
      errorCode: "ADT_TRANSPORT_ERROR",
    });
    expect(callFunction).not.toHaveBeenCalled();
  });

  it("passes the transport request on", async () => {
    const { service, callFunction } = fakeClient({ SHOW: abapError("NOT_EXISTING") });
    await service.create({ ...opts, packageName: "ZPKG", transportNumber: "DEVK900001" });
    expect(callFunction.mock.calls[1]![0].params?.["I_TRANSPORT_REQUEST"]).toBe("DEVK900001");
  });

  it("rejects descriptions longer than 60 characters", async () => {
    const { service } = fakeClient();
    await expect(service.create({ ...opts, description: "d".repeat(61) })).rejects.toThrow(/60/);
  });
});

describe("RfcTransformationService.write", () => {
  it("activates by default and preserves package, author, language and description", async () => {
    const { service, callFunction, ops } = fakeClient({ SHOW: existing });
    const res = await service.write({ name: "ZST_X", source: ST });
    expect(ops()).toEqual(["SHOW", "MODI_ACT"]);
    expect(callFunction.mock.calls[1]![0].params).toMatchObject({
      I_PACKAGE: "$TMP", I_AUTHOR: "OWNER", I_LANGUAGE: "D", I_DESCRIPT: "Alt",
    });
    expect(res).toMatchObject({ name: "ZST_X", activated: true });
  });

  it("only saves when activate is false", async () => {
    const { service, ops } = fakeClient({ SHOW: existing });
    const res = await service.write({ name: "ZST_X", source: ST, activate: false });
    expect(ops()).toEqual(["SHOW", "MODIFY"]);
    expect(res.activated).toBe(false);
  });

  it("requires a transport request for objects in transportable packages", async () => {
    const transportable = {
      tables: { ...existing.tables, E_XSLT_ATTRIBUTES: [{ DEVCLASS: "ZPKG", DESCRIPT: "Alt" }] },
    };
    const { service, ops } = fakeClient({ SHOW: transportable });
    await expect(service.write({ name: "ZST_X", source: ST })).rejects.toMatchObject({
      errorCode: "ADT_TRANSPORT_ERROR",
    });
    expect(ops()).toEqual(["SHOW"]);
  });

  it("reports syntax errors and says the active version is unchanged", async () => {
    const { service } = fakeClient({ SHOW: existing, MODI_ACT: abapError("SYNTAX_ERRORS", "Fehler in Zeile 3") });
    const err = (await service.write({ name: "ZST_X", source: ST }).catch((e: unknown) => e)) as AdtBaseError;
    expect(err.errorCode).toBe("ADT_SYNTAX_ERROR");
    expect(err.message).toContain("Fehler in Zeile 3");
    expect(err.message).toMatch(/inactive/);
  });

  it("maps LOCK_FAILURE to a lock conflict", async () => {
    const { service } = fakeClient({ SHOW: existing, MODI_ACT: abapError("LOCK_FAILURE", "gesperrt") });
    await expect(service.write({ name: "ZST_X", source: ST })).rejects.toMatchObject({
      errorCode: "ADT_LOCK_CONFLICT",
      details: { exception: "LOCK_FAILURE", sapMessage: "gesperrt" },
    });
  });

  it("maps PERMISSION_FAILURE to ADT_PERMISSION_DENIED", async () => {
    const { service } = fakeClient({ SHOW: existing, MODI_ACT: abapError("PERMISSION_FAILURE") });
    await expect(service.write({ name: "ZST_X", source: ST })).rejects.toMatchObject({
      errorCode: "ADT_PERMISSION_DENIED",
    });
  });
});

describe("TransformationService RFC fallback", () => {
  const opts = { name: "ZST_X", description: "d", packageName: "$TMP", transformationType: "ST" as const };

  function service(rfc: boolean) {
    const { client, callFunction } = fakeClient({ SHOW: abapError("NOT_EXISTING") });
    Object.assign(client, {
      supportsRfc: () => rfc,
      post: jest.fn(async () => {
        throw new AdtNotFoundError("/sap/bc/adt/programs/transforms");
      }),
    });
    return { callFunction, s: new TransformationService(client) };
  }

  it("creates a Simple Transformation skeleton via RFC when ADT has no endpoint", async () => {
    const { s, callFunction } = service(true);
    await expect(s.createSimpleTransformation(opts)).resolves.toMatchObject({ name: "ZST_X", type: "XSLT/VT" });
    const lines = callFunction.mock.calls[1]![0].tables!["I_XSLT_SOURCE"]!.map((r) => r["LINE"]);
    expect(lines[0]).toBe("<?sap.transform simple?>");
  });

  it("uses an XSL skeleton for XSLT programs", async () => {
    const { s, callFunction } = service(true);
    await s.createXslt(opts);
    const text = callFunction.mock.calls[1]![0].tables!["I_XSLT_SOURCE"]!.map((r) => r["LINE"]).join("\n");
    expect(text).toContain("xsl:transform");
    expect(text).not.toContain("sap.transform simple");
  });

  it("uses the given source", async () => {
    const { s, callFunction } = service(true);
    await s.createSimpleTransformation({ ...opts, source: ST });
    expect(callFunction.mock.calls[1]![0].tables!["I_XSLT_SOURCE"]).toHaveLength(ST.trimEnd().split("\n").length);
  });

  it("keeps the explanation without RFC", async () => {
    const { s, callFunction } = service(false);
    await expect(s.createSimpleTransformation(opts)).rejects.toThrow(/SAP_TRANSPORT=rfc/);
    expect(callFunction).not.toHaveBeenCalled();
  });
});

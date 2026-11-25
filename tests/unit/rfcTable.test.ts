import { describe, it, expect, jest } from "@jest/globals";
import { encodeRfcCall, decodeRfcResult } from "../../src/adt/rfcCodec.js";
import { RfcTableService } from "../../src/services/RfcTableService.js";
import type { AdtHttpClient } from "../../src/adt/client.js";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("rfcCodec", () => {
  it("encodes params, table rows and output tables line-wise with base64 values", () => {
    const body = encodeRfcCall({
      params: { QUERY_TABLE: "VBRK" },
      tables: { OPTIONS: [{ TEXT: "VBELN = 'A\tB'" }], FIELDS: [{ FIELDNAME: "VBELN" }, { FIELDNAME: "FKDAT" }] },
      outTables: ["DATA"],
    });
    expect(body.split("\n")).toEqual([
      `P\tQUERY_TABLE\t${b64("VBRK")}`,
      "A\tOPTIONS",
      `F\tOPTIONS\tTEXT\t${b64("VBELN = 'A\tB'")}`,
      "A\tFIELDS",
      `F\tFIELDS\tFIELDNAME\t${b64("VBELN")}`,
      "A\tFIELDS",
      `F\tFIELDS\tFIELDNAME\t${b64("FKDAT")}`,
      "O\tDATA",
    ]);
  });

  it("decodes result rows per table", () => {
    const text = [`R\tDATA\tWA\t${b64("ä 1")}`, `R\tFIELDS\tFIELDNAME\t${b64("X")}\tLENGTH\t${b64("000010")}`, ""].join("\n");
    expect(decodeRfcResult(text)).toEqual({
      tables: { DATA: [{ WA: "ä 1" }], FIELDS: [{ FIELDNAME: "X", LENGTH: "000010" }] },
    });
  });

  it("decodes an empty body", () => {
    expect(decodeRfcResult("")).toEqual({ tables: {} });
  });
});

function mockClient(result: Record<string, Record<string, string>[]>) {
  const callFunction = jest.fn(async () => ({ tables: result }));
  return { client: { callFunction } as unknown as AdtHttpClient, callFunction };
}

describe("RfcTableService.getTableFields", () => {
  it("maps DFIES_TAB rows to field descriptions and calls DDIF_FIELDINFO_GET", async () => {
    const { client, callFunction } = mockClient({
      DFIES_TAB: [
        { FIELDNAME: "MANDT", DATATYPE: "CLNT", LENG: "000003", DECIMALS: "000000", KEYFLAG: "X", FIELDTEXT: "Mandant", ROLLNAME: "MANDT", POSITION: "0001" },
        { FIELDNAME: "VBELN", DATATYPE: "CHAR", LENG: "000010", DECIMALS: "000000", KEYFLAG: "X", FIELDTEXT: "Beleg", ROLLNAME: "VBELN_VF", POSITION: "0002" },
        { FIELDNAME: "NETWR", DATATYPE: "CURR", LENG: "000015", DECIMALS: "000002", KEYFLAG: "", FIELDTEXT: "Netto", ROLLNAME: "NETWR", POSITION: "0003" },
      ],
    });
    const res = await new RfcTableService(client).getTableFields("vbrk");
    expect(callFunction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "DDIF_FIELDINFO_GET", params: expect.objectContaining({ TABNAME: "VBRK" }), outTables: ["DFIES_TAB"] }),
    );
    expect(res.table).toBe("VBRK");
    expect(res.fields[1]).toEqual({
      name: "VBELN", type: "CHAR", length: 10, decimals: 0, key: true, description: "Beleg", dataElement: "VBELN_VF",
    });
    expect(res.fields[2]!.key).toBe(false);
    expect(res.fields[2]!.decimals).toBe(2);
  });

  it("filters fields case-insensitively and reports unknown names", async () => {
    const { client } = mockClient({
      DFIES_TAB: [
        { FIELDNAME: "MANDT", DATATYPE: "CLNT", LENG: "000003", KEYFLAG: "X" },
        { FIELDNAME: "VBELN", DATATYPE: "CHAR", LENG: "000010", KEYFLAG: "X" },
        { FIELDNAME: "NETWR", DATATYPE: "CURR", LENG: "000015", KEYFLAG: "" },
      ],
    });
    const res = await new RfcTableService(client).getTableFields("VBRK", ["netwr", "vbeln", "nope"]);
    expect(res.fields.map((f) => f.name)).toEqual(["VBELN", "NETWR"]);
    expect(res.unknownFields).toEqual(["NOPE"]);
    expect(res.totalFields).toBe(3);
  });

  it("returns all fields and no unknownFields without a filter", async () => {
    const { client } = mockClient({ DFIES_TAB: [{ FIELDNAME: "A", DATATYPE: "CHAR", LENG: "1" }] });
    const res = await new RfcTableService(client).getTableFields("T");
    expect(res.fields).toHaveLength(1);
    expect(res.unknownFields).toBeUndefined();
    expect(res.totalFields).toBe(1);
  });

  it("rejects invalid table names before calling SAP", async () => {
    const { client, callFunction } = mockClient({});
    await expect(new RfcTableService(client).getTableFields("VBRK; DROP")).rejects.toThrow(/table name/i);
    expect(callFunction).not.toHaveBeenCalled();
  });

  it("fails clearly when SAP returns no fields", async () => {
    const { client } = mockClient({ DFIES_TAB: [] });
    await expect(new RfcTableService(client).getTableFields("ZNOPE")).rejects.toThrow(/no fields/i);
  });
});

describe("RfcTableService.readTable", () => {
  const fields = [
    { FIELDNAME: "VBELN", OFFSET: "000000", LENGTH: "000010", TYPE: "C" },
    { FIELDNAME: "FKDAT", OFFSET: "000010", LENGTH: "000008", TYPE: "D" },
  ];

  it("slices rows by offset/length and splits the WHERE clause into 72-char option lines", async () => {
    const { client, callFunction } = mockClient({
      FIELDS: fields,
      DATA: [{ WA: "0090000001" + "20240105" }, { WA: "0090000002" + "20240106" }],
    });
    const where = "VBELN LIKE '009%' AND " + "X".repeat(10) + " = 'Y' AND FKDAT >= '20240101' AND FKART = 'F2'";
    const res = await new RfcTableService(client).readTable({
      table: "vbrk", fields: ["vbeln", "fkdat"], where, maxRows: 2, skipRows: 5,
    });
    expect(res.rows).toEqual([
      { VBELN: "0090000001", FKDAT: "20240105" },
      { VBELN: "0090000002", FKDAT: "20240106" },
    ]);
    expect(res.truncated).toBe(true);
    const call = (callFunction.mock.calls[0] as unknown[])[0] as { params: Record<string, string>; tables: Record<string, Record<string, string>[]> };
    expect(call.params).toMatchObject({ QUERY_TABLE: "VBRK", ROWCOUNT: "2", ROWSKIPS: "5" });
    expect(call.tables.FIELDS).toEqual([{ FIELDNAME: "VBELN" }, { FIELDNAME: "FKDAT" }]);
    const opts = call.tables.OPTIONS!.map((o) => o.TEXT!);
    expect(opts.every((t) => t.length <= 72)).toBe(true);
    // Lines of a dynamic WHERE are separate parts: no word may be cut across a line boundary.
    expect(opts.join(" ")).toBe(where);
  });

  it("never splits a keyword or a quoted literal across option lines", async () => {
    const { client, callFunction } = mockClient({ FIELDS: fields, DATA: [] });
    const where =
      "PGMID = 'R3TR' AND OBJECT = 'DEVC' AND DEVCLASS LIKE 'Z%' AND OBJ_NAME LIKE 'Z0 A%' AND SRCSYSTEM <> 'NOPE'";
    await new RfcTableService(client).readTable({ table: "TADIR", where });
    const call = (callFunction.mock.calls[0] as unknown[])[0] as { tables: Record<string, Record<string, string>[]> };
    const opts = call.tables.OPTIONS!.map((o) => o.TEXT!);
    expect(opts.length).toBeGreaterThan(1);
    expect(opts.every((t) => t.length <= 72 && t === t.trim())).toBe(true);
    expect(opts.join(" ")).toBe(where);
  });

  it("rejects a single WHERE token that cannot fit into one 72-char line", async () => {
    const { client } = mockClient({ FIELDS: fields, DATA: [] });
    const where = "NAME = '" + "A".repeat(80) + "'";
    await expect(new RfcTableService(client).readTable({ table: "TADIR", where })).rejects.toThrow(/72/);
  });

  it("does not flag truncation when fewer rows than maxRows come back", async () => {
    const { client } = mockClient({ FIELDS: fields, DATA: [{ WA: "0090000001" + "20240105" }] });
    const res = await new RfcTableService(client).readTable({ table: "VBRK", maxRows: 10 });
    expect(res.truncated).toBe(false);
  });

  it("rejects invalid table or field names", async () => {
    const { client } = mockClient({});
    const s = new RfcTableService(client);
    await expect(s.readTable({ table: "VBRK", fields: ["A B"] })).rejects.toThrow(/field name/i);
    await expect(s.readTable({ table: "a-b" })).rejects.toThrow(/table name/i);
  });
});

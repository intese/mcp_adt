import type { AdtHttpClient } from "../adt/client.js";
import type {
  RfcTableFieldsResult,
  RfcReadTableOptions,
  RfcReadTableResult,
} from "../types/index.js";

const NAME_RE = /^[A-Za-z0-9_\/]{1,30}$/;
const OPTION_LINE = 72;

function checkName(kind: "table" | "field", v: string): string {
  if (!NAME_RE.test(v)) throw new Error(`Invalid ${kind} name: "${v}"`);
  return v.toUpperCase();
}

/**
 * DDIC/table access via plain RFC function modules (DDIF_FIELDINFO_GET,
 * RFC_READ_TABLE). Only available with SAP_TRANSPORT=rfc; meant for systems
 * whose ADT backend lacks the ddic/datapreview endpoints (e.g. older ECC).
 */
export class RfcTableService {
  constructor(private readonly client: AdtHttpClient) {}

  async getTableFields(table: string): Promise<RfcTableFieldsResult> {
    const tabname = checkName("table", table);
    const res = await this.client.callFunction({
      name: "DDIF_FIELDINFO_GET",
      params: { TABNAME: tabname }, // LANGU defaults to the RFC logon language
      outTables: ["DFIES_TAB"],
    });
    const rows = res.tables["DFIES_TAB"] ?? [];
    if (rows.length === 0) throw new Error(`SAP returned no fields for ${tabname}`);
    return {
      table: tabname,
      fields: rows.map((r) => ({
        name: r["FIELDNAME"] ?? "",
        type: r["DATATYPE"] ?? "",
        length: parseInt(r["LENG"] ?? "0", 10) || 0,
        decimals: parseInt(r["DECIMALS"] ?? "0", 10) || 0,
        key: (r["KEYFLAG"] ?? "").trim() === "X",
        description: (r["FIELDTEXT"] ?? "").trim(),
        dataElement: (r["ROLLNAME"] ?? "").trim(),
      })),
    };
  }

  async readTable(options: RfcReadTableOptions): Promise<RfcReadTableResult> {
    const table = checkName("table", options.table);
    const fields = (options.fields ?? []).map((f) => checkName("field", f));
    const maxRows = options.maxRows ?? 100;

    const where = options.where?.trim() ?? "";
    const optionRows: Record<string, string>[] = [];
    for (let i = 0; i < where.length; i += OPTION_LINE) {
      optionRows.push({ TEXT: where.slice(i, i + OPTION_LINE) });
    }

    const res = await this.client.callFunction({
      name: "RFC_READ_TABLE",
      params: {
        QUERY_TABLE: table,
        ROWCOUNT: String(maxRows),
        ROWSKIPS: String(options.skipRows ?? 0),
      },
      tables: {
        FIELDS: fields.map((f) => ({ FIELDNAME: f })),
        OPTIONS: optionRows,
      },
      outTables: ["FIELDS", "DATA"],
    });

    const meta = (res.tables["FIELDS"] ?? []).map((f) => ({
      name: (f["FIELDNAME"] ?? "").trim(),
      offset: parseInt(f["OFFSET"] ?? "0", 10) || 0,
      length: parseInt(f["LENGTH"] ?? "0", 10) || 0,
    }));
    const rows = (res.tables["DATA"] ?? []).map((d) => {
      const wa = d["WA"] ?? "";
      const row: Record<string, string> = {};
      for (const m of meta) row[m.name] = wa.slice(m.offset, m.offset + m.length).trimEnd();
      return row;
    });
    return { table, columns: meta.map((m) => m.name), rows, truncated: rows.length >= maxRows };
  }
}

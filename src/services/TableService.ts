import type { AdtHttpClient } from "../adt/client.js";
import type { RunSqlQueryOptions, TableColumnMetadata, TableDataResult } from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";

export class TableService {
  constructor(private readonly client: AdtHttpClient) {}

  async runSqlQuery(options: RunSqlQueryOptions): Promise<TableDataResult> {
    this.validateSelectOnly(options.sql);
    logger.debug("Running SQL query", { sql: options.sql, maxRows: options.maxRows });

    const xml = await this.client.post<string>(
      "/sap/bc/adt/datapreview/freestyle",
      options.sql,
      {
        params: { rowNumber: options.maxRows ?? 100 },
        headers: { "Content-Type": "text/plain", Accept: "application/*" },
      },
    );

    return this.parseTableData(xml);
  }

  private validateSelectOnly(sql: string): void {
    const trimmed = sql.trim();
    if (!/^select\b/i.test(trimmed)) {
      throw new Error("Only SELECT statements are allowed (read-only data preview)");
    }
    if (trimmed.includes(";")) {
      throw new Error("Multiple statements are not allowed (';' detected)");
    }
  }

  private parseTableData(xml: string): TableDataResult {
    try {
      const parsed = parseXml(xml);
      const root =
        (getNestedValue(parsed, ["dataPreview:tableData"]) as Record<string, unknown>) ??
        (getNestedValue(parsed, ["tableData"]) as Record<string, unknown>);
      if (!root) return { totalRows: 0, columns: [], rows: [] };

      const columnBlocks = ensureArray(
        (root["dataPreview:columns"] ?? root["columns"]) as unknown,
      );

      const columns: TableColumnMetadata[] = [];
      const columnValues: string[][] = [];

      for (const block of columnBlocks) {
        const meta = ((block as Record<string, unknown>)["dataPreview:metadata"] ??
          (block as Record<string, unknown>)["metadata"]) as unknown;
        const metaAttr = (name: string): string =>
          attr(meta, `dataPreview:${name}`) || attr(meta, name);
        columns.push({
          name: metaAttr("name"),
          type: metaAttr("type"),
          length: metaAttr("length") || undefined,
          keyAttribute: metaAttr("keyAttribute") === "true",
          description: metaAttr("description") || undefined,
        });

        const dataSet = ((block as Record<string, unknown>)["dataPreview:dataSet"] ??
          (block as Record<string, unknown>)["dataSet"]) as Record<string, unknown>;
        const values = ensureArray(
          (dataSet?.["dataPreview:data"] ?? dataSet?.["data"]) as unknown,
        ).map(extractText);
        columnValues.push(values);
      }

      const rowCount = columnValues[0]?.length ?? 0;
      const rows: Record<string, string>[] = [];
      for (let i = 0; i < rowCount; i++) {
        const row: Record<string, string> = {};
        columns.forEach((col, idx) => {
          row[col.name] = columnValues[idx]?.[i] ?? "";
        });
        rows.push(row);
      }

      return {
        totalRows:
          Number(extractText(root["dataPreview:totalRows"] ?? root["totalRows"])) || rows.length,
        columns,
        rows,
        queryExecutionTime:
          Number(
            extractText(root["dataPreview:queryExecutionTime"] ?? root["queryExecutionTime"]),
          ) || undefined,
      };
    } catch {
      return { totalRows: 0, columns: [], rows: [] };
    }
  }
}

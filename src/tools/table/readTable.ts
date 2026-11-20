import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  table: z.string().min(1).max(30).describe("Table or view name, e.g. VBRK"),
  fields: z
    .array(z.string().min(1).max(30))
    .max(100)
    .optional()
    .describe("Columns to return. Omit for all columns; wide tables (>512 bytes per row) require a column list."),
  where: z
    .string()
    .max(2000)
    .optional()
    .describe("Open SQL WHERE condition without the keyword WHERE, e.g. \"VBELN LIKE '009%' AND FKDAT >= '20240101'\""),
  maxRows: z.number().int().positive().max(1000).default(100).describe("Max rows to return"),
  skipRows: z.number().int().min(0).default(0).describe("Rows to skip (paging)"),
});

export const readTableTool: ToolDefinition<typeof schema> = {
  name: "adt_read_table",
  description:
    "Read rows of a single table via the function module RFC_READ_TABLE (read-only, SE16-like, no joins). " +
    "Requires SAP_TRANSPORT=rfc and S_TABU_DIS authorization. All values are returned as strings in internal format. " +
    "Use adt_run_sql_query where the ADT data preview exists.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      return successResult(
        await services.rfcTableService.readTable({
          table: args.table,
          fields: args.fields,
          where: args.where,
          maxRows: args.maxRows,
          skipRows: args.skipRows,
        }),
      );
    } catch (err) {
      return errorResult(err, "adt_read_table");
    }
  },
};

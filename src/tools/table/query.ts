import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  sql: z
    .string()
    .min(1)
    .max(5000)
    .describe(
      "A single read-only ABAP Open SQL SELECT statement, e.g. \"SELECT matnr, maktx FROM makt WHERE spras = 'D'\". " +
        "Joins and computed columns are supported. Rejected if it is not a SELECT or contains a ';'.",
    ),
  maxRows: z.number().int().positive().max(1000).default(100).describe("Max rows to return"),
});

export const runSqlQueryTool: ToolDefinition<typeof schema> = {
  name: "adt_run_sql_query",
  description:
    "Execute a read-only ABAP Open SQL SELECT query via SAP's ADT data preview endpoint " +
    "(similar to SE16N/SQL Console). Returns rows and column metadata as JSON.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.tableService.runSqlQuery({
        sql: args.sql,
        maxRows: args.maxRows,
      });
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_run_sql_query");
    }
  },
};

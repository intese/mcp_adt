import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  table: z.string().min(1).max(30).describe("Table, structure or view name, e.g. VBRK or ZBC_STRG_TAB"),
  fields: z
    .array(z.string().min(1).max(30))
    .max(200)
    .optional()
    .describe("Only return these fields (case-insensitive). Recommended for large tables such as VBRK/VBRP; unknown names are listed in unknownFields."),
});

export const getTableFieldsTool: ToolDefinition<typeof schema> = {
  name: "adt_get_table_fields",
  description:
    "List the fields of a DDIC table/structure/view (name, type, length, decimals, key flag, text, data element) " +
    "via the function module DDIF_FIELDINFO_GET. Requires SAP_TRANSPORT=rfc. " +
    "Use this where the ADT DDIC endpoints are missing (e.g. older ECC systems).",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      return successResult(await services.rfcTableService.getTableFields(args.table, args.fields));
    } catch (err) {
      return errorResult(err, "adt_get_table_fields");
    }
  },
};

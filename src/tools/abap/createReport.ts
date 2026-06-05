import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { TransportNumberSchema, PackageNameSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  name: z.string().min(1).max(40).describe("Report name (e.g. ZMY_REPORT)"),
  description: z.string().min(1).max(80),
  packageName: PackageNameSchema,
  transportNumber: TransportNumberSchema,
  programType: z
    .enum(["1", "M", "S", "F", "K"])
    .default("1")
    .describe("Program type: 1=Executable, M=Module Pool, S=Subroutine Pool, F=Function Group, K=Class Pool"),
});

export const createReportTool: ToolDefinition<typeof schema> = {
  name: "adt_create_report",
  description: "Create a new SAP ABAP report/program (PROG/P).",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const ref = await services.objectService.createReport(args);
      return successResult(ref);
    } catch (err) {
      return errorResult(err, "adt_create_report");
    }
  },
};

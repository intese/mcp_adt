import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  worklistId: z.string().min(1).describe("ATC worklist ID from adt_run_atc"),
});

export const getAtcResultTool: ToolDefinition<typeof schema> = {
  name: "adt_get_atc_result",
  description: "Retrieve ATC results by worklist ID from a previous adt_run_atc call.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.atcService.getWorklistResult(args.worklistId);
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_get_atc_result");
    }
  },
};

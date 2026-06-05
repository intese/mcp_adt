import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { AdtUriSchema } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  objects: z
    .array(z.object({ uri: AdtUriSchema, name: z.string().min(1) }))
    .min(1)
    .describe("Objects to run ATC on"),
  maximumVerdicts: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Maximum number of ATC findings to return"),
});

export const runAtcTool: ToolDefinition<typeof schema> = {
  name: "adt_run_atc",
  description:
    "Run ABAP Test Cockpit (ATC) checks on SAP objects. " +
    "Returns ATC findings with priority (1=highest, 4=lowest), " +
    "check name, message, and code location.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      const result = await services.atcService.runATC({
        objects: args.objects,
        maximumVerdicts: args.maximumVerdicts,
      });
      return successResult(result);
    } catch (err) {
      return errorResult(err, "adt_run_atc");
    }
  },
};

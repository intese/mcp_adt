import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  bindingName: z
    .string()
    .min(1)
    .max(40)
    .describe("Service binding name to publish"),
});

export const publishServiceBindingTool: ToolDefinition<typeof schema> = {
  name: "adt_publish_service_binding",
  description:
    "Publish (activate) a SAP OData service binding. " +
    "Makes the service available for external consumption.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      await services.cdsService.publishServiceBinding(args.bindingName);
      return successResult({ published: true, bindingName: args.bindingName });
    } catch (err) {
      return errorResult(err, "adt_publish_service_binding");
    }
  },
};

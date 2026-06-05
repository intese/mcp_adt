import { z } from "zod";
import type { ToolDefinition } from "../../types/index.js";
import { successResult, errorResult } from "../helpers.js";

const schema = z.object({
  bindingName: z.string().min(1).max(40).describe("Service binding name to unpublish"),
});

export const unpublishServiceBindingTool: ToolDefinition<typeof schema> = {
  name: "adt_unpublish_service_binding",
  description:
    "Unpublish (deactivate) a SAP OData service binding. " +
    "Removes the service from external availability.",
  inputSchema: schema,
  handler: async (args, services) => {
    try {
      await services.cdsService.unpublishServiceBinding(args.bindingName);
      return successResult({ unpublished: true, bindingName: args.bindingName });
    } catch (err) {
      return errorResult(err, "adt_unpublish_service_binding");
    }
  },
};

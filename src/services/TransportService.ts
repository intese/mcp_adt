import type { AdtHttpClient } from "../adt/client.js";
import type {
  AdtTransportRequest,
  CreateTransportOptions,
} from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { AdtTransportError } from "../adt/errors.js";

export class TransportService {
  constructor(private readonly client: AdtHttpClient) {}

  async listTransports(user?: string): Promise<AdtTransportRequest[]> {
    logger.debug("Listing transport requests", { user });

    const params: Record<string, string | number | boolean | undefined> = {
      _action: "MONI",
      target: "true",
      status: "D",
    };
    if (user) params["user"] = user;

    const xml = await this.client.get<string>("/sap/bc/adt/cts/transports", {
      params,
      headers: { Accept: "application/vnd.sap.adt.cts.transports+xml" },
    });

    return this.parseTransportList(xml);
  }

  async createTransport(options: CreateTransportOptions): Promise<string> {
    logger.debug("Creating transport request", { description: options.description });

    const body = this.buildCreateRequest(options);
    const { data: responseXml, headers } = await this.client.postForHeaders<string>(
      "/sap/bc/adt/cts/transports",
      body,
      {
        headers: {
          "Content-Type": "application/vnd.sap.adt.cts.transports+xml",
          Accept: "application/vnd.sap.adt.cts.transports+xml",
        },
      },
    );

    const number =
      this.extractTransportNumberFromLocation(headers["location"]) ??
      this.extractTransportNumber(responseXml);
    if (!number) {
      throw new AdtTransportError("SAP did not return a transport number");
    }

    logger.info("Transport created", { number });
    return number;
  }

  async releaseTransport(
    number: string,
    ignoreLocal = false,
    skipAtc = false,
  ): Promise<void> {
    this.validateTransportNumber(number);
    logger.info("Releasing transport", { number, ignoreLocal, skipAtc });

    const params: Record<string, string | boolean | undefined> = {};
    if (ignoreLocal) params["ignorelocal"] = "true";
    if (skipAtc) params["skipATC"] = "true";

    await this.client.post<string>(
      `/sap/bc/adt/cts/transportrequests/${number}/release`,
      "",
      {
        params,
        headers: { "Content-Length": "0" },
      },
    );

    logger.info("Transport released", { number });
  }

  async deleteTransport(number: string): Promise<void> {
    this.validateTransportNumber(number);
    logger.warn("Deleting transport", { number });
    await this.client.delete<string>(`/sap/bc/adt/cts/transportrequests/${number}`);
    logger.info("Transport deleted", { number });
  }

  private buildCreateRequest(options: CreateTransportOptions): string {
    const type = options.type ?? "Workbench";
    const target = options.targetSystem
      ? `<tm:target>${this.escapeXml(options.targetSystem)}</tm:target>`
      : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<tm:request xmlns:tm="http://www.sap.com/adt/cts/transports">
  <tm:attributes>
    <tm:category>${type}</tm:category>
    ${target}
    <tm:description>${this.escapeXml(options.description)}</tm:description>
  </tm:attributes>
</tm:request>`;
  }

  private parseTransportList(xml: string): AdtTransportRequest[] {
    try {
      const parsed = parseXml(xml);

      const items = ensureArray(
        getNestedValue(parsed, ["tm:root", "tm:workbench", "tm:request"]) as unknown ??
          getNestedValue(parsed, ["root", "workbench", "request"]) as unknown ??
          getNestedValue(parsed, ["feed", "entry"]) as unknown,
      );

      return items.map((item) => ({
        number: attr(item, "tm:number") || attr(item, "number"),
        type: attr(item, "tm:category") || attr(item, "category") || "W",
        description: extractText(
          (item as Record<string, unknown>)["tm:description"] ??
            (item as Record<string, unknown>)["description"],
        ),
        owner: attr(item, "tm:owner") || attr(item, "owner"),
        status: (attr(item, "tm:status") || "D") as AdtTransportRequest["status"],
        targetSystem: attr(item, "tm:target") || undefined,
      }));
    } catch {
      return [];
    }
  }

  private extractTransportNumberFromLocation(location: string | undefined): string | null {
    if (!location) return null;
    const match = location.match(/[A-Z]{1}[A-Z0-9]{2}K[0-9]{6}/);
    return match ? match[0] : null;
  }

  private extractTransportNumber(responseXml: string): string | null {
    try {
      const parsed = parseXml(responseXml);
      const root = getNestedValue(parsed, ["tm:request"]) as Record<string, unknown> | undefined;
      if (root) {
        const num = attr(root, "tm:number") || attr(root, "number");
        if (num) return num;
      }
      // Try alternative locations
      const keys = Object.keys(parsed);
      for (const key of keys) {
        const node = parsed[key] as Record<string, unknown>;
        if (node && typeof node === "object") {
          const num = attr(node, "tm:number") || attr(node, "number");
          if (num && /^[A-Z0-9]{10}$/.test(num)) return num;
        }
      }
    } catch {
      // Try regex fallback
    }
    const match = responseXml.match(/[A-Z]{1}[A-Z0-9]{2}K[0-9]{6}/);
    return match ? match[0] ?? null : null;
  }

  private validateTransportNumber(number: string): void {
    if (!/^[A-Z0-9]{10}$/.test(number)) {
      throw new AdtTransportError(
        `Invalid transport number: ${number}. Must be 10 alphanumeric characters.`,
      );
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

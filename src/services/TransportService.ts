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

    // SAP's ICF content negotiation rejects the dedicated cts.transports
    // media type for this GET resource ("Zulässige Inhaltstypen:
    // application/vnd.sap.as+xml") — only the generic AS-ABAP XML type is
    // actually registered here, even though it works as Content-Type for POST.
    const xml = await this.client.get<string>("/sap/bc/adt/cts/transports", {
      params,
      headers: { Accept: "application/vnd.sap.as+xml" },
    });

    return this.parseTransportList(xml);
  }

  async createTransport(options: CreateTransportOptions): Promise<string> {
    logger.debug("Creating transport request", {
      description: options.description,
      packageName: options.packageName,
    });

    const body = this.buildCreateRequest(options);
    // SAP has no ABAP data type registered for the "obvious"
    // application/vnd.sap.adt.cts.transports+xml content type on this
    // resource ("Kein Datentyp in Content-Typ ... gefunden") — it expects
    // the generic AS-ABAP XML envelope with an explicit dataname identifying
    // the RFC structure to deserialize into, same pattern as the /transportchecks
    // endpoint.
    const { data: responseXml, headers } = await this.client.postForHeaders<string>(
      "/sap/bc/adt/cts/transports",
      body,
      {
        headers: {
          "Content-Type":
            "application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.CreateCorrectionRequest.v1",
          Accept: "application/vnd.sap.as+xml",
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
    const category = options.type === "Customizing" ? "W" : "K";
    const target = options.targetSystem
      ? `<TARGET>${this.escapeXml(options.targetSystem)}</TARGET>`
      : "";
    const description = this.escapeXml(options.description);
    const devClass = this.escapeXml(options.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
    <DATA>
      <CATEGORY>${category}</CATEGORY>
      ${target}
      <REQUEST_TEXT>${description}</REQUEST_TEXT>
      <DESCRIPTION>${description}</DESCRIPTION>
      <DEVCLASS>${devClass}</DEVCLASS>
    </DATA>
  </asx:values>
</asx:abap>`;
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
      const asxData = getNestedValue(parsed, ["asx:abap", "asx:values", "DATA"]) as
        | Record<string, unknown>
        | undefined;
      if (asxData) {
        const num = extractText(asxData["TRKORR"]);
        if (num) return num;
      }
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

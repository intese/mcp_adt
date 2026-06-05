import type { AdtHttpClient } from "../adt/client.js";
import type { CDSServiceBinding, AdtObjectReference } from "../types/index.js";
import { parseXml, attr, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { serviceBindingUri, validateAdtUri } from "../utils/uri.js";

export class CDSService {
  constructor(private readonly client: AdtHttpClient) {}

  async publishServiceBinding(bindingName: string): Promise<void> {
    const uri = serviceBindingUri(bindingName);
    logger.info("Publishing service binding", { name: bindingName });

    await this.client.post<string>(`${uri}/publish`, "", {
      headers: { "Content-Length": "0" },
    });

    logger.info("Service binding published", { name: bindingName });
  }

  async unpublishServiceBinding(bindingName: string): Promise<void> {
    const uri = serviceBindingUri(bindingName);
    logger.info("Unpublishing service binding", { name: bindingName });

    await this.client.post<string>(`${uri}/unpublish`, "", {
      headers: { "Content-Length": "0" },
    });

    logger.info("Service binding unpublished", { name: bindingName });
  }

  async getServiceBindings(cdsViewUri: string): Promise<CDSServiceBinding[]> {
    validateAdtUri(cdsViewUri);
    const xml = await this.client.get<string>(`${cdsViewUri}/bindings`, {
      headers: { Accept: "application/vnd.sap.adt.services.bindings+xml" },
    });
    return this.parseServiceBindings(xml);
  }

  async analyzeCdsView(viewUri: string): Promise<Record<string, unknown>> {
    validateAdtUri(viewUri);
    logger.debug("Analyzing CDS view", { uri: viewUri });

    const xml = await this.client.get<string>(viewUri, {
      headers: { Accept: "application/vnd.sap.adt.services.datas+xml" },
    });

    const parsed = parseXml(xml);
    return parsed;
  }

  async getCdsDependencies(viewUri: string): Promise<AdtObjectReference[]> {
    validateAdtUri(viewUri);

    const xml = await this.client.get<string>(`${viewUri}?dependencies`, {
      headers: {
        Accept: "application/vnd.sap.adt.repository.informationsystem.dependencies+xml",
      },
    });

    return this.parseDependencies(xml);
  }

  private parseServiceBindings(xml: string): CDSServiceBinding[] {
    try {
      const parsed = parseXml(xml);
      const bindings = ensureArray(
        getNestedValue(parsed, ["bindings", "binding"]) as unknown,
      );
      return bindings.map((b) => ({
        name: attr(b, "adtcore:name"),
        uri: attr(b, "adtcore:uri"),
        type: (attr(b, "type") === "odata_v4" ? "odata_v4" : "odata_v2") as CDSServiceBinding["type"],
        isPublished: attr(b, "published") === "true",
        description: attr(b, "description") || undefined,
      }));
    } catch {
      return [];
    }
  }

  private parseDependencies(xml: string): AdtObjectReference[] {
    try {
      const parsed = parseXml(xml);
      const refs = ensureArray(
        getNestedValue(parsed, ["adtcore:objectReferences", "adtcore:objectReference"]) as unknown,
      );
      return refs.map((ref) => ({
        uri: attr(ref, "adtcore:uri"),
        name: attr(ref, "adtcore:name"),
        type: attr(ref, "adtcore:type"),
        description: attr(ref, "adtcore:description"),
      }));
    } catch {
      return [];
    }
  }
}

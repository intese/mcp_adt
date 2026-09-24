import type { AdtHttpClient } from "../adt/client.js";
import type { AdtPackage, AdtPackageContent, CreatePackageOptions, AdtObjectReference } from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { packageUri, withCorrNr } from "../utils/uri.js";

export class PackageService {
  constructor(private readonly client: AdtHttpClient) {}

  async listPackages(parentPackage?: string): Promise<AdtPackage[]> {
    logger.debug("Listing packages", { parent: parentPackage });

    const params: Record<string, string | number | boolean | undefined> = {};
    if (parentPackage) params["packageName"] = parentPackage;

    const xml = await this.client.get<string>(
      "/sap/bc/adt/repository/informationsystem/objecttypes",
      {
        params: { ...params, objectType: "DEVC/K", maxResults: 200 },
        headers: {
          Accept:
            "application/vnd.sap.adt.repository.informationsystem.objecttypes+xml",
        },
      },
    );

    return this.parsePackageList(xml);
  }

  async createPackage(options: CreatePackageOptions): Promise<AdtObjectReference> {
    logger.debug("Creating package", { name: options.name });

    const params: Record<string, string | undefined> = {
      parentPackage: options.superPackage,
    };
    if (options.transportNumber) params["corrNr"] = options.transportNumber;

    const body = this.buildCreateRequest(options);
    await this.client.post<string>("/sap/bc/adt/repository/packages", body, {
      params,
      headers: { "Content-Type": "application/vnd.sap.adt.repository.packages+xml" },
    });

    const uri = packageUri(options.name);
    logger.info("Package created", { name: options.name });
    return { uri, name: options.name.toUpperCase(), type: "DEVC/K" };
  }

  async getPackageContent(packageName: string): Promise<AdtPackageContent> {
    logger.debug("Getting package content", { package: packageName });

    const xml = await this.client.get<string>(
      `/sap/bc/adt/repository/informationsystem/search`,
      {
        params: {
          operation: "quickSearch",
          query: "*",
          packageName: packageName.toUpperCase(),
          maxResults: 500,
        },
        headers: {
          Accept: "application/xml",
        },
      },
    );

    const objects = this.parseObjectReferences(xml);
    const subPackages: AdtPackage[] = [];
    const contentObjects: AdtObjectReference[] = [];

    for (const obj of objects) {
      if (obj.type === "DEVC/K") {
        subPackages.push({
          name: obj.name,
          uri: obj.uri,
          description: obj.description ?? "",
          superPackage: packageName.toUpperCase(),
        });
      } else {
        contentObjects.push(obj);
      }
    }

    return {
      packageName: packageName.toUpperCase(),
      objects: contentObjects,
      subPackages,
    };
  }

  private buildCreateRequest(options: CreatePackageOptions): string {
    const name = options.name.toUpperCase();
    const superPkg = options.superPackage ? options.superPackage.toUpperCase() : "";
    const appComponent = options.applicationComponent ?? "";
    const transportLayer = options.transportLayer ?? "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<pak:package xmlns:pak="http://www.sap.com/adt/packages"
             xmlns:adtcore="http://www.sap.com/adt/core"
             adtcore:description="${this.escapeXml(options.description)}"
             adtcore:language="EN"
             adtcore:name="${name}"
             pak:superPackage="${superPkg}"
             pak:appComponent="${appComponent}"
             pak:transportLayer="${transportLayer}">
</pak:package>`;
  }

  private parsePackageList(xml: string): AdtPackage[] {
    try {
      const parsed = parseXml(xml);
      const refs = ensureArray(
        getNestedValue(parsed, ["adtcore:objectReferences", "adtcore:objectReference"]) as unknown ??
          getNestedValue(parsed, ["objectReferences", "objectReference"]) as unknown,
      );
      return refs.map((ref) => ({
        name: attr(ref, "adtcore:name"),
        uri: attr(ref, "adtcore:uri"),
        description: attr(ref, "adtcore:description"),
      }));
    } catch {
      return [];
    }
  }

  private parseObjectReferences(xml: string): AdtObjectReference[] {
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
        packageName: attr(ref, "adtcore:packageName") || undefined,
      }));
    } catch {
      return [];
    }
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

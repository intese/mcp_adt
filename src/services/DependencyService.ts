import type { AdtHttpClient } from "../adt/client.js";
import type { WhereUsedResult, DependencyNode, ObjectVersion } from "../types/index.js";
import { parseXml, attr, extractText, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { validateAdtUri } from "../utils/uri.js";

export class DependencyService {
  constructor(private readonly client: AdtHttpClient) {}

  async getWhereUsed(objectUri: string): Promise<WhereUsedResult[]> {
    validateAdtUri(objectUri);
    logger.debug("Getting where-used", { uri: objectUri });

    const xml = await this.client.get<string>(`${objectUri}?usages`, {
      headers: {
        Accept: "application/vnd.sap.adt.repository.informationsystem.usages+xml",
      },
    });

    return this.parseWhereUsed(xml);
  }

  async getDependencyGraph(objectUri: string): Promise<DependencyNode> {
    validateAdtUri(objectUri);
    logger.debug("Getting dependency graph", { uri: objectUri });

    const xml = await this.client.get<string>(`${objectUri}?dependencies`, {
      headers: {
        Accept:
          "application/vnd.sap.adt.repository.informationsystem.dependencies+xml",
      },
    });

    return this.parseDependencyGraph(xml, objectUri);
  }

  async getVersionHistory(objectUri: string): Promise<ObjectVersion[]> {
    validateAdtUri(objectUri);
    logger.debug("Getting version history", { uri: objectUri });

    const xml = await this.client.get<string>(`${objectUri}?versions`, {
      headers: { Accept: "application/atom+xml" },
    });

    return this.parseVersionHistory(xml);
  }

  private parseWhereUsed(xml: string): WhereUsedResult[] {
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

  private parseDependencyGraph(xml: string, rootUri: string): DependencyNode {
    try {
      const parsed = parseXml(xml);
      const refs = ensureArray(
        getNestedValue(parsed, ["adtcore:objectReferences", "adtcore:objectReference"]) as unknown,
      );

      const rootName = rootUri.split("/").pop() ?? "";
      return {
        uri: rootUri,
        name: rootName,
        type: "unknown",
        dependencies: refs.map((ref) => ({
          uri: attr(ref, "adtcore:uri"),
          name: attr(ref, "adtcore:name"),
          type: attr(ref, "adtcore:type"),
          dependencies: [],
        })),
      };
    } catch {
      return { uri: rootUri, name: rootUri.split("/").pop() ?? "", type: "unknown", dependencies: [] };
    }
  }

  private parseVersionHistory(xml: string): ObjectVersion[] {
    try {
      const parsed = parseXml(xml);
      const entries = ensureArray(
        getNestedValue(parsed, ["feed", "entry"]) as unknown,
      );

      return entries.map((entry) => {
        const e = entry as Record<string, unknown>;
        return {
          version: attr(e, "adtcore:version") || extractText(e["id"] as unknown),
          versionTitle: extractText(e["title"] as unknown),
          uri: extractText((e["link"] as Record<string, unknown>)?.["@_href"] ?? e["link"] as unknown),
          author: extractText(
            (e["author"] as Record<string, unknown>)?.["name"] as unknown,
          ),
          date: extractText(e["updated"] as unknown),
        };
      });
    } catch {
      return [];
    }
  }
}

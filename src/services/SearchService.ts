import type { AdtHttpClient } from "../adt/client.js";
import type { SearchOptions, SearchResult } from "../types/index.js";
import { parseXml, attr, ensureArray, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";

export class SearchService {
  constructor(private readonly client: AdtHttpClient) {}

  async searchObjects(options: SearchOptions): Promise<SearchResult[]> {
    logger.debug("Searching objects", { query: options.query, type: options.objectType });

    const params: Record<string, string | number | boolean | undefined> = {
      operation: "quickSearch",
      query: options.query,
      maxResults: options.maxResults ?? 50,
    };

    if (options.objectType) params["objectType"] = options.objectType;
    if (options.packageName) params["packageName"] = options.packageName;

    const xml = await this.client.get<string>(
      "/sap/bc/adt/repository/informationsystem/search",
      {
        params,
        headers: {
          Accept:
            "application/vnd.sap.adt.repository.informationsystem.searchresults+xml",
        },
      },
    );

    return this.parseSearchResults(xml);
  }

  private parseSearchResults(xml: string): SearchResult[] {
    try {
      const parsed = parseXml(xml);
      const refs = ensureArray(
        getNestedValue(parsed, [
          "adtcore:objectReferences",
          "adtcore:objectReference",
        ]) as unknown ??
          getNestedValue(parsed, ["objectReferences", "objectReference"]) as unknown,
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
}

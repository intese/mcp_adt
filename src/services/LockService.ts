import type { AdtHttpClient } from "../adt/client.js";
import type { AdtLockResult, AdtLockInfo } from "../types/index.js";
import { parseXml, extractText, getNestedValue } from "../utils/xml.js";
import { logger } from "../utils/logger.js";
import { validateAdtUri } from "../utils/uri.js";
import { AdtLockError } from "../adt/errors.js";

// SAP ADT lock mechanism:
// - Lock:   POST {objectUri}?_action=LOCK&accessMode=MODIFY  (stateful session)
// - Unlock: POST {objectUri}?_action=UNLOCK&lockHandle={handle}  (stateless session)
// - Source write: PUT {sourceUri}?lockHandle={handle}&corrNr={transport}  (stateful session)
//
// For ABAP programs, the lock must target the INCLUDE URI (/programs/includes/{name}),
// not the program URI (/programs/programs/{name}).

function includeUriForProgram(objectUri: string): string {
  return objectUri.replace("/programs/programs/", "/programs/includes/");
}

// SAP message EU510 "user X is already editing Y"; captures the user
const LOCK_CONFLICT_RE = /(?:Benutzer|User) (\S+) (?:bearbeitet bereits|is currently editing)/;

export class LockService {
  constructor(private readonly client: AdtHttpClient) {}

  async acquireLock(objectUri: string): Promise<AdtLockResult> {
    validateAdtUri(objectUri);
    const lockUri = includeUriForProgram(objectUri);
    logger.debug("Acquiring lock", { uri: lockUri });

    this.client.setSessionType("stateful");
    try {
      const xml = await this.client.post<string>(
        `${lockUri}?_action=LOCK&accessMode=MODIFY`,
        "",
        {
          headers: {
            Accept:
              "application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result",
            "Content-Length": "0",
          },
        },
      );

      const result = this.parseLockResponse(xml, objectUri);
      logger.info("Lock acquired", {
        uri: lockUri,
        handle: result.lockHandle.slice(0, 8) + "...",
        transport: result.corrNr,
      });
      return result;
    } catch (err) {
      this.client.setSessionType("stateless");
      throw err;
    }
  }

  async releaseLock(objectUri: string, lockHandle: string): Promise<void> {
    validateAdtUri(objectUri);
    const lockUri = includeUriForProgram(objectUri);
    logger.debug("Releasing lock", { uri: lockUri });

    // Keep stateful session during unlock so SAP routes to the same server holding the ENQUEUE lock
    try {
      await this.client.post<string>(
        `${lockUri}?_action=UNLOCK&lockHandle=${encodeURIComponent(lockHandle)}`,
        "",
        { headers: { "Content-Length": "0" } },
      );
    } finally {
      this.client.setSessionType("stateless");
    }
    logger.info("Lock released", { uri: lockUri });
  }

  /**
   * ADT has no lock query: object metadata carries no lock owner. The only reliable answer
   * is to try to lock the object and read SAP's refusal. The probe runs in its own session,
   * because releasing (and switching to stateless) on the shared client would drop the
   * locks this server currently holds.
   */
  async getLockInfo(objectUri: string): Promise<AdtLockInfo> {
    validateAdtUri(objectUri);
    const probe = this.client.createStatelessClone();
    const locks = new LockService(probe);
    try {
      let handle: string;
      try {
        handle = (await locks.acquireLock(objectUri)).lockHandle;
      } catch (err) {
        const owner = err instanceof Error ? LOCK_CONFLICT_RE.exec(err.message)?.[1] : undefined;
        if (owner) return { isLocked: true, lockedBy: owner };
        // Any other refusal says nothing about locks: never report it as "unlocked"
        throw err;
      }
      await locks.releaseLock(objectUri, handle);
      return { isLocked: false };
    } finally {
      await probe.close();
    }
  }

  private parseLockResponse(xml: string, objectUri: string): AdtLockResult {
    try {
      const parsed = parseXml(xml);

      // SAP returns: <asx:abap><asx:values><DATA><LOCK_HANDLE>...</LOCK_HANDLE><CORRNR>...</CORRNR></DATA></asx:values></asx:abap>
      const data =
        (getNestedValue(parsed, ["asx:abap", "asx:values", "DATA"]) as Record<string, unknown>) ??
        (getNestedValue(parsed, ["abap", "values", "DATA"]) as Record<string, unknown>);

      if (!data) throw new AdtLockError("Invalid lock response from SAP", { xml: xml.slice(0, 200) });

      const handle = extractText(data["LOCK_HANDLE"]);
      if (!handle) throw new AdtLockError("No lock handle in SAP response", { xml: xml.slice(0, 200) });

      return {
        lockHandle: handle,
        corrNr: extractText(data["CORRNR"]) ?? undefined,
        lockTime: undefined,
        lockedBy: extractText(data["CORRUSER"]) ?? undefined,
        objectUri,
      };
    } catch (err) {
      if (err instanceof AdtLockError) throw err;
      throw new AdtLockError("Failed to parse lock response", { error: String(err) });
    }
  }
}

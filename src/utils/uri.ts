// ADT URI construction and parsing utilities

const ADT_BASE = "/sap/bc/adt";

export function classUri(name: string): string {
  return `${ADT_BASE}/oo/classes/${encodeURIComponent(name.toUpperCase())}`;
}

export function interfaceUri(name: string): string {
  return `${ADT_BASE}/oo/interfaces/${encodeURIComponent(name.toUpperCase())}`;
}

export function reportUri(name: string): string {
  return `${ADT_BASE}/programs/programs/${encodeURIComponent(name.toUpperCase())}`;
}

export function functionGroupUri(name: string): string {
  return `${ADT_BASE}/functions/groups/${encodeURIComponent(name.toUpperCase())}`;
}

export function functionModuleUri(groupName: string, moduleName: string): string {
  return `${ADT_BASE}/functions/groups/${encodeURIComponent(groupName.toUpperCase())}/fmodules/${encodeURIComponent(moduleName.toUpperCase())}`;
}

export function packageUri(name: string): string {
  return `${ADT_BASE}/repository/packages/${encodeURIComponent(name.toUpperCase())}`;
}

export function tableUri(name: string): string {
  return `${ADT_BASE}/ddic/tables/${encodeURIComponent(name.toUpperCase())}`;
}

export function dataElementUri(name: string): string {
  return `${ADT_BASE}/ddic/dataelements/${encodeURIComponent(name.toUpperCase())}`;
}

export function domainUri(name: string): string {
  return `${ADT_BASE}/ddic/domains/${encodeURIComponent(name.toUpperCase())}`;
}

export function cdsViewUri(name: string): string {
  return `${ADT_BASE}/ddic/ddl/sources/${encodeURIComponent(name.toUpperCase())}`;
}

export function behaviorDefinitionUri(name: string): string {
  return `${ADT_BASE}/bo/behaviordefinitions/${encodeURIComponent(name.toUpperCase())}`;
}

export function accessControlUri(name: string): string {
  return `${ADT_BASE}/services/accesscontrols/${encodeURIComponent(name.toUpperCase())}`;
}

export function serviceDefinitionUri(name: string): string {
  return `${ADT_BASE}/services/definitions/${encodeURIComponent(name.toUpperCase())}`;
}

export function serviceBindingUri(name: string): string {
  return `${ADT_BASE}/services/bindings/${encodeURIComponent(name.toUpperCase())}`;
}

export function transformationUri(name: string): string {
  return `${ADT_BASE}/programs/transforms/${encodeURIComponent(name.toUpperCase())}`;
}

export function sourceUri(objectUri: string, include = "main"): string {
  return `${objectUri}/source/${include}`;
}

const CLASS_INCLUDE_MAP: Record<string, string> = {
  definitions: "definitions",
  implementations: "implementations",
  macros: "macros",
  test: "testclasses",
  testclasses: "testclasses",
};

export function classSourceUri(classUri: string, include = "main"): string {
  if (include === "main") return `${classUri}/source/main`;
  const segment = CLASS_INCLUDE_MAP[include] ?? include;
  return `${classUri}/includes/${segment}`;
}

export function lockUri(objectUri: string): string {
  return `${objectUri}/lock`;
}

export function unlockUri(objectUri: string, lockHandle: string): string {
  return `${objectUri}/lock/${encodeURIComponent(lockHandle)}`;
}

export function transportRequestUri(number: string): string {
  return `${ADT_BASE}/cts/transportrequests/${number}`;
}

export function validateAdtUri(uri: string): void {
  if (!uri.startsWith(ADT_BASE)) {
    throw new Error(`Invalid ADT URI: ${uri}. Must start with ${ADT_BASE}`);
  }
  if (uri.includes("..")) {
    throw new Error(`Invalid ADT URI: ${uri}. Path traversal not allowed`);
  }
}

export function extractObjectNameFromUri(uri: string): string {
  const parts = uri.split("/");
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}

export function withCorrNr(uri: string, transportNumber?: string): string {
  if (!transportNumber) return uri;
  const separator = uri.includes("?") ? "&" : "?";
  return `${uri}${separator}corrNr=${encodeURIComponent(transportNumber)}`;
}

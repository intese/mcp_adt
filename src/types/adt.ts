// ADT domain types — all objects, responses, and request shapes

export interface AdtClientConfig {
  baseUrl: string;
  client: string;
  user: string;
  password: string;
  language: string;
  tlsVerify: boolean;
  caBundle?: string;
  requestTimeout: number;
  connectTimeout: number;
  maxRetries: number;
  retryDelay: number;
  sessionKeepaliveInterval: number;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export type SessionType = "stateful" | "stateless";

export interface SessionInfo {
  type: SessionType;
  isAuthenticated: boolean;
  csrfToken: string | null;
  cookies: Record<string, string>;
  loginTime: Date | null;
}

// ─── Generic Object Metadata ─────────────────────────────────────────────────

export interface AdtObjectMetadata {
  name: string;
  type: string;
  uri: string;
  sourceUri?: string;
  description: string;
  language: string;
  responsible: string;
  packageName: string;
  createdBy?: string;
  createdAt?: Date;
  changedBy?: string;
  changedAt?: Date;
  lockedBy?: string;
  version?: string;
  isActive?: boolean;
}

// ─── Object References ────────────────────────────────────────────────────────

export interface AdtObjectReference {
  uri: string;
  name: string;
  type?: string;
  description?: string;
  packageName?: string;
}

// ─── Source Code ─────────────────────────────────────────────────────────────

export interface AdtObjectSource {
  uri: string;
  source: string;
  version?: "active" | "inactive";
}

export interface AdtClassIncludes {
  main: string;
  definitions: string;
  implementations: string;
  macros: string;
  test: string;
}

export interface AdtClassSource {
  metadata: AdtObjectMetadata;
  includes: AdtClassIncludes;
}

// ─── Lock ────────────────────────────────────────────────────────────────────

export interface AdtLockResult {
  lockHandle: string;
  corrNr?: string;
  lockTime?: string;
  lockedBy?: string;
  objectUri: string;
}

export interface AdtLockInfo {
  isLocked: boolean;
  lockHandle?: string;
  lockedBy?: string;
  lockTime?: string;
}

// ─── Activation ──────────────────────────────────────────────────────────────

export type ActivationMessageType = "I" | "W" | "E" | "A" | "X";

export interface ActivationMessage {
  type: ActivationMessageType;
  line?: number;
  column?: number;
  description: string;
  objectUri?: string;
}

export interface InactiveObject {
  uri: string;
  name: string;
  type?: string;
}

export interface ActivationResult {
  success: boolean;
  messages: ActivationMessage[];
  inactiveObjects: InactiveObject[];
}

// ─── Syntax Check ────────────────────────────────────────────────────────────

export type SyntaxCheckSeverity = "E" | "W" | "I";

export interface SyntaxCheckFinding {
  severity: SyntaxCheckSeverity;
  line: number;
  column: number;
  message: string;
  uri?: string;
}

export interface SyntaxCheckResult {
  hasErrors: boolean;
  hasWarnings: boolean;
  findings: SyntaxCheckFinding[];
}

// ─── Transport ───────────────────────────────────────────────────────────────

export type TransportStatus = "D" | "R" | "L"; // Draft, Released, Locked

export interface AdtTransportRequest {
  number: string;
  type: string;
  description: string;
  owner: string;
  status: TransportStatus;
  targetSystem?: string;
  createdAt?: string;
  tasks?: AdtTransportTask[];
}

export interface AdtTransportTask {
  number: string;
  description: string;
  owner: string;
  status: TransportStatus;
}

export interface CreateTransportOptions {
  description: string;
  type?: "Workbench" | "Customizing";
  targetSystem?: string;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchOptions {
  query: string;
  maxResults?: number;
  objectType?: string;
  packageName?: string;
}

export interface SearchResult {
  uri: string;
  name: string;
  type: string;
  description: string;
  packageName?: string;
}

// ─── Package ─────────────────────────────────────────────────────────────────

export interface AdtPackage {
  name: string;
  uri: string;
  description: string;
  superPackage?: string;
  applicationComponent?: string;
  transportLayer?: string;
}

export interface AdtPackageContent {
  packageName: string;
  objects: AdtObjectReference[];
  subPackages: AdtPackage[];
}

export interface CreatePackageOptions {
  name: string;
  description: string;
  superPackage?: string;
  transportNumber?: string;
  applicationComponent?: string;
  transportLayer?: string;
}

// ─── ATC ─────────────────────────────────────────────────────────────────────

export type ATCPriority = 1 | 2 | 3 | 4;

export interface ATCFinding {
  id: string;
  checkId: string;
  checkTitle: string;
  messageTitle: string;
  priority: ATCPriority;
  objectUri: string;
  objectName: string;
  objectType: string;
  packageName?: string;
  line?: number;
  column?: number;
  exemptionApproval?: string;
}

export interface ATCRunResult {
  worklistId: string;
  findings: ATCFinding[];
  totalFindings: number;
  byPriority: Record<ATCPriority, number>;
}

export interface ATCRunOptions {
  objects: AdtObjectReference[];
  maximumVerdicts?: number;
}

// ─── Unit Tests ──────────────────────────────────────────────────────────────

export type UnitTestAlertKind = "assertion" | "exception" | "warning";
export type UnitTestAlertSeverity = "fatal" | "critical" | "tolerable";
export type UnitTestStatus = "passed" | "failed" | "error";

export interface UnitTestAlert {
  kind: UnitTestAlertKind;
  severity: UnitTestAlertSeverity;
  title: string;
  details: string[];
  stack?: UnitTestStackEntry[];
}

export interface UnitTestStackEntry {
  uri: string;
  description: string;
}

export interface UnitTestMethod {
  name: string;
  executionTime?: number;
  status: UnitTestStatus;
  alerts: UnitTestAlert[];
}

export interface UnitTestClass {
  name: string;
  uri: string;
  status: UnitTestStatus;
  methods: UnitTestMethod[];
}

export interface UnitTestProgram {
  name: string;
  uri: string;
  status: UnitTestStatus;
  testClasses: UnitTestClass[];
}

export interface UnitTestRunResult {
  status: UnitTestStatus;
  programs: UnitTestProgram[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    executionTimeMs?: number;
  };
}

export interface UnitTestRunOptions {
  objectUri: string;
  objectName: string;
  riskLevels?: {
    harmless?: boolean;
    dangerous?: boolean;
    critical?: boolean;
  };
  durations?: {
    short?: boolean;
    medium?: boolean;
    long?: boolean;
  };
}

// ─── Where-Used ───────────────────────────────────────────────────────────────

export interface WhereUsedResult {
  uri: string;
  name: string;
  type: string;
  description: string;
  packageName?: string;
}

// ─── Version ──────────────────────────────────────────────────────────────────

export interface ObjectVersion {
  version: string;
  versionTitle: string;
  uri: string;
  author: string;
  date: string;
}

// ─── Object Creation ─────────────────────────────────────────────────────────

export interface CreateObjectOptions {
  name: string;
  description: string;
  packageName: string;
  transportNumber?: string;
  responsible?: string;
  language?: string;
}

export interface CreateClassOptions extends CreateObjectOptions {
  superClass?: string;
  isFinal?: boolean;
  isAbstract?: boolean;
  visibility?: "public" | "private" | "protected";
  instantiation?: "public" | "protected" | "private";
}

export interface CreateInterfaceOptions extends CreateObjectOptions {
  isAbstract?: boolean;
}

export interface CreateReportOptions extends CreateObjectOptions {
  programType?: "1" | "M" | "S" | "F" | "K";
}

export interface CreateFunctionGroupOptions extends CreateObjectOptions {
  fixedPointArithmetic?: boolean;
}

export interface CreateFunctionModuleOptions {
  groupName: string;
  name: string;
  description: string;
  transportNumber?: string;
}

export interface CreateCdsViewOptions extends CreateObjectOptions {
  category?: "VIEW" | "ENTITY" | "TYPE";
}

// ─── CDS ──────────────────────────────────────────────────────────────────────

export interface CDSServiceBinding {
  name: string;
  uri: string;
  type: "odata_v2" | "odata_v4";
  isPublished: boolean;
  description?: string;
}

// ─── Transformations ─────────────────────────────────────────────────────────

export interface CreateTransformationOptions extends CreateObjectOptions {
  transformationType: "ST" | "XSLT";
}

// ─── Dependency Graph ────────────────────────────────────────────────────────

export interface DependencyNode {
  uri: string;
  name: string;
  type: string;
  dependencies: DependencyNode[];
}

// ─── Node Structure ──────────────────────────────────────────────────────────

export interface AdtNodeStructure {
  nodes: AdtNode[];
  objectTypes: AdtObjectTypeInfo[];
  categories: AdtCategoryInfo[];
}

export interface AdtNode {
  uri: string;
  name: string;
  techName?: string;
  type: string;
  description?: string;
  expandable: boolean;
  categoryTag?: string;
}

export interface AdtObjectTypeInfo {
  type: string;
  label: string;
  baseName: string;
}

export interface AdtCategoryInfo {
  tag: string;
  label: string;
  order: number;
}

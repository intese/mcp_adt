# sap-adt-mcp-server — Architektur

## Überblick

Der `sap-adt-mcp-server` ist ein produktionsreifer MCP-Server (Model Context Protocol), der MCP-kompatiblen Clients direkten Zugriff auf SAP ABAP-Entwicklungsobjekte über offizielle SAP ADT REST APIs ermöglicht.

```
┌─────────────────────────────────────────────────────────────┐
│                       MCP Client                             │
│                   (MCP Client / Host)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ MCP Protocol (stdio / JSON-RPC 2.0)
┌──────────────────────────▼──────────────────────────────────┐
│                     MCP Server Layer                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │               Tool Registry (40+ Tools)              │    │
│  │  repository | activation | syntax | transport |      │    │
│  │  package | analysis | atc | unittest | locks |       │    │
│  │  abap | cds | odata | transformations               │    │
│  └────────────────────────┬────────────────────────────┘    │
│  ┌─────────────────────────▼──────────────────────────────┐ │
│  │                   Service Layer                         │ │
│  │  ObjectService | ActivationService | SyntaxService |   │ │
│  │  TransportService | PackageService | SearchService |   │ │
│  │  ATCService | UnitTestService | LockService |          │ │
│  │  CDSService | TransformationService | DependencyService│ │
│  └────────────────────────┬────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   ADT Client Layer                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   AdtHttpClient                        │  │
│  │  - Axios HTTP engine                                   │  │
│  │  - Session management (stateful/stateless)             │  │
│  │  - CSRF token handling (auto-fetch + auto-retry)       │  │
│  │  - Cookie persistence (SAP_SESSION + MYSAPSSO2)        │  │
│  │  - Retry strategy (exponential backoff)                │  │
│  │  - TLS configuration (skip / CA bundle)                │  │
│  │  - Request/Response logging (sanitized)                │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (REST / XML / JSON)
┌──────────────────────────▼──────────────────────────────────┐
│                   SAP Backend                                │
│             SAP ECC 6.07+ / S/4HANA 2020+                   │
│                 ADT REST API (/sap/bc/adt/...)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Komponenten

### 1. MCP Server (`src/index.ts`)

Einstiegspunkt. Initialisiert `@modelcontextprotocol/sdk` Server, registriert alle Tools, verbindet stdin/stdout Transport.

**Verantwortlichkeiten:**
- MCP Server Initialisierung
- Tool-Handler Routing (`tools/call` → Tool Registry)
- Globale Fehlerbehandlung
- Graceful Shutdown

### 2. Tool Registry (`src/tools/registry.ts`)

Zentrale Registrierung aller MCP-Tools. Jedes Tool ist ein eigenständiges Modul mit:
- `definition`: Zod-validiertes JSON Schema für MCP `Tool`-Typ
- `handler`: Async Funktion `(args, services) → ToolResult`

**Tool-Gruppen:**

| Gruppe | Anzahl | Beschreibung |
|--------|--------|--------------|
| repository | 7 | Objekte lesen/schreiben/suchen/erzeugen/löschen |
| activation | 2 | Einzeln- und Massenaktivierung |
| syntax | 2 | Syntaxprüfung (Objekt + Quelltext) |
| transport | 4 | Aufträge auflisten/erzeugen/zuweisen/freigeben |
| package | 3 | Pakete auflisten/erzeugen/Inhalt lesen |
| analysis | 4 | Where-Used, Abhängigkeiten, Metadaten, Versionen |
| atc | 2 | ATC starten + Ergebnisse lesen |
| unittest | 2 | Unit Tests starten + Ergebnisse lesen |
| locks | 3 | Sperren setzen/lösen/Besitzer ermitteln |
| abap | 8 | Klassen, Interfaces, Reports, Funktionsgruppen |
| cds | 5 | CDS Views anlegen/analysieren/generieren |
| odata | 2 | Service Bindings + Definitionen erzeugen |
| transformations | 6 | ST/XSLT anlegen, XML-Hilfsfunktionen |

### 3. Service Layer (`src/services/`)

Businesslogik-Schicht zwischen Tools und ADT Client. Kein direkter HTTP-Zugriff aus Tools.

Jeder Service erhält eine `AdtHttpClient`-Instanz und kapselt:
- Endpoint-Logik
- XML-Serialisierung/-Deserialisierung
- Fehlerübersetzung (ADT-Fehler → MCP-Fehler)
- Ergebnistransformation

**Services:**

```
ObjectService       — CRUD auf Repository-Objekte
ActivationService   — Aktivierungsworkflow (inkl. Preaudit)
SyntaxService       — Syntaxprüfung und Fehlerextraktion
TransportService    — Transportaufträge und -aufgaben
PackageService      — Pakete und Hierarchien
SearchService       — Volltextsuche und Navigationshilfen
ATCService          — ATC-Läufe und Ergebnisverarbeitung
UnitTestService     — Unit-Test-Ausführung und Auswertung
LockService         — Lock-Lifecycle-Management
CDSService          — CDS-Artefakte und Service-Bindings
TransformationService — ST/XSLT-Verwaltung
DependencyService   — Where-Used und Abhängigkeitsgraphen
```

### 4. ADT Client Layer (`src/adt/`)

**Nur HTTP-Kommunikation. Keine Objektlogik.**

#### `AdtHttpClient` (`src/adt/client.ts`)

```typescript
class AdtHttpClient {
  constructor(config: AdtClientConfig)
  
  // Lifecycle
  login(): Promise<void>
  logout(): Promise<void>
  
  // HTTP Methoden
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>
  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>
  delete<T>(path: string, options?: RequestOptions): Promise<T>
  
  // Utilities
  getSessionInfo(): SessionInfo
  createStatelessClone(): AdtHttpClient
}
```

#### `SessionManager` (`src/adt/session.ts`)

Verwaltet SAP-Sessionkookies, CSRF-Token, Keep-Alive-Pings und Session-Erneuerung.

#### `AdtErrors` (`src/adt/errors.ts`)

SAP-spezifische Fehlerklassen mit strukturiertem Mapping auf MCP-Fehlercodes.

### 5. Configuration (`src/config/`)

Zod-validierte Konfiguration aus Umgebungsvariablen. Keine Defaults für sicherheitskritische Werte.

### 6. Types (`src/types/`)

Vollständige TypeScript-Typdefinitionen für alle ADT-Artefakte. Kein `any`.

### 7. Utils (`src/utils/`)

Zustandslose Hilfsfunktionen: Logger, XML-Parser, URI-Builder.

---

## Datenfluss

### Normaler Tool-Aufruf

```
MCP Client
    │
    │  tools/call { name: "adt_read_object", arguments: { objectUri: "..." } }
    ▼
MCP Server (index.ts)
    │
    │  Routing via Tool Registry
    ▼
Tool Handler (tools/repository/read.ts)
    │
    │  Validierung via Zod
    │  Aufruf: objectService.getObjectSource(uri)
    ▼
ObjectService (services/ObjectService.ts)
    │
    │  URL-Konstruktion
    │  Header-Aufbereitung
    ▼
AdtHttpClient (adt/client.ts)
    │
    │  CSRF-Check
    │  Session-Check
    │  Axios GET /sap/bc/adt/...
    ▼
SAP Backend
    │
    ▼
Response XML/Text
    │
    ▼
ObjectService (XML-Parsing, Fehlerprüfung)
    │
    ▼
Tool Handler (Ergebnis-Transformation → MCP Content)
    │
    ▼
MCP Client { content: [{ type: "text", text: "..." }] }
```

### Schreib-Workflow (mit Lock)

```
1. adt_lock_object      → LockService.acquireLock(uri)   → Lock Handle
2. adt_write_object     → ObjectService.setSource(uri, src, lockHandle, transport)
3. adt_syntax_check     → SyntaxService.check(uri)
4. adt_activate_object  → ActivationService.activate(uri)
5. adt_unlock_object    → LockService.releaseLock(uri, lockHandle)
```

---

## Fehlerbehandlung

### Fehlerhierarchie

```
AdtBaseError
├── AdtAuthenticationError   (401, 403)
├── AdtCsrfError             (403 mit CSRF-Kontext)
├── AdtNotFoundError         (404)
├── AdtLockError             (423, Lock-Konflikt)
├── AdtTransportError        (Transport-Fehler)
├── AdtActivationError       (Aktivierungsfehler mit Messages)
├── AdtSyntaxError           (Syntaxfehler mit Position)
├── AdtTimeoutError          (Timeout)
└── AdtUnknownError          (Unbekannte SAP-Fehler)
```

### MCP-Fehlerformat

Alle Fehler werden normalisiert:

```json
{
  "success": false,
  "errorCode": "ADT_LOCK_CONFLICT",
  "message": "Object /sap/bc/adt/classes/classes/ZMY_CLASS is locked by user DEVUSER",
  "details": {
    "lockedBy": "DEVUSER",
    "lockTime": "2024-01-15T10:30:00Z",
    "objectUri": "/sap/bc/adt/classes/classes/ZMY_CLASS"
  }
}
```

---

## Authentifizierung

### Aktuell implementiert

**Basic Authentication:**
- `Authorization: Basic {base64(user:password)}`
- Session-Cookie-Persistenz nach erstem Login
- CSRF-Token automatisch verwaltet

### Vorbereitet (Erweiterungspunkte)

**SSO / SAML:**
- `BearerFetcher`-Interface für externe Token-Provider
- Token-Cache mit automatischer Erneuerung

**OAuth 2.0:**
- `OAuthProvider`-Interface (Stub)
- Client-Credentials und Authorization-Code-Flow

**Zertifikatsauthentifizierung:**
- `ClientCertConfig` (Stub)
- mTLS-Unterstützung via Axios-Konfiguration

---

## Security

| Maßnahme | Implementierung |
|----------|-----------------|
| Keine Credential-Logs | `sanitizeHeaders()` in Logger |
| TLS-Verifikation | Standardmäßig aktiv (`SAP_TLS_VERIFY=true`) |
| Input-Validierung | Zod-Schemas auf allen Tool-Inputs |
| URI-Sanitierung | `validateAdtUri()` vor jedem Request |
| Secret-Management | Nur über `.env` / Umgebungsvariablen |
| Rate Limiting | Axios-Interceptor mit konfigurierbarem Limit |

---

## Performance

| Mechanismus | Details |
|-------------|---------|
| Session Reuse | SAP-Session-Cookie zwischen Requests wiederverwendet |
| Connection Keep-Alive | HTTP/1.1 keep-alive über Axios |
| CSRF-Token-Cache | Pro Session gecacht, nur bei 403 erneuert |
| Metadata-Cache | In-Memory TTL-Cache (5 Minuten) für Objektmetadaten |
| Parallel Requests | `createStatelessClone()` für konkurrierende Anfragen |
| Batch Activation | Mehrere Objekte in einer Aktivierungsanfrage |

---

## Erweiterbarkeit

### Neues Tool hinzufügen

1. Tool-Handler in `src/tools/{gruppe}/{name}.ts` anlegen
2. Zod-Schema definieren
3. In `src/tools/{gruppe}/index.ts` registrieren
4. In `src/tools/registry.ts` importieren

### Neuen Service hinzufügen

1. `src/services/{Name}Service.ts` anlegen
2. Interface in `src/types/adt.ts` definieren
3. In `src/index.ts` initialisieren und an Tools übergeben

### Neue ADT-Endpoints

Alle ADT-Endpoints sind in `docs/adt-endpoints.md` dokumentiert.
Für neue Endpoints: in `AdtHttpClient` keine Änderung nötig — nur neuer Service.

---

## Konfiguration

Alle Parameter via `.env` / Umgebungsvariablen. Siehe `.env.example`.

Kritische Parameter:
- `SAP_URL` — Base-URL des SAP-Systems (z.B. `https://sap.company.com:8443`)
- `SAP_CLIENT` — Mandant (z.B. `100`)
- `SAP_USER` — Technischer Benutzer (Mindestberechtigungen: S_ADT_*)
- `SAP_PASSWORD` — Passwort (niemals ins Log)

---

## Verzeichnisstruktur

```
sap-adt-mcp-server/
├── src/
│   ├── config/              # Zod-validierte Konfiguration
│   ├── adt/                 # Core HTTP Client + Session + Errors
│   ├── services/            # Business-Logik pro Domäne
│   ├── tools/               # MCP Tool-Handler (je Gruppe)
│   ├── repositories/        # Datenzugriffsobjekte (zukünftig)
│   ├── types/               # TypeScript-Typdefinitionen
│   └── utils/               # Logger, XML, URI-Utilities
├── tests/
│   ├── unit/                # Unit Tests mit Jest
│   ├── integration/         # Integration Tests (echtes SAP oder Wiremock)
│   └── mocks/               # Mock-Responses (ADT XML-Fixtures)
├── docs/
│   ├── architecture.md      # Dieses Dokument
│   └── adt-endpoints.md     # ADT REST API Referenz
├── examples/                # Nutzungsbeispiele
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Abhängigkeiten

| Paket | Version | Zweck |
|-------|---------|-------|
| `@modelcontextprotocol/sdk` | ^1.x | MCP Server Framework |
| `axios` | ^1.x | HTTP Client |
| `zod` | ^3.x | Schema-Validierung |
| `fast-xml-parser` | ^4.x | XML-Parsing |
| `winston` | ^3.x | Structured Logging |
| `dotenv` | ^16.x | Environment-Konfiguration |

**Dev-Dependencies:**

| Paket | Zweck |
|-------|-------|
| `typescript` | TypeScript Compiler |
| `tsx` | TypeScript Runner (dev) |
| `jest` | Test Framework |
| `ts-jest` | TypeScript Jest Integration |
| `eslint` | Linting |
| `prettier` | Formatierung |
| `@types/node` | Node.js Typen |

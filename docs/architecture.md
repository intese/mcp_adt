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
│  │               Tool Registry (49 Tools)               │    │
│  │  repository | activation | syntax | transport |      │    │
│  │  package | analysis | atc | unittest | locks |       │    │
│  │  abap | cds | odata | table | transformations       │    │
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
│  │  - Transport: HTTP (axios) or RFC (Java/JCo bridge)    │  │
│  │  - Session management (stateful/stateless)             │  │
│  │  - CSRF token handling (auto-fetch + auto-retry)       │  │
│  │  - Cookie persistence (SAP_SESSION + MYSAPSSO2)        │  │
│  │  - Retry strategy (exponential backoff)                │  │
│  │  - TLS configuration (skip / CA bundle)                │  │
│  │  - Request/Response logging (sanitized)                │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS or RFC (SADT_REST_RFC_ENDPOINT)
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
| repository | 5 | Objekte suchen/lesen/schreiben/erzeugen/löschen |
| activation | 2 | Einzeln- und Massenaktivierung |
| syntax | 2 | Syntaxprüfung (Objekt + Quelltext) |
| transport | 4 | Aufträge auflisten/erzeugen/freigeben/löschen |
| package | 3 | Pakete auflisten/erzeugen/Inhalt lesen |
| analysis | 4 | Where-Used, Abhängigkeiten, Metadaten, Versionen |
| atc | 2 | ATC starten + Ergebnisse lesen |
| unittest | 2 | Unit Tests starten + Ergebnisse lesen |
| locks | 3 | Sperren setzen/lösen/Besitzer ermitteln |
| abap | 6 | Klassen (inkl. Test-Include), Interfaces, Reports, Funktionsgruppen/-bausteine |
| cds | 3 | CDS Views anlegen/analysieren |
| odata | 2 | Service Bindings veröffentlichen/zurückziehen |
| table | 3 | SQL-Datenvorschau; Tabellenfelder und -zeilen (RFC) |
| transformations | 8 | ST/XSLT anlegen, lesen und schreiben, XML-Hilfsfunktionen |

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
TransformationService — ST/XSLT-Verwaltung über ADT, Anlage mit RFC-Rückfall
RfcTransformationService — ST/XSLT über XSLT_MAINTENANCE_RFC
DependencyService   — Where-Used und Abhängigkeitsgraphen
TableService        — SQL-Abfragen über die ADT-Datenvorschau
RfcTableService     — Tabellenfelder/-zeilen über Funktionsbausteine (RFC)
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
                          (src inline or read from sourceFilePath)
3. adt_unlock_object    → LockService.releaseLock(uri, lockHandle)
4. adt_syntax_check     → SyntaxService.checkObject(uri)
5. adt_activate_object  → ActivationService   (erst nach dem Unlock)
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
  "message": "Object /sap/bc/adt/oo/classes/zmy_class is locked by user DEVUSER",
  "details": {
    "lockedBy": "DEVUSER",
    "lockTime": "2024-01-15T10:30:00Z",
    "objectUri": "/sap/bc/adt/oo/classes/zmy_class"
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

## Transport-Schicht (HTTP oder RFC)

`AdtHttpClient` spricht über das Interface `AdtTransport` (`src/adt/transport.ts`). Default ist `HttpTransport` (axios). Mit `SAP_TRANSPORT=rfc` wird stattdessen `RfcBridgeTransport` (`src/adt/rfcTransport.ts`) genutzt: ein Java-Subprozess (`bridge/AdtRfcBridge.java`, SAP JCo) ruft den Funktionsbaustein `SADT_REST_RFC_ENDPOINT` auf — derselbe Weg wie Eclipse-ADT über eine RFC-Destination, ohne HTTP-Port.

Vertrag des Bausteins (aus `com.sap.adt.communication` ausgelesen, im Betrieb gegen ein System mit SAP_BASIS 740 genutzt):
- Import `REQUEST`: `REQUEST_LINE{METHOD,URI,VERSION}`, `HEADER_FIELDS` (Tabelle `NAME`/`VALUE`), `MESSAGE_BODY` (Binär)
- Export `RESPONSE`: `STATUS_LINE{VERSION,STATUS_CODE,REASON_PHRASE}`, `HEADER_FIELDS`, `MESSAGE_BODY`
- `RFC_CALL`-Zeilenprotokoll: je Tabellenparameter wird pro Aufruf genau ein `JCoTable`-Handle verwendet (jedes Handle hat einen eigenen Zeilencursor)
- Prozessmodell: ein Bridge-Prozess, Start beim ersten Request; endet er, werden offene Requests mit `ADT_NETWORK_ERROR` abgewiesen und der nächste Request startet ihn neu (eine stateful Session samt Sperren geht dabei verloren)
- Preflight (`src/adt/rfcPreflight.ts`): Architektur von JVM und nativer JCo-Bibliothek müssen übereinstimmen
- Stateful-Session = `JCoContext.begin(destination)` (thread-/verbindungsgebunden); `Authorization`/`Cookie` entfallen (RFC-Logon).

Einrichtung (`.env`): `SAP_TRANSPORT=rfc`, `SAP_RFC_ASHOST`, `SAP_RFC_SYSNR`, optional `SAP_RFC_GWHOST`/`SAP_RFC_GWSERV`, `SAP_JCO_JAR` (Pfad zu `com.sap.conn.jco_*.jar`), `SAP_JCO_NATIVE_DIR` (Ordner mit `libsapjco3.dylib`), optional `SAP_JAVA_BIN`, `SAP_RFC_BRIDGE_CLASSES`. `SAP_CLIENT`/`SAP_USER`/`SAP_PASSWORD`/`SAP_LANGUAGE` gelten weiter. Brücke bauen: `SAP_JCO_JAR=… npm run build:bridge`. Die JCo-Dateien werden nicht ins Repo eingecheckt.

**Direkte Funktionsbaustein-Aufrufe (nur RFC-Transport):** Die Bridge kennt neben dem HTTP-Tunnel die Methode `RFC_CALL` (`AdtRfcBridge.callFunction`, Zeilenprotokoll in `src/adt/rfcCodec.ts`) und ruft damit beliebige Funktionsbausteine. Darauf setzen `adt_get_table_fields` (`DDIF_FIELDINFO_GET`) und `adt_read_table` (`RFC_READ_TABLE`, einzelne Tabelle, max. 512 Byte Zeilenbreite, WHERE in 72-Zeichen-Zeilen, Berechtigung `S_TABU_DIS`) auf (`RfcTableService`). Gedacht für Systeme, deren ADT-Backend `/ddic/*` und `/datapreview/*` nicht kennt (ältere ECC). Mit HTTP-Transport antworten sie mit `ADT_RFC_REQUIRED`. Der Filter `fields` von `adt_get_table_fields` ist noch nicht live verifiziert. Nach Änderungen an der Bridge `npm run build:bridge` ausführen und die Client-Session neu starten.

**Transformationen:** `RfcTransformationService` nutzt `XSLT_MAINTENANCE_RFC` (Operationen `SHOW`, `CREATE`, `MODIFY`, `MODI_ACT`). Der Baustein setzt beim Ändern alle Attribute neu, daher werden Paket, Autor, Sprache und Beschreibung vorher gelesen. Quellzeilen sind `CHAR255`. Ohne Transportauftrag würde SAP bei transportierbaren Paketen ein Popup öffnen, deshalb wird vorher abgelehnt. `O`-Zeilen im Protokoll liefern auch Strukturen und Einzelwerte; ABAP-Ausnahmen kommen mit Schlüssel, Meldungstext, Meldungsnummer und Variablen zurück (`ADT_ABAP_EXCEPTION`).

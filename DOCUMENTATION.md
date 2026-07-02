# SAP ADT MCP Server — Dokumentation

Ein produktionsreifer MCP-Server (Model Context Protocol), der MCP-kompatiblen Clients direkten Zugriff auf SAP ABAP-Entwicklungsobjekte über offizielle SAP ADT REST APIs gibt. Kein Eclipse, keine GUI-Automation.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#voraussetzungen)
2. [Installation](#installation)
3. [Konfiguration](#konfiguration)
4. [MCP-Server registrieren](#mcp-server-registrieren)
5. [Verfügbare Tools (42)](#verfügbare-tools)
6. [Typische Workflows](#typische-workflows)
7. [Fehlerbehandlung](#fehlerbehandlung)
8. [Bekannte Einschränkungen](#bekannte-einschränkungen)
9. [Entwicklung & Tests](#entwicklung--tests)
10. [Sicherheitshinweise](#sicherheitshinweise)

---

## Voraussetzungen

- Node.js 22 oder höher
- SAP-System mit ADT aktiviert (ECC 6.07+ oder S/4HANA 2020+)
- Benutzer mit `S_ADT_RES` und `S_DEVELOP`-Berechtigung
- Ein MCP-Client mit stdio-Unterstützung (CLI oder Desktop)

---

## Installation

```bash
git clone <repository-url>
cd MCP_ADT
npm install
npm run build
```

---

## Konfiguration

Erstelle eine `.env`-Datei im Projektverzeichnis (niemals ins Git einchecken):

```env
SAP_URL=https://<host>:<port>/
SAP_CLIENT=100
SAP_USER=DEINUSER
SAP_PASSWORD="dein!Passwort#2024"
SAP_LANGUAGE=DE
LOG_LEVEL=info
SAP_CA_BUNDLE=                    # optional: Pfad zu CA-Zertifikat
```

**Wichtig:** Passwörter mit Sonderzeichen (`%`, `;`, `>`, `(`, `)`, `]` etc.) müssen in doppelte Anführungszeichen gesetzt werden. dotenv parst das korrekt.

**Optionale Parameter:**

| Variable | Default | Beschreibung |
|---|---|---|
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |
| `SAP_TLS_VERIFY` | `true` | TLS-Zertifikat prüfen (`false` nur für Entwicklung) |
| `SAP_CA_BUNDLE` | — | Pfad zum CA-Bundle (PEM) für selbstsignierte Zertifikate |
| `SAP_REQUEST_TIMEOUT` | `30000` | HTTP-Timeout in Millisekunden |

---

## MCP-Server registrieren

```bash
# Einmalig registrieren (user scope — gilt für alle Sessions):
claude mcp add --scope user sap-adt -- node /pfad/zum/MCP_ADT/dist/index.js

# Status prüfen:
claude mcp list
# Ausgabe: sap-adt: node ... - ✓ Connected

# Nach Code-Änderungen:
npm run build
# Dann neue Client-Session öffnen (der Prozess wird automatisch neu gestartet)
```

Der Server startet als langlebiger stdio-Daemon und wird automatisch mit jeder neuen Client-Session gestartet.

---

## Verfügbare Tools

### Repository (7 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_read_object` | ABAP-Quelltext oder Metadaten lesen (Klassen, Reports, Includes, Interfaces, ...) |
| `adt_write_object` | Quelltext eines gesperrten Objekts schreiben |
| `adt_search_object` | Objekte nach Name suchen (Wildcard `*` unterstützt) |
| `adt_get_object_metadata` | Metadaten eines Objekts lesen (Typ, Paket, Verantwortlicher) |
| `adt_create_object` | Generisches ADT-Objekt anlegen |
| `adt_delete_object` | Objekt löschen (mit Lock) |
| `adt_compare_versions` | Zwei Versionen eines Objekts vergleichen |

**Klassen-Includes lesen** — `adt_read_object` mit `include`-Parameter:

| Wert | Liest |
|---|---|
| _(leer)_ | Hauptquelle (`source/main`) |
| `definitions` | Definitionsabschnitt |
| `implementations` | Implementierungsabschnitt |
| `macros` | Makros |
| `testclasses` oder `test` | Testklassen (lokale Klassen für Unit Tests) |

### Aktivierung (2 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_activate_object` | Einzelnes Objekt aktivieren |
| `adt_activate_mass` | Mehrere Objekte in einem Schritt aktivieren |

### Syntaxprüfung (2 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_syntax_check` | Gespeichertes Objekt auf Syntaxfehler prüfen |
| `adt_syntax_check_source` | Quelltext direkt prüfen (ohne Speichern) |

### Sperren (3 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_lock_object` | Exklusive Schreibsperre holen (gibt Lock-Handle zurück) |
| `adt_unlock_object` | Schreibsperre freigeben |
| `adt_get_lock_owner` | Aktuellen Sperr-Inhaber abfragen |

### Transport (4 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_list_transport_requests` | Offene Transportaufträge auflisten |
| `adt_create_transport_request` | Neuen Transportauftrag anlegen |
| `adt_release_transport_request` | Transportauftrag freigeben |
| `adt_delete_transport_request` | Transportauftrag löschen |

### Pakete (3 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_list_packages` | Pakete suchen |
| `adt_create_package` | Neues Paket anlegen |
| `adt_get_package_content` | Inhalt eines Pakets anzeigen |

### Analyse (4 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_where_used` | Verwendungsnachweis für ein Objekt |
| `adt_dependency_graph` | Abhängigkeitsgraph eines Objekts |
| `adt_get_object_metadata` | Detaillierte Objektmetadaten |
| `adt_compare_versions` | Versionsvergleich |

### ATC — ABAP Test Cockpit (2 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_run_atc` | ATC-Lauf starten |
| `adt_get_atc_result` | ATC-Ergebnisse abrufen |

### Unit Tests (2 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_run_unit_tests` | ABAP Unit Tests ausführen |
| `adt_get_unit_test_result` | Letztes Testergebnis abrufen |

`adt_run_unit_tests` probiert automatisch mehrere URI-Strategien aus (`oo-class` → `vit-class` → `vit-package`).

### ABAP-Objekte anlegen (8 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_create_class` | ABAP-Klasse anlegen |
| `adt_create_interface` | ABAP-Interface anlegen |
| `adt_create_report` | ABAP-Programm anlegen |
| `adt_create_function_group` | Funktionsgruppe anlegen |
| `adt_create_function_module` | Funktionsbaustein anlegen |
| `adt_create_cds_view` | CDS View anlegen |
| `adt_create_st` | Simple Transformation anlegen |
| `adt_create_xslt` | XSLT-Transformation anlegen |

### CDS (5 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_create_cds_view` | CDS View anlegen |
| `adt_analyze_cds` | CDS View analysieren |
| `adt_get_cds_dependencies` | Abhängigkeiten einer CDS View |
| `adt_publish_service_binding` | OData-Service Binding veröffentlichen |
| `adt_unpublish_service_binding` | OData-Service Binding zurückziehen |

### Transformationen / XML (6 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_create_st` | Simple Transformation anlegen |
| `adt_create_xslt` | XSLT anlegen |
| `adt_generate_st_from_xml` | ST aus XML-Muster generieren |
| `adt_validate_xml_against_xsd` | XML gegen XSD prüfen |
| `adt_analyze_xml_schema` | XML-Schema analysieren |
| `adt_compare_xml_structures` | Zwei XML-Strukturen vergleichen |

---

## Typische Workflows

### Quelltext lesen

```
adt_read_object
  objectUri: /sap/bc/adt/oo/classes/zcl_my_class
```

Für Testklassen:
```
adt_read_object
  objectUri: /sap/bc/adt/oo/classes/zcl_my_class
  include: testclasses
```

### Quelltext schreiben (vollständiger Workflow)

```
1. adt_lock_object      → liefert lockHandle + corrNr (Transport)
2. adt_write_object     → schreibt Quelltext (lockHandle + corrNr erforderlich)
3. adt_unlock_object    → gibt Sperre frei
4. adt_syntax_check     → prüft auf Fehler
5. adt_activate_object  → aktiviert das Objekt
```

**Wichtig:** Aktivierung erst nach Freigabe der Sperre aufrufen — SAP ENQUEUE-Lock muss frei sein.

### Objekt suchen

```
adt_search_object
  query: ZCL_API_*
  type: CLAS/OC          # optional: Typ-Filter
  maxResults: 20
```

### Unit Tests ausführen

```
adt_run_unit_tests
  objectUri: /sap/bc/adt/oo/classes/zcl_my_class
  objectName: ZCL_MY_CLASS
```

Ergebnis:
```json
{
  "status": "passed",
  "programs": [{
    "name": "ZCL_MY_CLASS",
    "testClasses": [
      { "name": "LTC_MY_TESTS", "methods": [...] }
    ]
  }],
  "summary": { "total": 10, "passed": 10, "failed": 0, "errors": 0 }
}
```

Status-Werte: `passed` | `failed` | `no_tests_selected`

### ATC-Prüfung

```
1. adt_run_atc
     objectUri: /sap/bc/adt/oo/classes/zcl_my_class
   → liefert runId

2. adt_get_atc_result
     runId: <runId aus Schritt 1>
   → liefert Findings mit Priorität, Kategorie, Zeilenangabe
```

---

## Fehlerbehandlung

Alle Tools geben bei Fehlern ein einheitliches Format zurück:

```json
{
  "success": false,
  "errorCode": "ADT_LOCK_CONFLICT",
  "message": "Object is locked by user DEVUSER",
  "details": { "lockedBy": "DEVUSER" }
}
```

### Fehlercodes

| Code | Bedeutung | Lösung |
|---|---|---|
| `ADT_AUTHENTICATION_ERROR` | Ungültige Credentials oder gesperrter User | `.env` prüfen, Passwort erneuern |
| `ADT_NOT_FOUND` | Objekt existiert nicht | URI/Name prüfen |
| `ADT_LOCK_CONFLICT` | Objekt von anderem User gesperrt | `adt_get_lock_owner` aufrufen; in SM12 freigeben |
| `ADT_CSRF_ERROR` | CSRF-Token abgelaufen | Automatisch behoben durch Re-Login |
| `ADT_TRANSPORT_ERROR` | Kein aktiver Transport | Transportauftrag anlegen oder angeben |
| `ADT_PERMISSION_DENIED` | Fehlende Berechtigung | SAP-Berechtigungen prüfen (`S_DEVELOP`, `S_ADT_RES`) |
| `ADT_TIMEOUT` | Anfrage zu langsam | `SAP_REQUEST_TIMEOUT` erhöhen |

### Verwaiste Sperren (ENQUEUE-Locks)

Wenn eine Session abbricht während ein Lock aktiv ist, bleibt der ENQUEUE-Lock in SAP. Lösung:

1. Transaktion **SM12** aufrufen
2. User oder Objekt suchen
3. Lock löschen

---

## Bekannte Einschränkungen

### SAP RISE / Cloud

- nginx-WAF vor SAP ICM: Der Server sendet `User-Agent: ABAP Development Tools` — ohne diesen Header werden Requests mit HTTP 403 blockiert (bereits implementiert).
- Unit-Test-Ergebnisse: Auf manchen RISE-Systemen gibt `POST /sap/bc/adt/abapunit/testruns` ein leeres Ergebnis zurück, obwohl Tests existieren. Der Server probiert automatisch drei URI-Strategien (`oo-class`, `vit-class`, `vit-package`).

### Klassen-URI-Format

SAP ADT verwendet `/sap/bc/adt/oo/classes/{name}` für Klassen (nicht `/sap/bc/adt/classes/classes/{name}`). Der Server verwendet intern die korrekte URI, die von `adt_search_object` zurückgegeben wird.

### Aktivierung nach Unlock

SAP erfordert, dass die Schreibsperre (ENQUEUE-Lock) freigegeben ist, bevor ein Objekt aktiviert werden kann. Der korrekte Workflow ist immer: Unlock → Syntaxcheck → Aktivierung.

---

## Entwicklung & Tests

```bash
# TypeScript kompilieren
npm run build

# Unit Tests (45 Tests)
npm test

# Nur Unit Tests
npm run test:unit

# TypeScript prüfen ohne Build
npm run typecheck

# Lint
npm run lint

# Entwicklungsmodus (kein Build nötig)
npm run dev
```

### Neue Tools hinzufügen

1. Tool-Handler anlegen: `src/tools/{gruppe}/{name}.ts`
2. Zod-Schema definieren und `ToolDefinition<typeof schema>` exportieren
3. In `src/tools/registry.ts` mit `asTool()` registrieren
4. `npm run build` → neue Client-Session öffnen

### Projektstruktur

```
src/
  adt/          # HTTP-Schicht: client.ts, session.ts, errors.ts
  config/       # Zod-Konfiguration aus .env
  services/     # Business Logic (ObjectService, UnitTestService, ...)
  tools/        # MCP-Tool-Handler, gruppiert nach Domäne
  types/        # TypeScript-Typen
  utils/        # logger.ts, xml.ts, uri.ts
tests/
  unit/         # Jest Unit Tests
  mocks/        # SAP XML-Fixtures
docs/
  architecture.md    # Technische Architektur
  adt-endpoints.md   # ADT REST API Referenz
```

---

## Sicherheitshinweise

- **Credentials:** `.env` niemals ins Git einchecken. Die `.gitignore` schließt `.env*` aus.
- **Logging:** Passwörter, Cookies und CSRF-Token werden niemals geloggt (durchgesetzt via `SENSITIVE_HEADERS` in `src/utils/logger.ts`).
- **TLS:** Standardmäßig aktiv (`SAP_TLS_VERIFY=true`). Nur für Entwicklungsumgebungen mit selbstsignierten Zertifikaten deaktivieren — nie in Produktion.
- **Berechtigungen:** Der SAP-Benutzer sollte nur die minimal notwendigen Berechtigungen haben (`S_ADT_RES`, `S_DEVELOP` mit eingeschränkten Objekttypen).
- **CSRF-Schutz:** Alle schreibenden Requests (POST, PUT, DELETE) verwenden automatisch einen CSRF-Token. Bei Token-Ablauf wird automatisch neu eingeloggt.

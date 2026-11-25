# SAP ADT MCP Server — Dokumentation

Ein produktionsreifer MCP-Server (Model Context Protocol), der MCP-kompatiblen Clients direkten Zugriff auf SAP ABAP-Entwicklungsobjekte über offizielle SAP ADT REST APIs gibt. Kein Eclipse, keine GUI-Automation.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#voraussetzungen)
2. [Installation](#installation)
3. [Konfiguration](#konfiguration)
4. [MCP-Server registrieren](#mcp-server-registrieren)
5. [Verfügbare Tools (47)](#verfügbare-tools)
6. [Typische Workflows](#typische-workflows)
7. [Fehlerbehandlung](#fehlerbehandlung)
8. [Bekannte Einschränkungen](#bekannte-einschränkungen)
9. [Entwicklung & Tests](#entwicklung--tests)
10. [Sicherheitshinweise](#sicherheitshinweise)

---

## Voraussetzungen

- Node.js 22 oder höher
- SAP-System mit ADT aktiviert (ECC 6.07+ oder S/4HANA 2020+); Zugriff per HTTPS oder [RFC](#transport-über-rfc-statt-http-optional)
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
| `REQUEST_TIMEOUT` | `60000` | Request-Timeout in Millisekunden (HTTP und RFC) |

### Transport über RFC statt HTTP (optional)

Ist kein HTTP-Port zum SAP-System freigegeben, aber Eclipse-ADT erreicht es über eine RFC-Destination (Dispatcher/Gateway), kann der Server die ADT-REST-Requests stattdessen über den Funktionsbaustein `SADT_REST_RFC_ENDPOINT` senden. Dazu startet er eine kleine Java-Brücke (`bridge/AdtRfcBridge.java`, SAP JCo) als Subprozess. Die Tools bleiben dieselben; die beiden Tabellen-Tools (siehe unten) funktionieren nur in diesem Modus.

**Voraussetzungen:** Java ab 21 (JDK mit `javac`; die Brücke wird mit `--release 21` gebaut; die JVM-Architektur muss zur nativen JCo-Bibliothek passen, z. B. arm64-JVM für `macosx.aarch64` — sonst `SAP_JAVA_BIN` setzen, der Start bricht bei Abweichung mit klarer Meldung ab), SAP JCo (`com.sap.conn.jco_*.jar` plus native Bibliothek `libsapjco3.*`, z. B. aus dem Eclipse-p2-Pool `~/.p2/pool/plugins/` — die Dateien werden nicht ins Repo eingecheckt).

```bash
# Brücke einmalig bauen
SAP_JCO_JAR=/pfad/zu/com.sap.conn.jco_3.1.13.jar npm run build:bridge
npm run build
# Native Bibliothek bereitstellen (macOS arm64, Beispiel)
mkdir -p ~/jco-native
unzip -j -o ~/.p2/pool/plugins/com.sap.conn.jco.macosx.aarch64_3.1.13.jar lib/libsapjco3.dylib -d ~/jco-native
```

```env
SAP_TRANSPORT=rfc
SAP_RFC_ASHOST=127.0.0.1          # Application-Server bzw. Dispatcher-Host
SAP_RFC_SYSNR=00                  # Systemnummer
SAP_JCO_JAR=/abs/pfad/com.sap.conn.jco_3.1.13.jar
SAP_JCO_NATIVE_DIR=/abs/pfad/jco-native
# optional: SAP_RFC_GWHOST, SAP_RFC_GWSERV, SAP_JAVA_BIN, SAP_RFC_BRIDGE_CLASSES
SAP_CLIENT=100
SAP_USER=DEINUSER
SAP_PASSWORD="..."
SAP_LANGUAGE=DE
```

| Variable | Default | Beschreibung |
|---|---|---|
| `SAP_TRANSPORT` | `http` | `http` (axios) oder `rfc` (Java/JCo-Brücke) |
| `SAP_RFC_ASHOST` / `SAP_RFC_SYSNR` | — | Pflicht bei `rfc` |
| `SAP_RFC_GWHOST` / `SAP_RFC_GWSERV` | — | Optional, Gateway abweichend vom Dispatcher |
| `SAP_JCO_JAR` / `SAP_JCO_NATIVE_DIR` | — | Pflicht bei `rfc`: JCo-Jar bzw. Ordner mit `libsapjco3.*` |
| `SAP_JAVA_BIN` | `java` | Java-Executable |
| `SAP_RFC_BRIDGE_CLASSES` | `dist/bridge` | Ordner mit der kompilierten Brücke |

**Verhalten im rfc-Modus:** `SAP_URL` wird ignoriert. Ist `SAP_TRANSPORT=rfc` bereits in der Umgebung des startenden Projekts gesetzt, wird die `.env` des Installationsverzeichnisses **nicht** geladen, damit keine Einstellungen eines anderen Systems einspringen. Fehlen Brücke, JCo-Jar oder native Bibliothek, bricht der Start mit einer klaren Meldung ab — es gibt keinen stillen Fallback auf HTTP. Anmeldung erfolgt per RFC-Logon (kein Basic-Auth/Cookie/CSRF-Handling auf HTTP-Ebene). Details: `docs/architecture.md`, Abschnitt „Transport-Schicht".

#### Tabellen-Tools (nur RFC)

| Tool | Funktionsbaustein | Hinweise |
|---|---|---|
| `adt_get_table_fields` | `DDIF_FIELDINFO_GET` | Optionaler Filter `fields`; unbekannte Namen stehen in `unknownFields` |
| `adt_read_table` | `RFC_READ_TABLE` | Eine Tabelle, keine Joins, max. 512 Byte je Zeile (bei breiten Tabellen `fields` angeben), max. 1000 Zeilen je Aufruf (`skipRows` zum Blättern), Berechtigung `S_TABU_DIS` |

`where` ist eine Open-SQL-Bedingung ohne das Wort `WHERE`. Sie wird nur an Leerzeichen außerhalb von Literalen in 72-Zeichen-Zeilen umbrochen; längere Einzel-Token und nicht geschlossene Hochkommas werden abgelehnt. Alle Werte kommen als Zeichenketten im internen Format zurück. Mit HTTP-Transport antworten beide Tools mit `ADT_RFC_REQUIRED`.

#### Ältere Releases (SAP_BASIS 740)

- Anlage von Objekten benötigt ggf. einen Entwicklerschlüssel (SSCR); ohne ihn kommen Meldungen wie „Objektkatalogeintrag … existiert nicht".
- Keine ADT-Datenvorschau (`adt_run_sql_query`) und kein `/ddic/tables`: Tabellen-Tools verwenden.
- Kein ADT-Endpunkt für Simple Transformations / XSLT: SE80/STRANS oder abapGit.
- `adt_syntax_check_source` benötigt ein existierendes Objekt als `contextUri`.

#### Fehlersuche

| Symptom | Ursache / Lösung |
|---|---|
| `404` bei einem Tabellen-Tool | Veraltete Brücken-Klasse: `npm run build:bridge`, dann neue Client-Session |
| `RFC bridge exited` | JCo-Pfade und Java-Version prüfen; `LOG_LEVEL=debug` zeigt die Ausgabe der Brücke |
| „SAP_JAVA_BIN … is a JVM for …" | JVM mit passender Architektur verwenden |

---

## MCP-Server registrieren

```bash
# Einmalig registrieren (user scope — gilt für alle Projekte;
# je Projekt/System: --scope local und Variablen mit -e KEY=wert):
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

### Repository (5 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_search_object` | Objekte nach Name suchen (Wildcard `*` unterstützt) |
| `adt_read_object` | ABAP-Quelltext lesen (Klassen, Reports, Includes, Interfaces, ...) |
| `adt_write_object` | Quelltext eines gesperrten Objekts schreiben (`source` oder `sourceFilePath` für große Quellen) |
| `adt_create_object` | Generisches Objekt anlegen (`CLAS/OC`, `INTF/OI`, `PROG/P`, `FUGR/F`, `DDLS/DF`, `BDEF/BDO`) |
| `adt_delete_object` | Objekt löschen (mit Lock) |

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

### ABAP-Objekte anlegen (6 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_create_class` | ABAP-Klasse anlegen |
| `adt_create_test_include` | Testklassen-Include einer bestehenden Klasse anlegen |
| `adt_create_interface` | ABAP-Interface anlegen |
| `adt_create_report` | ABAP-Programm anlegen |
| `adt_create_function_group` | Funktionsgruppe anlegen |
| `adt_create_function_module` | Funktionsbaustein anlegen |

### CDS und OData (5 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_create_cds_view` | CDS View anlegen |
| `adt_analyze_cds` | CDS View analysieren |
| `adt_get_cds_dependencies` | Abhängigkeiten einer CDS View |
| `adt_publish_service_binding` | OData-Service-Binding veröffentlichen |
| `adt_unpublish_service_binding` | OData-Service-Binding zurückziehen |

### Tabellendaten (3 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_run_sql_query` | Lesendes Open-SQL-`SELECT` über die ADT-Datenvorschau |
| `adt_get_table_fields` | Felder einer Tabelle/Struktur/View (nur RFC) |
| `adt_read_table` | Zeilen einer Tabelle (nur RFC) |

### Transformationen / XML (6 Tools)

| Tool | Beschreibung |
|---|---|
| `adt_create_st` | Simple Transformation anlegen (derzeit defekt, siehe Einschränkungen) |
| `adt_create_xslt` | XSLT anlegen (derzeit defekt, siehe Einschränkungen) |
| `adt_generate_st_from_xml` | ST aus XML-Muster generieren |
| `adt_validate_xml_against_xsd` | XML gegen XSD prüfen (Stub) |
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
2. adt_write_object     → schreibt Quelltext (lockHandle, bei transportierbaren Objekten transportNumber)
3. adt_unlock_object    → gibt Sperre frei
4. adt_syntax_check     → prüft auf Fehler
5. adt_activate_object  → aktiviert das Objekt
```

**Wichtig:** Aktivierung erst nach Freigabe der Sperre aufrufen — SAP ENQUEUE-Lock muss frei sein.

### Objekt suchen

```
adt_search_object
  query: ZCL_API_*
  objectType: CLAS/OC    # optional: Typ-Filter
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

Status-Werte: `passed` | `failed` | `no_tests_selected` | `error` (Antwort nicht lesbar)

### ATC-Prüfung

```
1. adt_run_atc
     objects: [{ "uri": "/sap/bc/adt/oo/classes/zcl_my_class", "name": "ZCL_MY_CLASS" }]
   → liefert Findings und die Worklist-ID

2. adt_get_atc_result      # optional: Ergebnis erneut abrufen
     worklistId: <ID aus Schritt 1>
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
| `ADT_AUTH_FAILED` | Ungültige Credentials oder gesperrter User | `.env` prüfen, Passwort erneuern |
| `ADT_NOT_FOUND` | Objekt existiert nicht | URI/Name prüfen |
| `ADT_LOCK_CONFLICT` | Objekt von anderem User gesperrt | `adt_get_lock_owner` aufrufen; in SM12 freigeben |
| `ADT_CSRF_INVALID` | CSRF-Token abgelaufen | Automatisch behoben durch Re-Login |
| `ADT_TRANSPORT_ERROR` | Kein aktiver Transport | Transportauftrag anlegen oder angeben |
| `ADT_PERMISSION_DENIED` | Fehlende Berechtigung | SAP-Berechtigungen prüfen (`S_DEVELOP`, `S_ADT_RES`) |
| `ADT_TIMEOUT` | Anfrage zu langsam | `REQUEST_TIMEOUT` erhöhen (oder `timeoutMs` bei Aktivierung/Unit-Tests) |
| `ADT_NOT_ACCEPTABLE` | SAP lehnt den Content-Type ab | Als Fehler melden |
| `ADT_RFC_REQUIRED` | Tool braucht RFC-Transport | `SAP_TRANSPORT=rfc` |
| `ADT_NETWORK_ERROR` | Verbindung oder RFC-Brücke gescheitert | Netz bzw. JCo-Konfiguration prüfen |

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

### Nicht unterstützt / defekt

- `BDEF/BDO`: Anlegen und Schreiben funktionieren, die Aktivierung schlägt fehl
- `adt_create_st` / `adt_create_xslt`: Anlage scheitert mit `ADT_NOT_FOUND`
- Datenbanktabellen können nicht angelegt werden
- XML-Validierung gegen XSD ist ein Stub

### Aktivierung nach Unlock

SAP erfordert, dass die Schreibsperre (ENQUEUE-Lock) freigegeben ist, bevor ein Objekt aktiviert werden kann. Der korrekte Workflow ist immer: Unlock → Syntaxcheck → Aktivierung.

---

## Entwicklung & Tests

```bash
# TypeScript kompilieren
npm run build

# Unit Tests
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

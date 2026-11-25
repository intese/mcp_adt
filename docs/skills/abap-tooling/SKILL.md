---
name: abap-tooling
description: >
  Strategie und bewährte Muster für ABAP-Objekte über den sap-adt-MCP-Server
  im Editor. Nutze diesen Skill IMMER bei ABAP-Arbeit über die MCP-Tools:
  Objekte lesen/schreiben/aktivieren, Syntaxprüfung, Unit-Tests, Transportverwaltung,
  besonders wenn eine ADT-Operation scheitert, leere Fehlertexte liefert oder ein
  Session-Timeout auftritt, sowie beim Anlegen lokaler Klassen/Interfaces in globalen
  Klassen. Trigger: "abap aktivieren", "adt fehler", "aktivierung wurde abgebrochen",
  "syntaxcheck ok aber aktivierung schlägt fehl", "lokale klasse/interface", "unit test
  wird nicht gefunden", "ADT_LOCK_CONFLICT", "Session Timed Out".
---

# ABAP-Tooling: ausschließlich sap-adt

Diese Regeln beruhen auf realer Fehlersuche an SAP-Systemen. Sie gelten generell für
ABAP-Arbeit über den `mcp__sap-adt__*`-MCP-Server und lassen sich auch von kleineren
Modellen Schritt für Schritt befolgen.

## Coding-Konvention (Beispiel — an die eigenen Team-Regeln anpassen)

- **ABAP-Code immer komplett Lower Case** schreiben — sowohl Keywords (`class`,
  `method`, `if`, `data`, `call function` …) als auch Identifier. Ausnahme:
  CamelCase-Bezeichner, die aus Fremdquellen stammen (z. B. JSON-Feldnamen),
  bleiben erhalten ("Keep Camel Case Identifiers"). Dies entspricht der
  eingestellten ABAP-Formatter-Konvention.
- **Keine Namen, Datums-Absprachen, Tickets oder Doku-/Plan-Verweise in
  Quellcode-Kommentaren.** Die fachliche Begründung (das WARUM) gehört in den
  Kommentar, aber zeitlos und in sich abgeschlossen — ohne Bezug auf wann/wer/wo
  das entschieden wurde. Solche Kontextinformationen gehören in Commit-Messages,
  PR-Beschreibungen oder Projekt-Doku, nicht in den Code selbst.

## Grundregel: ausschließlich `mcp__sap-adt__*`

1. Für alle ABAP-Operationen (lesen, schreiben, syntax_check, aktivieren, unit
   tests, Transport, ATC) ausschließlich `mcp__sap-adt__*` verwenden. Kein
   Fallback auf einen anderen MCP-Server.
2. Das Zielsystem ergibt sich aus der Server-Registrierung des Projekts — die
   Tools haben keinen System-Parameter. Nach einem Update/Build des Servers wirkt
   die neue Version erst in einer neuen Session (bzw. nach MCP-Reconnect).
3. **Bei einem Problem** (Operation scheitert, leere Fehlertexte, unerwartetes
   Verhalten, `400 Session Timed Out`):
   1. Denselben Aufruf zunächst erneut versuchen (viele Fehler sind transient).
   2. Bleibt das Problem: **diesen Skill konsultieren**, ob die eigene Nutzung
      grundsätzlich korrekt/vorgesehen ist (richtiger `include`-Typ, richtige
      URI, Lock/Transport beachtet, richtiger `version`-Parameter etc.).
   3. Liegt kein Bedienfehler vor und das Tool verhält sich trotzdem falsch
      (Fehler ohne Text, widersprüchliches Ergebnis, Aktivierung erfolgreich
      trotz echtem Syntaxfehler o. ä.) → **das ist ein echter Bug**. Dem User
      melden UND parallel in einer Datei `sap-adt-bugs.md` im aktuellen
      Projektverzeichnis vermerken (Datum, Tool/Aufruf, erwartetes vs.
      tatsächliches Verhalten, Reproduktionsschritte). Nicht selbst improvisieren
      oder einen Workaround erfinden, der das Problem nur verschleiert.

## Tool-Schemas vor dem ersten Aufruf laden

Die `mcp__sap-adt__*`-Tools können als *deferred* bereitgestellt sein (nur Name
bekannt, kein Parameter-Schema). Dann **vor dem ersten Aufruf** das Schema per
`ToolSearch` mit `select:<tool>[,<tool>…]` laden und Parameternamen nie raten.
Geratene Aufrufe enden mit `INVALID_INPUT` (Bedienfehler, kein MCP-Bug). Zu
Beginn der ABAP-Arbeit alle benötigten Tools gesammelt laden (lock, write_object,
unlock, activate_mass, syntax_check, run_unit_tests).

Häufige Stolperfallen:
- `adt_lock_object` / `adt_unlock_object` / `adt_write_object`: Parameter heißt
  `objectUri` (nicht `objectUrl`).
- `adt_run_unit_tests`: `objectUri` **und** `objectName` sind Pflicht.
- `adt_activate_mass`: `objects` als Liste von `{name, uri}`.
- `adt_create_transport_request`: `description` **und** `packageName` sind Pflicht.
- `adt_delete_object` braucht wie `adt_write_object` ein `lockHandle`.

## Große Quellen

`adt_write_object` nimmt entweder `source` (inline) **oder** `sourceFilePath`
(absoluter lokaler Pfad, max. 10 MB, keine `.env`) — genau eines von beiden. Ab ca.
100 KB immer `sourceFilePath`, sonst bricht der Tool-Aufruf am Output-Limit ab.
Der Datei-Inhalt ersetzt das ganze Include.

## Klassen-Includes schreiben (`adt_write_object`)

- `include`-Enum ist `main | definitions | implementations | macros | test`
  (**kein** `testclasses`). Testklassen → `test`.
- Include-Mapping: `definitions` = CCDEF ("Class-relevant Local Types"),
  `implementations` = CCIMP ("Local Types"), `test` = CCAU (Unit-Tests), `main` =
  globale Klasse (Definition **und** Implementierung zusammen).
- **SAP-Vorgabe für lokale Interfaces/Klassen in einer globalen Klasse:** Die
  **Definitionen** (INTERFACE …, CLASS … DEFINITION) gehören in `definitions`
  (CCDEF, "Class-relevant Local Types"), die **Implementierungen**
  (CLASS … IMPLEMENTATION) in `implementations` (CCIMP, "Local Types"). Diese
  Trennung aktiviert sauber und ist über `adt_read_object`/`adt_write_object` mit
  `include=definitions|implementations` voll les- und schreibbar. NICHT alles
  gemeinsam in `implementations` ablegen.
- **Testklassen-Include fehlt noch** (Schreiben scheitert mit „keine inaktive
  Fassung" bzw. `ADT_NOT_FOUND`): zuerst `adt_create_test_include`
  (`className`, ggf. `transportNumber`; sperrt und entsperrt selbst — also ohne
  eigenen Lock aufrufen). Bei neuen Klassen alternativ `adt_create_class` mit
  `generateTestClass: true`.
- Sub-Include-Schreibzugriffe auf transportierbare Objekte brauchen
  `transportNumber`, sonst `ADT_LOCK_CONFLICT`.
  Die Transportnummer kommt als `corrNr` aus `adt_lock_object`.
- Ablauf je Objekt: `adt_lock_object` → `adt_write_object` (alle Includes, mit
  transportNumber) → `adt_syntax_check` → `adt_unlock_object` → aktivieren.

## Aktivieren als EINE Einheit

- Klasse mit geänderten Sub-Includes: alle betroffenen Sub-Include-URIs **plus** die
  Klasse in EINEM `adt_activate_mass`-Aufruf angeben, sonst wird `main` gegen die
  **alten aktiven** Versionen der anderen Includes kompiliert (führt zu „Typ
  unbekannt"). URIs:
  - `/sap/bc/adt/oo/classes/<name>/includes/definitions`
  - `/sap/bc/adt/oo/classes/<name>/includes/implementations`
  - `/sap/bc/adt/oo/classes/<name>/includes/testclasses`
  - `/sap/bc/adt/oo/classes/<name>` (main)
- Bei `400 Session Timed Out` einfach denselben Aufruf erneut absetzen (transient).
- Aktivierungsmeldungen enthalten den SAP-Text. Steht dort `[SAP sent no message
  text; raw node: …]` (oder ein leerer Text), das als Tool-Bug melden. Zur Diagnose:
  `adt_syntax_check` mit `version: "inactive"` (Default, siehe unten) auf den
  geänderten Includes ausführen, danach `adt_run_unit_tests` als Tatsachenbeweis
  (grün = wirklich aktiv und korrekt). Bleibt der Widerspruch (z. B. `success:
  false` trotz sauberem Syntaxcheck und grünen Tests), siehe Bug-Meldeprozess oben.

- Lange Läufe (`adt_activate_mass`, `adt_run_unit_tests`): `timeoutMs` setzen.

## Prüfergebnisse richtig lesen

- Syntaxcheck ist nur dann "sauber", wenn keine Funde vorliegen **und**
  `reports[].status` = `processed` ist.
- `adt_syntax_check_source` prüft ungespeicherten Quelltext gegen ein
  **existierendes** Objekt (`contextUri`).
- Unit-Tests: nur `status: passed` mit `summary.total > 0` ist grün.
  `no_tests_selected` und `error` sind **kein** Erfolg. Manche Systeme liefern
  immer ein leeres Ergebnis — dann dem User sagen, dass nicht getestet wurde.

## Tabellen und Daten

- Neuere Systeme: `adt_run_sql_query` (ein Open-SQL-`SELECT`, ohne `;`).
- Bei `SAP_TRANSPORT=rfc`, v. a. ältere ECC ohne `/datapreview` und `/ddic/tables`:
  `adt_get_table_fields` (Struktur; bei großen Tabellen `fields` angeben) und
  `adt_read_table` (eine Tabelle, keine Joins, max. 512 Byte je Zeile → `fields`
  angeben; `where` ohne das Wort `WHERE`; max. 1000 Zeilen, `skipRows`).
  `ADT_RFC_REQUIRED` = Projekt läuft über HTTP(S), dort `adt_run_sql_query` nutzen.
  `404` bei diesen Tools = Server-Bridge veraltet (User: `npm run build:bridge`,
  neue Session).

## Bekannte Grenzen (nicht herumprobieren, dem User sagen)

- Behavior Definition (`BDEF/BDO`): Anlegen/Schreiben geht, Aktivierung schlägt
  fehl → in Eclipse aktivieren.
- `adt_create_st`/`adt_create_xslt` scheitern (`ADT_NOT_FOUND`) → in SE80/STRANS
  oder Eclipse anlegen.
- Datenbanktabellen und Event Bindings lassen sich nicht anlegen.
- ECC / SAP_BASIS 740: Meldung „Objektkatalogeintrag … existiert nicht" oder
  „Fehlende Entwicklerlizenz" beim Anlegen → wahrscheinlich fehlt der
  Entwicklerschlüssel (SSCR) des Users; kein Tool-Bug.
- Verwaiste Sperre nach abgebrochener Session: nur SM12 oder Timeout.
- `ADT_LOCK_CONFLICT` nennt den Sperrinhaber (`details.lockedBy`) — auch der
  eigene User aus einer anderen Session. Abfragen ohne Sperrversuch:
  `adt_get_lock_owner` (nicht `adt_get_object_metadata`, dort steht kein
  Sperrstatus).

## Clean-Code-Muster für lokal testbare Klassen

Wenn eine globale Klasse testbar und schlank sein soll:

- Globale Klasse **nur delegieren** lassen: `INTERFACES zif_…` + eine Methode, die an
  eine lokale Logikklasse delegiert (`rt = NEW lcl_worker( )->do( … ).`).
- Lokales Interface (Test-Seam) + produktive lokale Klasse + lokale Logikklasse:
  **Definitionen in `definitions` (CCDEF), Implementierungen in `implementations`
  (CCIMP)** (SAP-Vorgabe, siehe oben). Konstruktor-Injektion des Interfaces für DI.
- Unit-Tests in `test` (CCAU): lokale Logikklasse instanziieren und ein lokales
  Test-Double (implementiert das lokale Interface) injizieren. Kein echter FuBa.
- **Wichtig:** Die globale Klassen*definition* (`main`, DEFINITION-Teil) sollte **keinen
  lokalen Typ** als Attribut-/Parametertyp referenzieren — das war in der Praxis nicht
  zuverlässig aktivierbar. Deshalb delegiert die globale Klasse nur; lokale Typen
  werden ausschließlich in der globalen *Implementation* und in CCAU verwendet.

## ABAP-Fallen, die der Syntaxcheck verschweigt (erst bei Aktivierung sichtbar)

- Eine Methode mit `CHANGING`-Parameter darf **nicht** als Funktion in einem Ausdruck
  wie `IF meth( … CHANGING … ) = abap_true.` aufgerufen werden. Als Statement
  aufrufen (z. B. `CHANGING cv_flag = …`) und das Flag akkumulieren.
- `CHECK` außerhalb einer Schleife (LOOP/DO/WHILE) ist in **Methoden nicht erlaubt**
  — die Äquivalenz „`CHECK` außerhalb einer Schleife = `RETURN`" gilt nur in
  obsoleten FORM-Routinen, nicht in ABAP-OO-Methoden. In Methoden immer
  `IF ... RETURN. ENDIF.` verwenden.
- `BAPIPAKEY`-Personalnummer heißt `employeeno` (nicht `pernr`).
- `PSPAR-ACTIO` ist länger als ein `'INS'`-Literal-Typ: Zielvariable als
  `DATA lv_op TYPE pspar-actio VALUE 'INS'.` deklarieren.
- `PERSG` (Mitarbeitergruppe) ist CHAR1 — ein zweistelliger Fixwert wie `'01'` passt
  nicht.
- `adt_syntax_check` == "ok" heißt NICHT "aktivierbar": nach dem Syntaxcheck IMMER
  aktivieren und zusätzlich `adt_run_unit_tests` als Nachweis laufen lassen.
- **`adt_syntax_check`-Parameter `version` genau beachten:** `version: "active"` prüft
  die **zuletzt aktivierte** Quelle, **nicht** den aktuellen Bearbeitungs-/Schreibstand.
  Nach `adt_write_object` (vor dem Aktivieren) IMMER `version: "inactive"` (Default)
  verwenden — mit `"active"` bleibt ein frisch eingebauter Fehler unsichtbar, weil die
  alte (unveränderte) aktive Version geprüft wird, nicht die neuen Edits. Ein sauberes
  Ergebnis mit `version: "active"` sagt nichts über die Aktivierbarkeit der aktuellen
  Edits aus.
- **Inline-generischer Typ mit Längenangabe (`TYPE C LENGTH n` o. ä.) als
  Methodenparameter** (z. B. `importing iv_x type c length 3`) in einer lokalen
  Klasse im `definitions`-Include (CCDEF): schreibt/prüft sich fehlerfrei, aktiviert
  aber **konsistent nicht** — Aktivierung bricht mit einer kryptischen, in T100 nicht
  auffindbaren Meldung ab (z. B. „'3' konnte nicht interpretiert werden. Mögliche
  Fehlerursachen: Falsche Schreibweise oder Kommafehler.", begleitet von „Aktivierung
  wurde abgebrochen … (EU 202)"). Das ist kein leerer Meldungstext und kein Tool-Bug
  im MCP-Server (der Text kommt unverändert von SAP) — bei Aktivierungsabbrüchen mit
  dieser Art Meldung ("konnte nicht interpretiert werden", Zahl in Anführungszeichen)
  zuerst auf genau dieses Muster prüfen. Fix: immer einen benannten `TYPES`-Alias
  deklarieren und referenzieren (`types ty_x type c length 3.` +
  `importing iv_x type ty_x`) statt des inline-generischen Typs im Parameter.
- **Vorwärtsreferenz auf einen `PRIVATE`-`TYPES`-Alias aus einer Methode, die
  textuell in der `PUBLIC SECTION` vor der `PRIVATE SECTION` steht:** aktiviert
  nicht (Meldung „Der Typ '<NAME>' ist unbekannt.") — der Syntaxcheck zeigt das
  **nicht** an. `adt_syntax_check` prüft klasseninterne Vorwärtsreferenzen also
  nicht zuverlässig; das ist eine reale ABAP-Regel (Typen müssen vor ihrer
  Verwendung bekannt sein), kein Tool-Bug. Bei „Typ unbekannt" trotz sauberem
  Syntaxcheck: Reihenfolge der Sections/Typdeklarationen innerhalb der Klasse
  prüfen, nicht nur den referenzierten Typnamen selbst.

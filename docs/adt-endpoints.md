# SAP ADT REST API — Endpoint-Referenz

Alle relevanten ADT-Endpoints für den `sap-adt-mcp-server`.

Basis-URL: `{SAP_URL}/sap/bc/adt`

Pflicht-Header für alle Requests:
```
Accept-Language: {SAP_LANGUAGE}
sap-client: {SAP_CLIENT}
```

---

## Authentifizierung & Session

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/sap/bc/adt/discovery` | Workspace-Capabilities, CSRF-Token holen |
| `POST` | `/sap/bc/adt/login` | Session etablieren (implizit via Basic Auth) |
| `DELETE` | `/sap/bc/adt/login` | Session beenden |

### CSRF-Token

```
Erster Request: Header  x-csrf-token: fetch
SAP-Antwort:   Header  x-csrf-token: {token}
Folge-Requests: Header  x-csrf-token: {gecachter token}
```

Token-Erneuerung bei `403 Forbidden` mit CSRF-Kontext.

---

## Repository — Objekte

### Objekt lesen (Metadaten)

```
GET {objectUri}
Accept: */*
```

**Verifiziert 2026-09-11 live gegen ein reales SAP-System** (Klasse und Interface): Jeder
spezifische `vnd.sap.*`-Content-Type — inkl. des zuvor hier dokumentierten
`application/vnd.sap.adt.core.objectstructure+xml` — wird von SAP mit `406 Not Acceptable`
(„Zulässige Inhaltstypen:" mit leerer Liste) abgelehnt, für Klassen und Interfaces
gleichermaßen. Nur `Accept: */*` (bzw. gar kein Accept-Header) liefert `200 OK`.

### Quelltext lesen

```
GET {sourceUri}
Accept: text/plain
```

Quelltext-URI ist immer `{objectUri}/source/main` oder für Klassen-Includes:
- `{classUri}/source/main`
- `{classUri}/source/definitions`
- `{classUri}/source/implementations`
- `{classUri}/source/macros`
- `{classUri}/source/test`

### Quelltext schreiben

```
PUT {sourceUri}?lockHandle={lockHandle}
Content-Type: text/plain; charset=utf-8
x-csrf-token: {token}
[Transport: {transportNumber}]  ← Query-Parameter: corrNr={number}

Body: {ABAP Quelltext}
```

### Objektstruktur lesen

```
POST /sap/bc/adt/repository/nodestructure
Content-Type: application/xml

<nodeStructure>
  <nodeCriteria>
    <parent_uri>{parentUri}</parent_uri>
    <parent_name>{parentName}</parent_name>
    <object_name>{objectName}</object_name>
    <object_type>{objectType}</object_type>
  </nodeCriteria>
</nodeStructure>
```

---

## Repository — Objekte anlegen

### Klasse anlegen

```
POST /sap/bc/adt/classes
Content-Type: application/vnd.sap.adt.classes+xml
x-csrf-token: {token}
?corrNr={transportNumber}&packageName={package}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<class:abapClass
  xmlns:class="http://www.sap.com/adt/oo/classes"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="{description}"
  adtcore:language="{language}"
  adtcore:name="{name}"
  adtcore:responsible="{user}"
  class:final="{true|false}"
  class:visibility="{public|private|protected}">
  <adtcore:packageRef adtcore:name="{package}"/>
</class:abapClass>
```

### Interface anlegen

```
POST /sap/bc/adt/interfaces
Content-Type: application/vnd.sap.adt.interfaces+xml
x-csrf-token: {token}
?corrNr={transportNumber}&packageName={package}

Body: Analog Klasse mit interface: Namespace
```

### Report anlegen

```
POST /sap/bc/adt/programs/programs
Content-Type: application/vnd.sap.adt.programs.programs+xml
x-csrf-token: {token}
?corrNr={transportNumber}&packageName={package}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<program:abapProgram
  xmlns:program="http://www.sap.com/adt/programs/programs"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="{description}"
  adtcore:language="{language}"
  adtcore:name="{name}"
  adtcore:responsible="{user}"
  program:programType="{type}">
  <adtcore:packageRef adtcore:name="{package}"/>
</program:abapProgram>
```

### Funktionsgruppe anlegen

```
POST /sap/bc/adt/functions/groups
Content-Type: application/vnd.sap.adt.functions.groups+xml
x-csrf-token: {token}
?corrNr={transportNumber}&packageName={package}
```

### Funktionsbaustein anlegen

```
POST /sap/bc/adt/functions/groups/{groupName}/fmodules
Content-Type: application/vnd.sap.adt.functions.fmodules+xml
x-csrf-token: {token}
?corrNr={transportNumber}
```

### CDS Datenobjekt (DDLS) anlegen

**Unverifiziert** (2026-09-18, Fix für `BUG_createCdsView_404.md` — der bisher dokumentierte
Endpunkt `/sap/bc/adt/services/datas` liefert auf modernen Systemen 404; `/sap/bc/adt/ddic/ddl/sources`
stammt aus der Open-Source-Referenz `marcellourbani/abap-adt-api` (`objectcreator.ts`,
`CreatableTypes` für `DDLS/DF`) und passt zum Lese-Namensraum (`GET /sap/bc/adt/ddic/ddl/sources/{name}`).
Noch nicht live gegen ein echtes System bestätigt.):

```
POST /sap/bc/adt/ddic/ddl/sources
Content-Type: application/*
x-csrf-token: {token}
?corrNr={transportNumber}&packageName={package}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<ddl:ddlSource
  xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="{description}"
  adtcore:language="{language}"
  adtcore:masterLanguage="{language}"
  adtcore:name="{name}"
  adtcore:type="DDLS/DF">
  <adtcore:packageRef adtcore:name="{package}"/>
</ddl:ddlSource>
```

`ddl:ddlSource` hat kein `category`-Attribut — VIEW/ENTITY/ABSTRACT ENTITY ergibt sich aus der
DDL-Syntax, die anschließend per `adt_write_object` in `source/main` geschrieben wird, nicht aus
Anlage-Metadaten.

### Behavior Definition (BDEF) anlegen

**Anlegen funktioniert, Aktivierung defekt** (siehe `BUG_createBehaviorDefinition_activation.md`
für den vollständigen Befund): Endpunkt, Namespace und Root-Element stammen aus der
Open-Source-Referenz `marcellourbani/vscode_abap_remote_fs`
(`client/src/adt/operations/BdefCreator.ts`, registriert `BDEF/BDO` bei `abap-adt-api`s generischem
Object-Creator mit demselben `blue:blueSource`-Schema wie `TABL/DT`/`TABL/DS`). Live gegen
ein reales SAP-System verifiziert: `POST` (Anlegen) und `adt_write_object` auf `source/main`
funktionieren, aber
`adt_activate_object` schlägt mit "Der Typ ist unbekannt" auf die BDEF selbst fehl — vermutlich
fehlt dem generischen `blue:blueSource`-Schema eine Kennzeichnung, die der RAP-Behavior-Aktivator
erwartet. Vor einer Korrektur: ADT-Trace aus Eclipse nötig, nicht raten.

```
POST /sap/bc/adt/bo/behaviordefinitions
Content-Type: application/*
x-csrf-token: {token}
?corrNr={transportNumber}&packageName={package}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<blue:blueSource
  xmlns:blue="http://www.sap.com/wbobj/blue"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="{description}"
  adtcore:language="{language}"
  adtcore:masterLanguage="{language}"
  adtcore:name="{name}"
  adtcore:type="BDEF/BDO">
  <adtcore:packageRef adtcore:name="{package}"/>
</blue:blueSource>
```

Event Binding (`EVTB`) bleibt weiterhin ohne Tool-Unterstützung — keine verifizierte Quelle
(weder in `abap-adt-api` noch `vscode_abap_remote_fs` noch SAP Help) für Endpunkt/Schema gefunden.
Vor Implementierung: ADT-Trace aus Eclipse (New Other... ABAP Event Binding) nötig.

### Paket anlegen

```
POST /sap/bc/adt/repository/packages
Content-Type: application/vnd.sap.adt.repository.packages+xml
x-csrf-token: {token}
?corrNr={transportNumber}&parentPackage={parent}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<pak:package
  xmlns:pak="http://www.sap.com/adt/packages"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="{description}"
  adtcore:language="{language}"
  adtcore:name="{name}"
  pak:superPackage="{parent}">
</pak:package>
```

---

## Repository — Objekte löschen

```
DELETE {objectUri}?lockHandle={lockHandle}
x-csrf-token: {token}
[?corrNr={transportNumber}]
```

---

## Sperren (Locks)

### Sperre setzen

```
POST {objectUri}/lock?_action=LOCK&accessMode=MODIFY
x-csrf-token: {token}
Accept: application/vnd.sap.adt.lock+xml

Response:
<?xml version="1.0" encoding="UTF-8"?>
<adtlock:lock xmlns:adtlock="http://www.sap.com/adt/lock">
  <adtlock:lockHandle>{lockHandle}</adtlock:lockHandle>
  ...
</adtlock:lock>
```

### Sperre lösen

```
DELETE {objectUri}/lock/{urlEncoded(lockHandle)}
x-csrf-token: {token}
```

### Sperrinhaber ermitteln

Aus Objektmetadaten:
```
GET {objectUri}
→ adtcore:lockedBy Attribut im Response
```

---

## Aktivierung

### Einzelaktivierung

```
POST /sap/bc/adt/activation?method=activate&preauditRequested=true
Content-Type: application/vnd.sap.adt.activation.request+xml
x-csrf-token: {token}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference
    adtcore:uri="{objectUri}"
    adtcore:name="{objectName}"/>
</adtcore:objectReferences>
```

### Massenaktivierung

Gleiches Endpoint, mehrere `objectReference`-Elemente im Body.

### Inaktive Objekte auflisten

```
GET /sap/bc/adt/activation/inactiveobjects
Accept: application/vnd.sap.adt.activation.objectregistries+xml
```

### Aktivierungsantwort parsen

```xml
<chkl:messages>
  <msg type="{I|W|E|A|X}" line="{line}">
    {Fehlermeldung}
  </msg>
</chkl:messages>
<ioc:inactiveObjects>
  <ioc:entry>
    <ioc:object adtcore:uri="{uri}" adtcore:name="{name}"/>
  </ioc:entry>
</ioc:inactiveObjects>
```

Erfolg = keine `inactiveObjects` UND keine Nachrichten vom Typ E/A/X.

---

## Syntaxprüfung

### Syntaxprüfung für bestehendes Objekt

```
POST /sap/bc/adt/checkruns?reporters=abapCheckRun
Content-Type: application/vnd.sap.adt.abapsource+xml
x-csrf-token: {token}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<abapCheckRun>
  <checkObjectList>
    <checkObject uri="{objectUri}" version="active|inactive"/>
  </checkObjectList>
</abapCheckRun>
```

### Syntaxprüfung für freien Quelltext

```
POST /sap/bc/adt/checkruns?reporters=abapCheckRun
Content-Type: application/vnd.sap.adt.abapsource.checkrunrequest+xml
x-csrf-token: {token}

Body enthält: Quelltext + Kontext-URI
```

### Syntaxprüfungsantwort

```xml
<checkRun:checkResultList>
  <checkRun:checkResult checkRun:reporter="abapCheckRun">
    <checkRun:findings>
      <checkRun:finding
        checkRun:uri="{uri}"
        checkRun:line="{line}"
        checkRun:column="{column}"
        checkRun:type="E|W|I"
        checkRun:text="{message}"/>
    </checkRun:findings>
  </checkRun:checkResult>
</checkRun:checkResultList>
```

---

## Suche

### Objekte suchen

```
GET /sap/bc/adt/repository/informationsystem/search
  ?operation=quickSearch
  &query={suchbegriff*}
  &maxResults={n}
  &objectType={PROG%2FP|CLAS%2FOC|...}
Accept: application/xml
```

**Content-Negotiation-Hinweis:** Der `vnd.sap.adt.repository.informationsystem.searchresults+xml`-Content-Type (früherer Stand dieser Doku) wird von SAP mit `406 ADT_NOT_ACCEPTABLE` abgelehnt ("Zulässige Inhaltstypen: application/xml") — dasselbe Muster wie bei `adt_get_object_metadata`/`adt_list_transport_requests`. `SearchService.searchObjects()` nutzt bereits korrekt `application/xml`; `PackageService.getPackageContent()` teilt sich denselben Endpunkt und wurde entsprechend angepasst (auf einem realen SAP-System reproduziert).

### Suchantworte

```xml
<adtcore:objectReferences>
  <adtcore:objectReference
    adtcore:uri="{uri}"
    adtcore:type="{type}"
    adtcore:name="{name}"
    adtcore:packageName="{package}"
    adtcore:description="{description}"/>
</adtcore:objectReferences>
```

---

## Transportaufträge

### Aufträge auflisten

```
GET /sap/bc/adt/cts/transports
  ?user={username}
  &status=D
  &target={targetSystem}
Accept: application/vnd.sap.as+xml
```

**Wichtig:** Für dieses GET-Resource ist nur der generische AS-ABAP-XML-Content-Type
registriert. `application/vnd.sap.adt.cts.transports+xml` (naheliegend, da es als
Content-Type beim POST funktioniert) liefert hier `406 ADT_NOT_ACCEPTABLE`
("Zulässige Inhaltstypen: application/vnd.sap.as+xml").

### Auftrag anlegen

```
POST /sap/bc/adt/cts/transports
Content-Type: application/vnd.sap.adt.cts.transports+xml
x-csrf-token: {token}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<tm:request xmlns:tm="http://www.sap.com/adt/cts/transports">
  <tm:attributes>
    <tm:category>Workbench</tm:category>
    <tm:target>{system}</tm:target>
    <tm:description>{description}</tm:description>
  </tm:attributes>
</tm:request>
```

Response: `Location`-Header enthält URI des neuen Auftrags.
Transportnummer aus URI extrahieren: letztes Pfadsegment.

### Auftrag freigeben

```
POST /sap/bc/adt/cts/transportrequests/{number}/tasks/{taskNumber}/release
  ?ignorelocal={true|false}
  &skipATC={true|false}
x-csrf-token: {token}
Content-Length: 0
```

### Auftrag löschen

```
DELETE /sap/bc/adt/cts/transportrequests/{number}
x-csrf-token: {token}
```

---

## Pakete

### Paketinhalt lesen

```
GET /sap/bc/adt/repository/informationsystem/objecttypes
  ?packageName={package}
  &maxResults=100
Accept: application/vnd.sap.adt.repository.informationsystem.objecttypes+xml
```

---

## ATC (ABAP Test Cockpit)

**Verifiziert am 2026-09-11 live gegen ein reales SAP-System.** Die vorherige Version
dieses Abschnitts war unvalidierte Dokumentation und in mehreren Punkten falsch
(falscher XML-Namespace, falsche Accept-Header, fälschlich angenommener
`Location`-Header) — das war die eigentliche Ursache dafür, dass `adt_run_atc` immer
mit „Accept header missing" scheiterte.

### ATC-Lauf starten

```
POST /sap/bc/adt/atc/runs
  ?worklistId={client-generated UUID}
  &maximumVerdicts={n}
Content-Type: application/vnd.sap.adt.atc.run.request+xml
Accept: application/xml
x-csrf-token: {token}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<atc:run xmlns:atc="http://www.sap.com/adt/atc" maximumVerdicts="{n}">
  <objectSets>
    <objectSet kind="inclusive">
      <adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
        <adtcore:objectReference
          adtcore:uri="{objectUri}"
          adtcore:name="{objectName}"/>
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>
```

**Wichtig:**
- Der Namespace ist `http://www.sap.com/adt/atc` (**nicht** `.../atc/run`).
- `worklistId` muss **client-seitig generiert** (z. B. UUID) und als Query-Parameter
  mitgeschickt werden — ohne ihn: `400 Parameter worklistId wurde nicht gefunden`.
- `Accept: application/vnd.sap.adt.atc.run.result+xml` (naheliegend, aber falsch) führt
  zu `400 Bad Request` mit der irreführenden Meldung „Accept header missing"
  (`subType: acceptHeaderMissing`) — SAPs generischer Fehler für „Content-Type nicht
  registriert", nicht für einen technisch fehlenden Header. Nur `application/xml` ist
  für diese Ressource registriert.
- Response: **kein** `Location`-Header — die Worklist-ID kommt im **Body** zurück:
  ```
  <atcworklist:worklistRun xmlns:atcworklist="http://www.sap.com/adt/atc/worklist">
    <atcworklist:worklistId>{id}</atcworklist:worklistId>
    <atcworklist:worklistTimestamp>{iso}</atcworklist:worklistTimestamp>
    <atcworklist:infos>
      <atcinfo:info xmlns:atcinfo="http://www.sap.com/adt/atc/info">
        <atcinfo:type>FINDING_STATS</atcinfo:type>
        <atcinfo:description>{errors},{warnings},{infos}</atcinfo:description>
      </atcinfo:info>
    </atcworklist:infos>
  </atcworklist:worklistRun>
  ```
- Der Lauf ist synchron — kein Polling nötig, die Findings sind sofort über
  `GET /atc/worklists/{worklistId}` abrufbar.

### ATC-Ergebnisse lesen

```
GET /sap/bc/adt/atc/worklists/{worklistId}
Accept: application/atc.worklist.v1+xml
```

Response (Auszug, tatsächliche Struktur):
```
<atcworklist:worklist atcworklist:id="{id}" xmlns:atcworklist="http://www.sap.com/adt/atc/worklist">
  <atcworklist:objectSets>
    <atcworklist:objectSet atcworklist:name="{...}" atcworklist:title="{...}" atcworklist:kind="ALL|LAST_RUN"/>
  </atcworklist:objectSets>
  <atcworklist:objects>
    <atcobject:object adtcore:uri="..." adtcore:type="CLAS" adtcore:name="..." adtcore:packageName="..."
      atcobject:author="..." xmlns:atcobject="http://www.sap.com/adt/atc/object" xmlns:adtcore="http://www.sap.com/adt/core">
      <atcobject:findings>
        <atcfinding:finding adtcore:uri="..." atcfinding:location=".../includes/implementations#start={line},{col}"
          atcfinding:priority="1-4" atcfinding:checkId="..." atcfinding:checkTitle="..."
          atcfinding:messageId="..." atcfinding:messageTitle="..." atcfinding:exemptionApproval="-"
          xmlns:atcfinding="http://www.sap.com/adt/atc/finding"/>
      </atcobject:findings>
    </atcobject:object>
  </atcworklist:objects>
</atcworklist:worklist>
```

Hinweis: `objects` ist ein **Geschwister** von `objectSets` (nicht darin verschachtelt).
Zeile/Spalte stehen **nicht** als eigene Attribute, sondern im URI-Fragment von
`atcfinding:location` (`#start={line},{col}`).

### ATC-Konfiguration lesen

```
GET /sap/bc/adt/atc/customizing
Accept: application/xml
```

(Nicht `application/vnd.sap.adt.atc.customizing+xml` — dieser Typ wird von SAP mit
`406 Not Acceptable` abgelehnt.) Liefert u. a. `systemCheckVariant` (Default-Check-
Variante); im getesteten System reicht die System-Default-Variante aus, ein expliziter
`checkVariant`-Parameter beim Run war nicht nötig.

---

## ABAP Unit Tests

### Unit Tests starten

```
POST {objectUri}?method=unittest
Content-Type: application/vnd.sap.adt.abapunit.testrequest+xml
x-csrf-token: {token}

Body:
<?xml version="1.0" encoding="UTF-8"?>
<aunit:run xmlns:aunit="http://www.sap.com/adt/aunit">
  <aunit:options>
    <aunit:measurements measure="none"/>
    <aunit:scope ownTests="true" foreignTests="false"/>
    <aunit:riskLevel
      harmless="true"
      dangerous="true"
      critical="true"/>
    <aunit:duration
      short="true"
      medium="true"
      long="false"/>
  </aunit:options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <adtcore:objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference
          adtcore:uri="{objectUri}"
          adtcore:name="{objectName}"/>
      </adtcore:objectReferences>
    </adtcore:objectSet>
  </adtcore:objectSets>
</aunit:run>
```

### Unit-Test-Ergebnis lesen

Synchrone Antwort im gleichen Request:

```xml
<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit">
  <aunit:program adtcore:name="{class}" adtcore:uri="{uri}">
    <aunit:testClasses>
      <aunit:testClass adtcore:name="{testClass}">
        <aunit:testMethods>
          <aunit:testMethod adtcore:name="{method}"
            aunit:executionTime="{ms}"
            aunit:unit="{ms}">
            <aunit:alerts>
              <aunit:alert
                aunit:kind="{assertion|exception}"
                aunit:severity="{fatal|critical|warning}">
                <aunit:title>{titel}</aunit:title>
                <aunit:details>
                  <aunit:detail aunit:text="{detail}"/>
                </aunit:details>
                <aunit:stack>
                  <aunit:stackEntry
                    adtcore:uri="{uri}"
                    aunit:description="{desc}"/>
                </aunit:stack>
              </aunit:alert>
            </aunit:alerts>
          </aunit:testMethod>
        </aunit:testMethods>
      </aunit:testClass>
    </aunit:testClasses>
  </aunit:program>
</aunit:runResult>
```

---

## Where-Used / Abhängigkeiten

### Where-Used-Liste

```
GET {sourceUri}?usages
Accept: application/vnd.sap.adt.repository.informationsystem.usages+xml
```

### Abhängigkeitsgraph

```
GET {objectUri}?dependencies
Accept: application/vnd.sap.adt.repository.informationsystem.dependencies+xml
```

---

## CDS / Services

### CDS-Binding veröffentlichen

```
POST /sap/bc/adt/services/bindings/{bindingName}/publish
x-csrf-token: {token}
Content-Length: 0
```

### CDS-Binding zurückziehen

```
POST /sap/bc/adt/services/bindings/{bindingName}/unpublish
x-csrf-token: {token}
Content-Length: 0
```

### CDS-Annotationen lesen

```
GET /sap/bc/adt/services/ddic/annotationdefinitions
Accept: application/vnd.sap.adt.services.ddic.annotationdefinitions+xml
```

---

## DDIC

### Tabelle lesen

```
GET /sap/bc/adt/ddic/tables/{tableName}
Accept: application/vnd.sap.adt.ddic.table+xml
```

### Datenelement lesen

```
GET /sap/bc/adt/ddic/dataelements/{elementName}
Accept: application/vnd.sap.adt.ddic.dataelement+xml
```

### Domäne lesen

```
GET /sap/bc/adt/ddic/domains/{domainName}
Accept: application/vnd.sap.adt.ddic.domain+xml
```

---

## Versionen / Versionsvergleich

### Versionsliste

```
GET {objectUri}?versions
Accept: application/atom+xml
```

### Versionquelltext

```
GET {sourceUri}?version={version}
Accept: text/plain
```

---

## Objekt-URI-Muster

| Objekttyp | SAP-Typ | URI-Pattern |
|-----------|---------|-------------|
| Klasse | `CLAS/OC` | `/sap/bc/adt/classes/classes/{NAME}` |
| Interface | `INTF/OI` | `/sap/bc/adt/interfaces/interfaces/{NAME}` |
| Report | `PROG/P` | `/sap/bc/adt/programs/programs/{NAME}` |
| Include | `PROG/I` | `/sap/bc/adt/programs/includes/{NAME}` |
| Funktionsgruppe | `FUGR/F` | `/sap/bc/adt/functions/groups/{NAME}` |
| Funktionsbaustein | `FUGR/FF` | `/sap/bc/adt/functions/groups/{GROUP}/fmodules/{NAME}` |
| Paket | `DEVC/K` | `/sap/bc/adt/repository/packages/{NAME}` |
| Tabelle | `TABD/DT` | `/sap/bc/adt/ddic/tables/{NAME}` |
| Datenelement | `DOMA/DE` | `/sap/bc/adt/ddic/dataelements/{NAME}` |
| Domäne | `DOMA/DO` | `/sap/bc/adt/ddic/domains/{NAME}` |
| CDS View | `DDLS/DF` | `/sap/bc/adt/ddic/ddl/sources/{NAME}` |
| Behavior Definition | `BDEF/BDO` | `/sap/bc/adt/bo/behaviordefinitions/{NAME}` |
| Access Control | `DCLS/DL` | `/sap/bc/adt/services/accesscontrols/{NAME}` |
| Service Definition | `SRVD/SD` | `/sap/bc/adt/services/definitions/{NAME}` |
| Service Binding | `SRVB/SB` | `/sap/bc/adt/services/bindings/{NAME}` |
| Messageklasse | `MSAG/E` | `/sap/bc/adt/ddic/messageClasses/{NAME}` |
| Simple Transformation | `XSLT/VT` | `/sap/bc/adt/programs/transforms/{NAME}` |
| XSLT-Programm | `XSLT/XT` | `/sap/bc/adt/programs/transforms/{NAME}` |

**Erzeugung (`adt_create_st`/`adt_create_xslt`) unverifiziert:** `TransformationService.createSimpleTransformation()`/`createXslt()` posten aktuell an die Collection-URI `/sap/bc/adt/programs/transforms` — das liefert `ADT_NOT_FOUND`, für beide Tools identisch (auf einem realen SAP-System reproduziert). Weder `marcellourbani/abap-adt-api` (`objectcreator.ts`, `CreatableTypes`-Liste) noch `vscode_abap_remote_fs` enthalten einen Eintrag für XSLT/ST — die Referenzquellen, aus denen alle anderen `adt_create_*`-Endpunkte in diesem Projekt stammen, decken diesen Objekttyp nicht ab. Der bestehende Endpunkt war also nie gegen eine verifizierte Quelle abgeglichen. **Nicht weiter raten** (gleicher Grundsatz wie bei BDEF, siehe `CLAUDE.md`) — vor einem Fix wird ein ADT-Netzwerk-Trace aus Eclipse beim manuellen Anlegen einer Simple Transformation/eines XSLT-Programms benötigt. Workaround: manuell in Eclipse/SE80 anlegen, Quelltext danach per `adt_write_object` setzen (Lese-/Schreib-Endpunkte sind von diesem Bug nicht betroffen).

---

## HTTP-Statuscodes

| Code | Bedeutung | Behandlung |
|------|-----------|------------|
| 200 | OK | Normal |
| 201 | Created | Location-Header auswerten |
| 204 | No Content | Erfolg ohne Body |
| 304 | Not Modified | Cache-Hit |
| 400 | Bad Request | Input-Validierung, ADT-Fehlermeldung parsen |
| 401 | Unauthorized | Re-Authentifizierung |
| 403 | Forbidden | CSRF-Prüfung + ggf. Token-Erneuerung |
| 404 | Not Found | AdtNotFoundError |
| 409 | Conflict | Lock-Konflikt |
| 423 | Locked | Objekt gesperrt, AdtLockError |
| 500 | Internal Server Error | SAP-Fehlerdetails parsen |
| 503 | Service Unavailable | Retry mit Backoff |

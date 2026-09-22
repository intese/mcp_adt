# Bug: Über `adt_create_object`/`createBehaviorDefinition` angelegte Behavior Definitions lassen sich nicht aktivieren

## Symptom

`adt_create_object(objectType: "BDEF/BDO", ...)` liefert Erfolg (POST, 2xx), und
`adt_write_object` auf den erzeugten Quelltext (`source/main`) funktioniert ebenfalls.
Erst bei der **Aktivierung** (`adt_activate_object`) schlägt es konsistent fehl:

```
E: Der Typ "ZBP_I_TEST_ENTITY" ist unbekannt. (Zeile 1)
W: Das Feld SUBC des TRDIR-Eintrags der aktuellen Kompilationseinheit () besitzt den
   falschen Wert 'B'. (Zeile 2)
```

Die Behavior Definition meldet sich selbst (ihren eigenen Namen) als „unbekannten Typ" —
kein Content-Fehler, kein Fehler in der zugehörigen Implementierungsklasse.

Reproduziert an einem realen SAP-System (Mandant 100), Objekte `zbp_i_test_entity`
(BDEF) und `zcl_bp_i_test_entity` (Implementierungsklasse, bereits vorhanden und aktiv).

## Ursprüngliche (fehlerhafte) Live-Verifikation

Ein früherer Live-Test hatte nur Anlegen + sofortiges Löschen eines **leeren**
Testobjekts (`Z_TEST_BDEF`, ohne Content, ohne Aktivierungsversuch) geprüft und
das fälschlich als „funktioniert" vermerkt. Dieser Test hat den eigentlichen Fehler
nicht abgedeckt, weil er nie bis zur Aktivierung kam.

## Isolationstests (alle mit identischem Kernfehler)

1. Volle BDEF (Events + Mapping) + volle Klasse (Typen, Methoden, lokale
   Handler-Klasse) zusammen aktiviert → derselbe Fehler, zusätzlich „Der Typ
   TT_TEST_TYPE ist unbekannt" (Zeile 1) und dieselbe SUBC-Warnung.
2. Komplett leere BDEF (`define behavior for zi_test_entity ... { }`) + komplett leere
   Klasse (`definition ... for behavior of zi_test_entity. endclass.`) → „Es gibt keine
   Verhaltensdefinition für ZI_TEST_ENTITY" (Klasse zuerst kompiliert, BDEF existiert für
   sie noch nicht) + „Der Typ ZBP_I_TEST_ENTITY ist unbekannt" (Zeile 2) + dieselbe
   SUBC-Warnung.
3. Nur die BDEF allein (Klasse bereits vorhanden, inaktiv) → wie oben.
4. Komplettes Löschen + Neuanlage beider Objekte von Grund auf, gesamter Content in
   einem Zug geschrieben, eine einzige Aktivierung → identischer Fehler.

Die SUBC='B'-Warnung auf „der aktuellen Kompilationseinheit ()" (leerer Name!) tritt in
**jedem** Fall auf, unabhängig vom Content.

## Betroffener Code

- `src/services/ObjectService.ts`, `createBehaviorDefinition()` (siehe Kommentar direkt
  darüber: "Endpoint/namespace unverified against a real system").
- Endpunkt/Schema stammen aus `marcellourbani/vscode_abap_remote_fs`
  (`client/src/adt/operations/BdefCreator.ts`): `POST /sap/bc/adt/bo/behaviordefinitions`,
  Root `blue:blueSource`, Namespace `http://www.sap.com/wbobj/blue` — **identisch** zum
  Schema, das `abap-adt-api` für `TABL/DT`/`TABL/DS` (generische DDIC-Objekte) verwendet.
  In `abap-adt-api` selbst fehlt `BDEF/BDO` komplett; der VS-Code-Extension-Autor hat den
  Typ nachträglich und **nicht offiziell** registriert (`registerBdefType()`).

## Hypothese (nicht verifiziert — vor weiterem Fix-Versuch klären)

Das generische `blue:blueSource`-Anlage-Schema erzeugt vermutlich zwar einen
TADIR/ADT-Objekt-Eintrag, aber nicht die Metadaten, die der RAP-Behavior-Aktivator für
eine echte Behavior Definition erwartet (z. B. fehlt eine Kennung, die das Objekt als
BDL-Kompilationseinheit statt als generisches DDIC-Objekt markiert — passend zur
SUBC='B'-Warnung auf eine "namenlose" Kompilationseinheit).

Ein möglicher, aber komplett anderer und ungetesteter Lösungsweg: SAPs eigener
RAP-Generator-Endpunkt (`/sap/bc/adt/businessservices/generators/{uiservice|webapiservice}`,
siehe `src/api/rapgenerator.ts` in `abap-adt-api`). Das ist aber kein Drop-in-Ersatz für
`createBehaviorDefinition()` — der Generator erzeugt CDS-Entity + Behavior Definition +
Implementierungsklasse + Service-Definition/-Binding in einem Schritt aus einer
Basis-CDS-Entity heraus (JSON-Payload, mehrstufiger Validate→Preview→Generate-Ablauf),
nicht die eigenständige Anlage einer einzelnen BDEF für eine bereits bestehende Struktur.

**Vor einer Code-Änderung bitte zunächst klären:** ADT-Trace aus Eclipse beim manuellen
Anlegen **und Aktivieren** einer Behavior Definition (nicht nur Anlegen) gegen ein echtes
System — insbesondere: unterscheidet sich der Anlage-Request (Body/Content-Type) von
unserem `blue:blueSource`? Gibt es einen zusätzlichen Request nach dem Anlegen, bevor die
erste Aktivierung möglich ist? Nicht raten.

## Workaround

Manuelles Anlegen über den Eclipse-ADT-Wizard ("New Behavior Definition" auf der
Root Entity) funktioniert und lässt sich normal aktivieren — nur die Anlage über
`createBehaviorDefinition()`/den generischen `blue:blueSource`-Endpunkt ist betroffen.
An anderer Stelle so verifiziert: manuell angelegte BDEF `ZI_TEST_ENTITY` (Eclipse
benennt die BDEF standardmäßig identisch zur zugrunde liegenden Root Entity —
`BDEF/BDO` und `DDLS/DF` sind getrennte Namensräume, kein Konflikt) plus
Implementierungsklasse `ZBP_I_TEST_ENTITY` (Eclipse-Vorschlag: Präfix `ZBP_` +
Root-Entity-Name) aktivieren beide fehlerfrei.

**Zusatzbefund:** Die Implementierungsklasse selbst (reine `CLAS/OC`) lässt sich
weiterhin ganz normal über `adt_create_object`/`adt_create_class` anlegen und
aktivieren — nur die BDEF-Anlage über unseren Endpunkt ist betroffen, nicht die
Klassen-Anlage.

**Für einen künftigen Eclipse-Trace-Vergleich:** Eclipse legt eine `managed`-BDEF
standardmäßig mit einem Grundgerüst aus `strict(2)`, `authorization master
(instance)`, `create`/`update`/`delete` und `field (readonly)` an (dort dann auf eine
minimale Event-only-Variante reduziert). Falls der ADT-Trace aus der Hypothese oben
gezogen wird, lohnt sich ein Vergleich mit genau diesem Grundgerüst.

Der Workaround wurde inzwischen an anderer Stelle produktiv eingesetzt; kein Blocker
mehr dort. Event Binding (`EVTB`) bleibt unabhängig davon ohne Tool-Unterstützung.

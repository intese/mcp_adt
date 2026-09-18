// Mock SAP ADT XML responses for unit tests

export const MOCK_CSRF_TOKEN = "test-csrf-token-12345";

export const MOCK_CLASS_METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<class:abapClass
  xmlns:class="http://www.sap.com/adt/oo/classes"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="Test Class"
  adtcore:language="EN"
  adtcore:name="ZCL_TEST_CLASS"
  adtcore:type="CLAS/OC"
  adtcore:uri="/sap/bc/adt/classes/classes/ZCL_TEST_CLASS"
  adtcore:responsible="TESTUSER">
  <adtcore:packageRef adtcore:name="ZTESTPKG"/>
</class:abapClass>`;

export const MOCK_CLASS_SOURCE = `CLASS zcl_test_class DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS hello_world RETURNING VALUE(result) TYPE string.
ENDCLASS.

CLASS zcl_test_class IMPLEMENTATION.
  METHOD hello_world.
    result = 'Hello World'.
  ENDMETHOD.
ENDCLASS.`;

export const MOCK_SEARCH_RESULTS_XML = `<?xml version="1.0" encoding="utf-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference
    adtcore:uri="/sap/bc/adt/classes/classes/ZCL_TEST_CLASS"
    adtcore:type="CLAS/OC"
    adtcore:name="ZCL_TEST_CLASS"
    adtcore:description="Test Class"
    adtcore:packageName="ZTESTPKG"/>
  <adtcore:objectReference
    adtcore:uri="/sap/bc/adt/classes/classes/ZCL_ANOTHER_CLASS"
    adtcore:type="CLAS/OC"
    adtcore:name="ZCL_ANOTHER_CLASS"
    adtcore:description="Another Class"
    adtcore:packageName="ZTESTPKG"/>
</adtcore:objectReferences>`;

export const MOCK_LOCK_RESPONSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adtlock:lock xmlns:adtlock="http://www.sap.com/adt/lock">
  <adtlock:lockHandle>LOCK_HANDLE_ABC123</adtlock:lockHandle>
  <adtlock:lockedBy>TESTUSER</adtlock:lockedBy>
  <adtlock:lockTime>2024-01-15T10:30:00Z</adtlock:lockTime>
</adtlock:lock>`;

// Matches the actual shape LockService.parseLockResponse() reads:
// asx:abap/asx:values/DATA/LOCK_HANDLE (+ CORRNR).
export const MOCK_LOCK_RESULT_XML = `<?xml version="1.0" encoding="utf-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml">
  <asx:values>
    <DATA>
      <LOCK_HANDLE>LOCK_HANDLE_ABC123</LOCK_HANDLE>
      <CORRNR>TR12345</CORRNR>
    </DATA>
  </asx:values>
</asx:abap>`;

export const MOCK_ACTIVATION_SUCCESS_XML = `<?xml version="1.0" encoding="utf-8"?>
<chkl:messages xmlns:chkl="http://www.sap.com/adt/activation">
</chkl:messages>`;

export const MOCK_ACTIVATION_ERROR_XML = `<?xml version="1.0" encoding="utf-8"?>
<chkl:messages xmlns:chkl="http://www.sap.com/adt/activation">
  <msg type="E" line="5">Syntax error: Unknown identifier "NONEXISTENT"</msg>
</chkl:messages>
<ioc:inactiveObjects xmlns:ioc="http://www.sap.com/adt/activation/inactiveobjects">
  <ioc:entry>
    <ioc:object adtcore:uri="/sap/bc/adt/classes/classes/ZCL_TEST_CLASS"
      adtcore:name="ZCL_TEST_CLASS"
      xmlns:adtcore="http://www.sap.com/adt/core"/>
  </ioc:entry>
</ioc:inactiveObjects>`;

// Unverified alternative shape (see ActivationService.extractMessageText doc comment):
// some SAP chkl:-family responses nest the message text under shortText/txt instead
// of sending it as the <msg> element's direct text content.
export const MOCK_ACTIVATION_ERROR_NESTED_TEXT_XML = `<?xml version="1.0" encoding="utf-8"?>
<chkl:messages xmlns:chkl="http://www.sap.com/adt/activation">
  <msg type="E" line="1">
    <shortText>
      <txt>Statement "CHECK" is not allowed outside a loop</txt>
    </shortText>
  </msg>
</chkl:messages>`;

export const MOCK_SYNTAX_CHECK_CLEAN_XML = `<?xml version="1.0" encoding="utf-8"?>
<checkRun:checkResultList xmlns:checkRun="http://www.sap.com/adt/checkrun">
  <checkRun:checkResult checkRun:reporter="abapCheckRun">
    <checkRun:findings/>
  </checkRun:checkResult>
</checkRun:checkResultList>`;

export const MOCK_SYNTAX_CHECK_ERROR_XML = `<?xml version="1.0" encoding="utf-8"?>
<checkRun:checkResultList xmlns:checkRun="http://www.sap.com/adt/checkrun">
  <checkRun:checkResult checkRun:reporter="abapCheckRun">
    <checkRun:findings>
      <checkRun:finding
        checkRun:uri="/sap/bc/adt/classes/classes/ZCL_TEST_CLASS"
        checkRun:line="5"
        checkRun:column="10"
        checkRun:type="E"
        checkRun:text="Syntax error: Comma expected"/>
    </checkRun:findings>
  </checkRun:checkResult>
</checkRun:checkResultList>`;

export const MOCK_TRANSPORT_LIST_XML = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/adt/cts/transports">
  <tm:workbench>
    <tm:request tm:number="DEVK900001" tm:category="Workbench"
      tm:status="D" tm:owner="TESTUSER">
      <tm:description>My test transport</tm:description>
    </tm:request>
  </tm:workbench>
</tm:root>`;

export const MOCK_UNIT_TEST_RESULT_XML = `<?xml version="1.0" encoding="utf-8"?>
<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"
  xmlns:adtcore="http://www.sap.com/adt/core">
  <aunit:program adtcore:name="ZCL_TEST_CLASS"
    adtcore:uri="/sap/bc/adt/classes/classes/ZCL_TEST_CLASS">
    <aunit:testClasses>
      <aunit:testClass adtcore:name="LTCL_TEST">
        <aunit:testMethods>
          <aunit:testMethod adtcore:name="TEST_HELLO_WORLD"
            aunit:executionTime="1">
            <aunit:alerts/>
          </aunit:testMethod>
        </aunit:testMethods>
      </aunit:testClass>
    </aunit:testClasses>
  </aunit:program>
</aunit:runResult>`;

export const MOCK_UNIT_TEST_FAILURE_XML = `<?xml version="1.0" encoding="utf-8"?>
<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"
  xmlns:adtcore="http://www.sap.com/adt/core">
  <aunit:program adtcore:name="ZCL_TEST_CLASS"
    adtcore:uri="/sap/bc/adt/classes/classes/ZCL_TEST_CLASS">
    <aunit:testClasses>
      <aunit:testClass adtcore:name="LTCL_TEST">
        <aunit:testMethods>
          <aunit:testMethod adtcore:name="TEST_HELLO_WORLD"
            aunit:executionTime="2">
            <aunit:alerts>
              <aunit:alert aunit:kind="assertion" aunit:severity="critical">
                <aunit:title>Assertion failed</aunit:title>
                <aunit:details>
                  <aunit:detail aunit:text="Expected: Hello World, Got: Goodbye World"/>
                </aunit:details>
              </aunit:alert>
            </aunit:alerts>
          </aunit:testMethod>
        </aunit:testMethods>
      </aunit:testClass>
    </aunit:testClasses>
  </aunit:program>
</aunit:runResult>`;

export const MOCK_UNIT_TEST_EMPTY_XML = `<?xml version="1.0" encoding="utf-8"?>
<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"/>`;

export const MOCK_SAP_ERROR_XML = `<?xml version="1.0" encoding="utf-8"?>
<exc:exception xmlns:exc="http://www.sap.com/exception">
  <exc:type>NOT_FOUND</exc:type>
  <exc:message>Object ZCL_NONEXISTENT does not exist</exc:message>
  <exc:localizedMessage>Object ZCL_NONEXISTENT does not exist</exc:localizedMessage>
</exc:exception>`;

// Captured from a real SAP ADT ATC run, with the object/finding identifiers
// genericized. This is the actual response shape — docs/adt-endpoints.md and the
// original ATCService implementation both assumed a different (incorrect) schema
// before this was verified live.
export const MOCK_ATC_RUN_RESPONSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<atcworklist:worklistRun xmlns:atcworklist="http://www.sap.com/adt/atc/worklist">
  <atcworklist:worklistId>00000000000000000000000000000000</atcworklist:worklistId>
  <atcworklist:worklistTimestamp>2026-09-11T09:58:14Z</atcworklist:worklistTimestamp>
  <atcworklist:infos>
    <atcinfo:info xmlns:atcinfo="http://www.sap.com/adt/atc/info">
      <atcinfo:type>FINDING_STATS</atcinfo:type>
      <atcinfo:description>1,0,2</atcinfo:description>
    </atcinfo:info>
  </atcworklist:infos>
</atcworklist:worklistRun>`;

export const MOCK_ATC_WORKLIST_XML = `<?xml version="1.0" encoding="utf-8"?>
<atcworklist:worklist atcworklist:id="00000000000000000000000000000000"
  atcworklist:usedObjectSet="99999999999999999999999999999999"
  atcworklist:objectSetIsComplete="true"
  xmlns:atcworklist="http://www.sap.com/adt/atc/worklist">
  <atcworklist:objectSets>
    <atcworklist:objectSet atcworklist:name="00000000000000000000000000000000" atcworklist:title="Alle Objekte" atcworklist:kind="ALL"/>
    <atcworklist:objectSet atcworklist:name="99999999999999999999999999999999" atcworklist:title="Letzter Prüflauf" atcworklist:kind="LAST_RUN"/>
  </atcworklist:objectSets>
  <atcworklist:objects>
    <atcobject:object adtcore:uri="/sap/bc/adt/atc/objects/R3TR/CLAS/ZCL_TEST_CLASS"
      adtcore:type="CLAS" adtcore:name="ZCL_TEST_CLASS" adtcore:packageName="ZTESTPKG"
      atcobject:author="TESTUSER"
      xmlns:atcobject="http://www.sap.com/adt/atc/object" xmlns:adtcore="http://www.sap.com/adt/core">
      <atcobject:findings>
        <atcfinding:finding adtcore:uri="/sap/bc/adt/atc/findings/itemid/ABC123/index/116"
          atcfinding:location="/sap/bc/adt/oo/classes/zcl_test_class/includes/testclasses#start=34,0"
          atcfinding:processor="TESTUSER" atcfinding:lastChangedBy="TESTUSER"
          atcfinding:priority="3" atcfinding:checkId="CHECK123"
          atcfinding:checkTitle="Erweiterte Programmprüfung (SLIN)"
          atcfinding:messageId="1700"
          atcfinding:messageTitle="Zeichenketten ohne Textelement werden nicht übersetzt"
          atcfinding:exemptionApproval="-" atcfinding:exemptionKind="" atcfinding:checksum="927288306"
          atcfinding:remarkText="" atcfinding:remarkLink="" atcfinding:quickfixInfo="atc:ABC123,116"
          xmlns:atcfinding="http://www.sap.com/adt/atc/finding"/>
        <atcfinding:finding adtcore:uri="/sap/bc/adt/atc/findings/itemid/DEF456/index/117"
          atcfinding:location="/sap/bc/adt/oo/classes/zcl_test_class/includes/implementations#start=52,0"
          atcfinding:processor="TESTUSER" atcfinding:lastChangedBy="TESTUSER"
          atcfinding:priority="1" atcfinding:checkId="CHECK456"
          atcfinding:checkTitle="Problemat.Anweisungen für Ergebnis von SELECT/OPEN CURSOR ohne ORDER BY suchen"
          atcfinding:messageId="AMB_SINGLE"
          atcfinding:messageTitle="SELECT SINGLE möglicherweise nicht eindeutig"
          atcfinding:exemptionApproval="-" atcfinding:exemptionKind="" atcfinding:checksum="-1303041211"
          atcfinding:remarkText="" atcfinding:remarkLink="" atcfinding:quickfixInfo="atc:DEF456,117"
          xmlns:atcfinding="http://www.sap.com/adt/atc/finding"/>
      </atcobject:findings>
    </atcobject:object>
  </atcworklist:objects>
  <atcworklist:infos/>
</atcworklist:worklist>`;

export const MOCK_ATC_WORKLIST_EMPTY_XML = `<?xml version="1.0" encoding="utf-8"?>
<atcworklist:worklist atcworklist:id="00000000000000000000000000000000"
  atcworklist:usedObjectSet="00000000000000000000000000000000"
  atcworklist:objectSetIsComplete="true"
  xmlns:atcworklist="http://www.sap.com/adt/atc/worklist">
  <atcworklist:objectSets>
    <atcworklist:objectSet atcworklist:name="00000000000000000000000000000000" atcworklist:title="Alle Objekte" atcworklist:kind="ALL"/>
  </atcworklist:objectSets>
  <atcworklist:objects/>
  <atcworklist:infos/>
</atcworklist:worklist>`;

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

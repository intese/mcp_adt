// Set required env vars before any test module loads config
process.env["SAP_URL"] = "https://test-sap.local:443";
process.env["SAP_CLIENT"] = "100";
process.env["SAP_USER"] = "TESTUSER";
process.env["SAP_PASSWORD"] = "testpassword";
process.env["SAP_LANGUAGE"] = "EN";
process.env["LOG_LEVEL"] = "error";

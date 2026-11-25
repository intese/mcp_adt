# sap-adt-mcp-server

Production-ready MCP (Model Context Protocol) server for SAP ABAP Development Tools (ADT).

Enables MCP-compatible clients to directly read, write, activate, and analyze SAP ABAP objects via official SAP ADT REST APIs — without Eclipse, without GUI automation.

---

## Features

- **49 MCP tools** for the full ABAP development lifecycle
- Read and write ABAP source code (classes, interfaces, reports, function groups, CDS)
- Syntax check, activation, ATC analysis, ABAP Unit Tests
- Transport request management
- Package hierarchy navigation
- Where-used and dependency analysis
- CDS view analysis and OData service binding management
- Table data access (ADT data preview, or RFC function modules on older ECC systems)
- Two transports: HTTPS or [RFC](#rfc-transport) (SAP JCo, no HTTP port needed)
- Simple Transformation and XSLT support (incl. XML/UBL/ZUGFeRD helpers)
- Robust session management with CSRF token handling and retry logic
- Structured logging (Winston), Zod input validation, full TypeScript types

---

## Requirements

### System
- Node.js 22+
- SAP ECC 6.07+ or S/4HANA 2020+
- HTTP transport: SAP ADT service enabled (`/sap/bc/adt/discovery` accessible)
- RFC transport: JDK 21+ and SAP JCo (see [RFC transport](#rfc-transport))
- Creating objects may require a developer key (SSCR) on ECC systems

### SAP Authorizations

The technical user requires at minimum:

| Authorization Object | Field | Value |
|---------------------|-------|-------|
| `S_ADT_RES` | `URI_PREFIX` | `/sap/bc/adt/` |
| `S_DEVELOP` | `DEVCLASS` | Target packages |
| `S_DEVELOP` | `OBJTYPE` | Required object types |
| `S_CTS_ADMI` | `CTS_ADMFCT` | For transport management |
| `S_TABU_DIS` | `DICBERCLS` | For DDIC objects and `adt_read_table` |

For ATC execution: `S_ATC_ROLE` or equivalent.

---

## Installation

```bash
# Clone or copy the project
cd sap-adt-mcp-server

# Install dependencies
npm install

# Build
npm run build
```

---

## Configuration

Copy `.env.example` to `.env` and fill in your SAP system details:

```bash
cp .env.example .env
```

```env
SAP_URL=https://your-sap-host:443
SAP_CLIENT=100
SAP_USER=technical_user
SAP_PASSWORD=your_password
SAP_LANGUAGE=EN
SAP_TLS_VERIFY=true
LOG_LEVEL=info
REQUEST_TIMEOUT=60000
```

If no HTTP port is available, see [RFC transport](#rfc-transport).

**Security:** Never commit `.env` to version control.

---

## RFC transport

Optional alternative to HTTP: use it if no HTTP port is open to the SAP system but Eclipse ADT reaches it through an RFC destination. ADT requests are tunnelled through the function module `SADT_REST_RFC_ENDPOINT` by a small Java/SAP JCo bridge (`bridge/AdtRfcBridge.java`) that the server starts as a subprocess. The same tools are used; two additional table tools work only in this mode.

### Prerequisites

- JDK 21+ with `javac` (the bridge is compiled with `--release 21`)
- SAP JCo jar (`com.sap.conn.jco_*.jar`) and the native library (`libsapjco3.*`). Neither is shipped in this repository; an Eclipse ADT installation provides them in its p2 pool (`~/.p2/pool/plugins/`).
- JVM architecture matching the native library (e.g. an arm64 JVM for `macosx.aarch64`). Set `SAP_JAVA_BIN` if `java` on the `PATH` differs; startup aborts with a message on mismatch.

### Setup

```bash
# macOS arm64 example: extract the native library
mkdir -p ~/jco-native
unzip -j -o ~/.p2/pool/plugins/com.sap.conn.jco.macosx.aarch64_*.jar lib/libsapjco3.dylib -d ~/jco-native

# build server and bridge
npm run build
SAP_JCO_JAR=/abs/path/com.sap.conn.jco_3.1.13.jar npm run build:bridge
```

```env
SAP_TRANSPORT=rfc
SAP_RFC_ASHOST=sap-host.example.com
SAP_RFC_SYSNR=00
SAP_JCO_JAR=/abs/path/com.sap.conn.jco_3.1.13.jar
SAP_JCO_NATIVE_DIR=/abs/path/jco-native
SAP_CLIENT=100
SAP_USER=your_user
SAP_PASSWORD="your_password"
SAP_LANGUAGE=EN
```

| Variable | Default | Description |
|---|---|---|
| `SAP_TRANSPORT` | `http` | `http` or `rfc` |
| `SAP_RFC_ASHOST`, `SAP_RFC_SYSNR` | — | Application server and system number (required) |
| `SAP_RFC_GWHOST`, `SAP_RFC_GWSERV` | — | Optional gateway settings |
| `SAP_JCO_JAR`, `SAP_JCO_NATIVE_DIR` | — | JCo jar and directory of the native library (required) |
| `SAP_JAVA_BIN` | `java` | Java executable |
| `SAP_RFC_BRIDGE_CLASSES` | `dist/bridge` | Directory with the compiled bridge |

### Behaviour

- `SAP_URL` is ignored. Logon happens via RFC; HTTP authorization and cookie headers are not forwarded.
- If `SAP_TRANSPORT=rfc` is already set in the environment of the launching project, the installation's own `.env` is **not** loaded, so settings of another system cannot leak in. All required variables must then come from that environment.
- Missing bridge, JCo jar or native library aborts startup. There is no silent fallback to HTTP.

### Table tools (RFC only)

| Tool | Function module | Notes |
|---|---|---|
| `adt_get_table_fields` | `DDIF_FIELDINFO_GET` | Optional `fields` filter; unknown names are returned in `unknownFields` |
| `adt_read_table` | `RFC_READ_TABLE` | One table, no joins, max. 512 bytes per row (pass `fields` for wide tables), max. 1000 rows per call (`skipRows` for paging), needs `S_TABU_DIS` |

`where` is an Open SQL condition without the keyword `WHERE`. It is split into 72-character lines at whitespace outside literals; a single token longer than 72 characters or an unbalanced quote is rejected. With the HTTP transport both tools return `ADT_RFC_REQUIRED`.

### Older releases (SAP_BASIS 740)

- No ADT data preview (`adt_run_sql_query`) and no `/ddic/tables` endpoint: use the table tools above.
- No ADT endpoint for Simple Transformations / XSLT: they are handled through RFC, see below.
- `adt_syntax_check_source` needs an existing object as `contextUri`.

### Transformations via RFC

`XSLT_MAINTENANCE_RFC` handles Simple Transformations and XSLT programs where ADT has no endpoint:

- `adt_create_st` / `adt_create_xslt` fall back to it and create an **inactive** version (from `source`, otherwise a skeleton). Existing objects are never overwritten.
- `adt_read_transformation` returns source, package, description and state (the inactive version if there is one).
- `adt_write_transformation` replaces the complete source and activates it (`activate: false` only saves). No lock handle needed. On syntax errors the new source stays inactive and the active version is unchanged; SAP returns only the message id, not the error lines.
- Source lines are limited to 255 characters. Transportable packages require `transportNumber`.
- `adt_write_object`, `adt_lock_object` and `adt_activate_object` do not work for these objects, and there is no delete tool (use SE80/STRANS).
- Live verified for `$TMP` objects on SAP_BASIS 740. Not verified: transport requests, lock conflicts, running the generated transformation.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `build:bridge` hint from a transformation tool | Outdated bridge class: run `npm run build:bridge` and restart the MCP client session |
| `404` for a table tool | Outdated bridge class: run `npm run build:bridge` and restart the MCP client session |
| `RFC bridge exited` | Check the JCo paths and Java version; `LOG_LEVEL=debug` shows the bridge output |
| "SAP_JAVA_BIN ... is a JVM for ..." | Use a JVM with the same architecture as the native library |
| "Objektkatalogeintrag ... existiert nicht" / "developer license" on create | The user may lack a developer key (SSCR) |

---

## Start

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

---

## Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/path/to/sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_URL": "https://your-sap-host:443",
        "SAP_CLIENT": "100",
        "SAP_USER": "your_user",
        "SAP_PASSWORD": "your_password",
        "SAP_LANGUAGE": "EN",
        "SAP_TLS_VERIFY": "true",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

---

## Claude Code Integration

```bash
claude mcp add --scope user sap-adt -- node /path/to/sap-adt-mcp-server/dist/index.js
claude mcp list
```

The server reads the `.env` file of its installation directory. To use different systems per project, register it with `--scope local` (or in a project `.mcp.json`) and pass the variables with `-e KEY=value`. `mcpServers` in `settings.json` is not read. After `npm run build`, start a new session.

---

## Available Tools

### Repository
| Tool | Description |
|------|-------------|
| `adt_search_object` | Search objects by name pattern |
| `adt_read_object` | Read object source code |
| `adt_write_object` | Write object source code (inline `source`, or `sourceFilePath` for large sources) |
| `adt_create_object` | Create generic object (`CLAS/OC`, `INTF/OI`, `PROG/P`, `FUGR/F`, `DDLS/DF`, `BDEF/BDO`) |
| `adt_delete_object` | Delete object |

### Activation
| Tool | Description |
|------|-------------|
| `adt_activate_object` | Activate single object |
| `adt_activate_mass` | Activate multiple objects (optional `timeoutMs`) |

### Syntax
| Tool | Description |
|------|-------------|
| `adt_syntax_check` | Check existing object |
| `adt_syntax_check_source` | Check unsaved source against an existing object (`contextUri`) |

### Locks
| Tool | Description |
|------|-------------|
| `adt_lock_object` | Acquire edit lock |
| `adt_unlock_object` | Release lock |
| `adt_get_lock_owner` | Check lock status (briefly locks unlocked objects in a separate session) |

### Transport
| Tool | Description |
|------|-------------|
| `adt_list_transport_requests` | List open transports |
| `adt_create_transport_request` | Create transport |
| `adt_release_transport_request` | Release transport |
| `adt_delete_transport_request` | Delete transport |

### Package
| Tool | Description |
|------|-------------|
| `adt_list_packages` | List packages |
| `adt_create_package` | Create package |
| `adt_get_package_content` | Get package contents |

### Analysis
| Tool | Description |
|------|-------------|
| `adt_where_used` | Find usages of object |
| `adt_dependency_graph` | Dependency graph |
| `adt_get_object_metadata` | Object metadata |
| `adt_compare_versions` | Version history |

### ABAP-Specific
| Tool | Description |
|------|-------------|
| `adt_create_class` | Create ABAP class |
| `adt_create_interface` | Create interface |
| `adt_create_report` | Create report/program |
| `adt_create_function_group` | Create function group |
| `adt_create_function_module` | Create function module |
| `adt_create_test_include` | Create the test class include of an existing class |

### Table Data
| Tool | Description |
|------|-------------|
| `adt_run_sql_query` | Read-only Open SQL `SELECT` via ADT data preview |
| `adt_get_table_fields` | Field list of a table/structure/view (RFC only) |
| `adt_read_table` | Rows of a single table (RFC only) |

### CDS
| Tool | Description |
|------|-------------|
| `adt_create_cds_view` | Create CDS view |
| `adt_analyze_cds` | Analyze CDS view |
| `adt_get_cds_dependencies` | CDS dependencies |

### OData
| Tool | Description |
|------|-------------|
| `adt_publish_service_binding` | Publish service binding |
| `adt_unpublish_service_binding` | Unpublish binding |

### ATC
| Tool | Description |
|------|-------------|
| `adt_run_atc` | Run ATC checks |
| `adt_get_atc_result` | Get ATC results |

### Unit Tests
| Tool | Description |
|------|-------------|
| `adt_run_unit_tests` | Execute unit tests (optional `timeoutMs`) |
| `adt_get_unit_test_result` | Re-run and get results |

### Transformations & XML
| Tool | Description |
|------|-------------|
| `adt_create_st` | Create Simple Transformation (ADT; RFC fallback) |
| `adt_create_xslt` | Create XSLT program (ADT; RFC fallback) |
| `adt_read_transformation` | Read ST/XSLT source and attributes (RFC only) |
| `adt_write_transformation` | Write and activate ST/XSLT source (RFC only) |
| `adt_generate_st_from_xml` | Generate ST skeleton from XML |
| `adt_analyze_xml_schema` | Analyze XSD schema |
| `adt_validate_xml_against_xsd` | Validate XML against XSD |
| `adt_compare_xml_structures` | Compare XML structures |

---

## Agent Skill

[`docs/skills/abap-tooling/SKILL.md`](docs/skills/abap-tooling/SKILL.md) (German) tells an agent how to use these tools correctly: lock/write/activate order, class includes, reading check results, table access, known limitations and common ABAP activation pitfalls. It is optional; the server works without it.

Install it for all projects (Claude Code), from the repository directory:

```bash
mkdir -p ~/.claude/skills/abap-tooling
cp docs/skills/abap-tooling/SKILL.md ~/.claude/skills/abap-tooling/
```

For a single project, copy it to `.claude/skills/abap-tooling/` inside that project instead. Start a new session afterwards.

Usage notes:

- The skill loads when a task matches its description; you can also call it with `/abap-tooling`.
- It assumes the server is registered as `sap-adt` (tool prefix `mcp__sap-adt__`). Adjust the text if you use another name.
- The coding convention section is an example: replace it with your team's rules.
- It tells the agent to record suspected server bugs in `sap-adt-bugs.md` in the current project.
- The installed copy does not update itself: copy it again after pulling a new version (this overwrites local changes).
- With other MCP clients, add the file's content to the agent instructions.

---

## Usage Examples

### Reading and modifying a class

```
1. Search for the class:
   adt_search_object { query: "ZCL_MY*", objectType: "CLAS/OC" }

2. Read the source:
   adt_read_object { objectUri: "/sap/bc/adt/oo/classes/zcl_my_class" }

3. Acquire lock (returns lockHandle and, for transportable objects, corrNr):
   adt_lock_object { objectUri: "/sap/bc/adt/oo/classes/zcl_my_class" }

4. Write changes:
   adt_write_object {
     objectUri: "/sap/bc/adt/oo/classes/zcl_my_class",
     source: "...",
     lockHandle: "...",
     transportNumber: "DEVK900001"
   }
   # Large sources: pass sourceFilePath (absolute local path, max 10 MB, no .env)
   # instead of source, so the content is not sent as a tool argument.

5. Release the lock (before activation):
   adt_unlock_object { objectUri: "...", lockHandle: "..." }

6. Syntax check:
   adt_syntax_check { objectUri: "..." }

7. Activate:
   adt_activate_object { objectUri: "...", objectName: "ZCL_MY_CLASS" }
```

### ABAP Unit Test workflow

```
1. Run tests:
   adt_run_unit_tests { objectUri: "...", objectName: "ZCL_MY_CLASS" }
   # Long runs: add timeoutMs (1000-1800000 ms) to override REQUEST_TIMEOUT for this call only.
   # It applies per HTTP request; if several URI strategies are tried, the total can be a multiple.

2. If failures: read source, modify, write, syntax check, activate

3. Re-run tests:
   adt_run_unit_tests { objectUri: "...", objectName: "ZCL_MY_CLASS" }
```

---

## Troubleshooting

### Connection refused
- Verify `SAP_URL` is correct and accessible
- Check SAP ADT service is active: transaction `SICF`, service `/sap/bc/adt`
- Try `curl -u user:pass https://your-sap:443/sap/bc/adt/discovery`

### 401 Unauthorized
- Verify username and password
- Check user has `S_ADT_RES` authorization

### 403 Forbidden (not CSRF)
- User lacks required authorization for the operation
- Check `S_DEVELOP` authorizations

### Known limitations
- `BDEF/BDO`: creating and writing works, activation fails
- `adt_create_st` / `adt_create_xslt` over HTTP(S): creation fails with `ADT_NOT_FOUND` (no verified ADT endpoint); use the RFC transport
- `adt_create_object` does not support database tables
- `adt_validate_xml_against_xsd` is a stub

### TLS certificate errors
- Set `SAP_TLS_VERIFY=false` for development (NOT for production)
- Or provide `SAP_CA_BUNDLE=/path/to/ca.crt` with the SAP CA certificate

### Lock conflicts
- Another user (or IDE) holds the lock
- Use `adt_get_lock_owner` to identify the lock holder
- Locks expire automatically after ~30 minutes

### Activation errors
- Run `adt_syntax_check` first to identify syntax errors
- Check for dependent objects that also need activation

---

## Development

```bash
# Run tests
npm test

# Unit tests only
npm run test:unit

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.
See [docs/adt-endpoints.md](docs/adt-endpoints.md) for ADT REST API reference.

---

## Security Notes

- Credentials are only read from environment variables / `.env` files
- Passwords, cookies, and CSRF tokens are never written to logs
- All ADT URIs are validated before use (path traversal prevention)
- Input validated via Zod schemas on all tool calls
- TLS verification enabled by default

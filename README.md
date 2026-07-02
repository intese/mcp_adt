# sap-adt-mcp-server

Production-ready MCP (Model Context Protocol) server for SAP ABAP Development Tools (ADT).

Enables MCP-compatible clients to directly read, write, activate, and analyze SAP ABAP objects via official SAP ADT REST APIs — without Eclipse, without GUI automation.

---

## Features

- **40+ MCP Tools** for the full ABAP development lifecycle
- Read and write ABAP source code (classes, interfaces, reports, function groups, CDS)
- Syntax check, activation, ATC analysis, ABAP Unit Tests
- Transport request management
- Package hierarchy navigation
- Where-used and dependency analysis
- CDS view analysis and OData service binding management
- Simple Transformation and XSLT support (incl. XML/UBL/ZUGFeRD helpers)
- Robust session management with CSRF token handling and retry logic
- Structured logging (Winston), Zod input validation, full TypeScript types

---

## Requirements

### System
- Node.js 22+
- SAP ECC 6.07+ or S/4HANA 2020+
- SAP ADT service enabled (`/sap/bc/adt/discovery` accessible)

### SAP Authorizations

The technical user requires at minimum:

| Authorization Object | Field | Value |
|---------------------|-------|-------|
| `S_ADT_RES` | `URI_PREFIX` | `/sap/bc/adt/` |
| `S_DEVELOP` | `DEVCLASS` | Target packages |
| `S_DEVELOP` | `OBJTYPE` | Required object types |
| `S_CTS_ADMI` | `CTS_ADMFCT` | For transport management |
| `S_TABU_DIS` | `DICBERCLS` | For DDIC objects |

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

**Security:** Never commit `.env` to version control.

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

Add to `~/.claude/settings.json` (or project-level `.claude/settings.json`):

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
        "SAP_PASSWORD": "your_password"
      }
    }
  }
}
```

Or use a `.env` file in the server directory and run with:
```json
{
  "command": "node",
  "args": ["dist/index.js"],
  "cwd": "/path/to/sap-adt-mcp-server"
}
```

---

## Available Tools

### Repository
| Tool | Description |
|------|-------------|
| `adt_search_object` | Search objects by name pattern |
| `adt_read_object` | Read object source code |
| `adt_write_object` | Write object source code |
| `adt_create_object` | Create generic object |
| `adt_delete_object` | Delete object |

### Activation
| Tool | Description |
|------|-------------|
| `adt_activate_object` | Activate single object |
| `adt_activate_mass` | Activate multiple objects |

### Syntax
| Tool | Description |
|------|-------------|
| `adt_syntax_check` | Check existing object |
| `adt_syntax_check_source` | Check source string |

### Locks
| Tool | Description |
|------|-------------|
| `adt_lock_object` | Acquire edit lock |
| `adt_unlock_object` | Release lock |
| `adt_get_lock_owner` | Check lock status |

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
| `adt_run_unit_tests` | Execute unit tests |
| `adt_get_unit_test_result` | Re-run and get results |

### Transformations & XML
| Tool | Description |
|------|-------------|
| `adt_create_st` | Create Simple Transformation |
| `adt_create_xslt` | Create XSLT program |
| `adt_generate_st_from_xml` | Generate ST skeleton from XML |
| `adt_analyze_xml_schema` | Analyze XSD schema |
| `adt_validate_xml_against_xsd` | Validate XML against XSD |
| `adt_compare_xml_structures` | Compare XML structures |

---

## Usage Examples

### Reading and modifying a class

```
1. Search for the class:
   adt_search_object { query: "ZCL_MY*", objectType: "CLAS/OC" }

2. Read the source:
   adt_read_object { objectUri: "/sap/bc/adt/classes/classes/ZCL_MY_CLASS" }

3. Acquire lock:
   adt_lock_object { objectUri: "/sap/bc/adt/classes/classes/ZCL_MY_CLASS" }

4. Write changes:
   adt_write_object {
     objectUri: "/sap/bc/adt/classes/classes/ZCL_MY_CLASS",
     source: "...",
     lockHandle: "...",
     transportNumber: "DEVK900001"
   }

5. Syntax check:
   adt_syntax_check { objectUri: "..." }

6. Activate:
   adt_activate_object { objectUri: "...", objectName: "ZCL_MY_CLASS" }

7. Release lock:
   adt_unlock_object { objectUri: "...", lockHandle: "..." }
```

### ABAP Unit Test workflow

```
1. Run tests:
   adt_run_unit_tests { objectUri: "...", objectName: "ZCL_MY_CLASS" }

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

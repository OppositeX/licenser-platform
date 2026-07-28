# @gloo/licenser-mcp

Model Context Protocol server for the **Licenser** platform. Gives an agent
first-class tools to operate the licensing backend: issue and manage licenses,
inspect activations, manage products/plans/releases, read events and validation
stats, and run real validations.

## Tools

| Tool | Kind | What it does |
|---|---|---|
| `licenser_list_licenses` | read | List licenses (filter by status / product / email) |
| `licenser_get_license` | read | One license + plan, product, activations |
| `licenser_list_activations` | read | Activation rows for a license |
| `licenser_list_products` | read | All products |
| `licenser_list_plans` | read | Plans (optionally per product) |
| `licenser_list_releases` | read | Product releases, newest first |
| `licenser_recent_events` | read | Recent activity feed |
| `licenser_validation_stats` | read | Validation counts by result over N days |
| `licenser_issue_license` | write | Issue a license (returns plaintext key once) |
| `licenser_set_license_status` | write | active / suspended / revoked / expired |
| `licenser_deactivate_activation` | write | Free a seat by id or key+domain |
| `licenser_create_product` | write | Create a product |
| `licenser_validate` | verify | Real call against live `/api/v2/validate` |

## Configuration

The server talks to the **same Supabase database** as the platform using the
**service-role key**, which bypasses RLS. Treat the config as an admin
credential — anything that can run this server can mint and revoke licenses.

| Env var | Required | Notes |
|---|---|---|
| `LICENSER_SUPABASE_URL` | yes | Falls back to `NEXT_PUBLIC_SUPABASE_URL` |
| `LICENSER_SUPABASE_SERVICE_ROLE_KEY` | yes | Falls back to `SUPABASE_SERVICE_ROLE_KEY` |
| `LICENSER_BASE_URL` | no | For `licenser_validate`; defaults to the prod URL |

## Build

```sh
npm install
npm -w @gloo/licenser-mcp run build
```

## Register with Claude Code

Add to `.mcp.json` (project scope) or your user config. Secrets are read from
your shell env via `${VAR}` expansion — do not hardcode them:

```json
{
  "mcpServers": {
    "licenser": {
      "command": "node",
      "args": ["packages/licenser-mcp/dist/index.js"],
      "env": {
        "LICENSER_SUPABASE_URL": "${LICENSER_SUPABASE_URL}",
        "LICENSER_SUPABASE_SERVICE_ROLE_KEY": "${LICENSER_SUPABASE_SERVICE_ROLE_KEY}",
        "LICENSER_BASE_URL": "https://licenser.gloo.ooo"
      }
    }
  }
}
```

Then export the two secrets in your shell (or a sourced `.env`) before starting
the agent. Verify with `/mcp` — the `licenser` server should list the tools above.

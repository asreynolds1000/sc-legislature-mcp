# sc-legislature-mcp

SC civic intelligence MCP server. 17 tools across two data sources:
- **scstatehouse.gov** — video archive, meeting schedules, floor calendar, status activity, committees, member detail
- **Open States API v3** — find_representatives (state + federal), search_bills, get_bill, get_legislator_bills, search_legislators

Pairs with `sc-elections-mcp` for the full SC civic data picture (legislature here, campaign finance + ethics there).

## Open States API

**Key:** `f8747e7f-eaaf-4f16-994a-8daf6a9d7bd8` (also in `~/.claude.json` env)
**Base URL:** `https://v3.openstates.org`
**Rate limits:** 500 req/day, 1 req/sec — design tools to be efficient; cache where possible.

**Key endpoints:**

| Endpoint | Key Params | Notes |
|----------|-----------|-------|
| `GET /people.geo` | `lat`, `lng` | Federal + state reps for a location. One call. |
| `GET /people` | `jurisdiction`, `name`, `district` | Search legislators |
| `GET /bills` | `jurisdiction`, `session`, `sponsor`, `q` | SC session = `2025-2026` |
| `GET /bills/{jurisdiction}/{session}/{bill_id}` | — | Full bill detail |
| `GET /committees` | `jurisdiction`, `chamber` | Use `include=memberships` (not `members`) |

**Include options vary by endpoint** — wrong value returns a 422.

## scstatehouse.gov

Rate limiting: 1 req/sec with exponential backoff (already implemented).

## Commands

```bash
npm run build   # Compile TypeScript
npm run dev     # Watch mode
```

# sc-legislature-mcp

SC civic intelligence MCP server. 18 tools across two data sources:
- **scstatehouse.gov** — video archive, meeting schedules, floor calendar, status activity, committees, member detail
- **Open States API v3** — find_representatives (state + federal), search_bills, get_bill, get_legislator_bills, search_legislators

Pairs with `sc-elections-mcp` for the full SC civic data picture (legislature here, campaign finance + ethics there).

## Open States API

**Key:** read from the `OPEN_STATES_API_KEY` environment variable (see `src/api/open-states-client.ts`). Do not write the key into this file.
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

**Cosponsor lists can come back empty.** 2026-11-03: `search_bills` and `get_bill` returned `cosponsors: []` for H 4397, while the scstatehouse.gov bill page lists seven (Frank, Burns, Chumley, Haddon, Morgan, Gilreath, Beach). The cause is not traced yet: it could be Open States data or a missing `include`. Until it is fixed, read sponsors from `https://www.scstatehouse.gov/sess126_2025-2026/bills/<number>.htm`.

## scstatehouse.gov

Rate limiting: 1 req/sec with exponential backoff (already implemented).

## Commands

```bash
npm run build   # Compile TypeScript
npm run dev     # Watch mode
```

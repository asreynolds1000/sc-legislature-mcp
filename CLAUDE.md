# sc-legislature-mcp (being reframed → sc-civic-mcp)

## Planned Reframe

Expanding from "SC Legislature scraper" to "SC civic intelligence layer":
- **scstatehouse.gov** → proceedings: video archive, meeting schedules, floor calendar, status activity
- **Open States API** → representation + legislation: address→reps (state + federal), bill search, sponsorships
- **sc-elections-mcp stays separate** → campaign finance, ethics disclosures

New positioning: "the legislative half of SC civic data — pair with sc-elections-mcp for the full picture."
LegiScan becomes an optional companion rather than required (Open States covers bills adequately).

## Open States API

**Key:** `f8747e7f-eaaf-4f16-994a-8daf6a9d7bd8`
**Base URL:** `https://v3.openstates.org`

**Rate limits (Default/new user tier):**
- 500 requests/day
- 1 request/second

These are tight. Design tools to be efficient:
- Combine calls where possible (e.g., `people.geo` returns federal + state in one call)
- Cache aggressively — rep data changes infrequently
- Expose the daily limit in a `get_metrics` tool or error messages so the user knows when they're close

## Open States Endpoints

| Endpoint | Key Params | Notes |
|----------|-----------|-------|
| `GET /people.geo` | `lat`, `lng` | Federal + state reps for a location. One call. |
| `GET /people` | `jurisdiction`, `name`, `district` | Search legislators |
| `GET /bills` | `jurisdiction`, `session`, `sponsor`, `q` | SC session = `2025-2026`. 3,379 bills current session. |
| `GET /bills/{jurisdiction}/{session}/{bill_id}` | — | Full bill detail |
| `GET /committees` | `jurisdiction`, `chamber` | Use `include=memberships` (not `members`) |
| `GET /events` | `jurisdiction`, `before`, `after` | Upcoming hearings with agenda |
| `GET /jurisdictions/{id}` | `include=legislative_sessions` | Session list |

**Include options vary by endpoint** — `memberships`/`links`/`sources` for committees; `sponsorships`/`abstracts`/`actions` for bills. Wrong include value returns a 422.

## Existing Rate Limiting

scstatehouse.gov scraping: 1 req/sec with exponential backoff (already implemented).
Open States: needs same treatment — 1 req/sec hard limit enforced by API.

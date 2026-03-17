# sc-legislature-mcp

MCP server for the South Carolina Legislature (scstatehouse.gov). Provides committee hearing video archives, meeting schedules, floor calendars, status activity, committee rosters, and member details.

**The video archive is the killer feature** — no other legislative data service (LegiScan, Open States, etc.) provides direct links to ~15,000 committee hearing and floor session recordings.

Designed as a complement to:
- **[legiscan-mcp](https://github.com/sh-patterson/legiscan-mcp)** — bills, votes, sponsors, search
- **[sc-elections-mcp](https://github.com/asreynolds1000/sc-elections-mcp)** — campaign finance, ethics disclosures

## Tools (12)

### Video Tools
| Tool | Description |
|------|-------------|
| `search_hearing_videos` | Search video archives by committee, date range, chamber. Returns direct MP4 URLs. |
| `get_hearing_video` | Get video URL and metadata for a specific meeting by key. |
| `get_committee_feed` | Get RSS/podcast feed URLs for committee hearing videos. |
| `get_video_schedule` | Get upcoming live broadcast schedule. |

### Schedule & Activity Tools
| Tool | Description |
|------|-------------|
| `get_meetings` | Committee meeting schedule with agendas, bills, times, rooms. |
| `get_status_activity` | Bill actions in a date range — "what happened this week." |
| `get_calendar` | Daily floor calendar — bills scheduled for debate. |
| `get_new_introductions` | Newly filed bills by date. |

### Committee & Member Tools
| Tool | Description |
|------|-------------|
| `list_committees` | Standing committees with members, chairs, contact info. |
| `get_member_detail` | Legislator profile: contact, photo, bio, committees, district map. |
| `find_legislator_by_address` | Find state legislators by address — "who represents me?" |
| `get_county_delegation` | County delegation roster (all state legislators for a county). |

## Installation

```bash
npm install -g sc-legislature-mcp
```

Or use with Claude Code:
```bash
claude mcp add sc-legislature-mcp -- npx sc-legislature-mcp
```

## Configuration

No API keys or authentication required. All data is public.

Optional environment variable:
- `SC_LEGISLATURE_USER_AGENT` — Custom User-Agent string for HTTP requests

## Rate Limiting

The server rate-limits to 1 request/second with exponential backoff retries. All responses are cached in memory with appropriate TTLs.

## Development

```bash
npm install
npm run dev      # Start with tsx (hot reload)
npm test         # Run tests (58 tests)
npm run build    # Compile TypeScript
```

## License

MIT

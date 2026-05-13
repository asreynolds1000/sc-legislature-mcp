# sc-legislature-mcp

SC civic intelligence MCP server — the legislative half of SC civic data. Covers who represents you (state + federal), what they're doing (bills, committees, sponsorships), and what's happening in the legislature (hearings, schedules, video archive).

**The video archive is the killer feature** — no other legislative data service (LegiScan, Open States, etc.) provides direct links to ~15,000 committee hearing and floor session recordings.

Designed as a complement to:
- **[sc-elections-mcp](https://github.com/asreynolds1000/sc-elections-mcp)** — campaign finance, ethics disclosures

## Tools (18)

### Open States Tools (representation + legislation)
| Tool | Description |
|------|-------------|
| `find_representatives` | Address → state + federal reps (SC Senate/House + US Senators/Rep). Returns `ocd_person_id` for bill lookups. |
| `search_bills` | Search SC bills by keyword, sponsor, subject, or date. 3,379 bills in current session. |
| `get_bill` | Full bill detail: action history, sponsors, abstract. Accepts `S 330`, `H1234`, or ocd-bill/... UUID. |
| `get_legislator_bills` | All bills sponsored by a legislator this session. Takes `ocd_person_id`. |
| `search_legislators` | Find SC state legislators by name, district, or chamber. |

### Video Tools
| Tool | Description |
|------|-------------|
| `search_hearing_videos` | Search video archives by committee, date range, chamber. Returns direct MP4 URLs. |
| `get_hearing_video` | Get video URL and metadata for a specific meeting by key. |
| `get_committee_feed` | Get RSS/podcast feed URLs for committee hearing videos. |
| `get_video_schedule` | Today's and upcoming sessions with meeting keys, stream URLs, and download URLs. |
| `get_live_sessions` | Currently live-streaming sessions with HLS stream URLs. |

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
| `find_legislator_by_address` | Find SC state legislators by address (returns SC member codes for `get_member_detail`). |
| `get_county_delegation` | County delegation roster (all state legislators for a county). |

## Installation

```bash
npm install -g sc-legislature-mcp
```

Or use with Claude Code:
```bash
claude mcp add sc-legislature-mcp --env OPEN_STATES_API_KEY=your_key -- npx sc-legislature-mcp
```

## Configuration

**Required:**
- `OPEN_STATES_API_KEY` — Free API key from [openstates.org/api/register/](https://openstates.org/api/register/). Free tier: 500 requests/day, 1 req/sec.

**Optional:**
- `SC_LEGISLATURE_USER_AGENT` — Custom User-Agent string for scstatehouse.gov requests

## Rate Limiting

- **scstatehouse.gov**: 1 req/sec with exponential backoff retries. Responses cached in memory.
- **Open States API**: 1 req/sec, 500 req/day. Legislators cached 7 days, bills 6 hours.
- **Nominatim geocoding** (used by `find_representatives`): 1 req/sec, addresses cached 30 days.

## Development

```bash
npm install
npm run dev      # Start with tsx (hot reload)
npm test         # Run tests
npm run build    # Compile TypeScript
```

## License

MIT

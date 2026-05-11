# LegiScan MCP Server Evaluation

Date: 2026-03-17

## 1. LegiScan MCP Server (`sh-patterson/legiscan-mcp`)

### Repository Maturity

| Metric | Value |
|--------|-------|
| Stars | 0 |
| Forks | 1 |
| Commits | 12 |
| Open Issues | 0 |
| License | MIT |
| Last Updated | March 5, 2026 (v1.0.0) |
| Author | Shawn Patterson (solo developer) |
| npm Package | `legiscan-mcp-server` |

**Assessment:** Very new, single developer, no community. But code quality is solid — TypeScript, Vitest tests (unit + live integration), ESLint/Prettier, CI via GitHub Actions, Docker support. Well-structured with clear separation of concerns.

### Tech Stack

- TypeScript 5.3, Node.js >= 18
- `@modelcontextprotocol/sdk` v1.26.0 (current)
- Zod for input validation
- stdio transport only
- Vitest 4.x for testing

### Tools Exposed (10 total)

#### Composite Tools (3)

**`legiscan_find_legislator`**
- Params: `name` (string, min 2 chars), `state` (2-letter code), `session_id?` (number)
- Returns: Matching legislators with people_id, name, party, role, district, ballotpedia URL
- API calls: getSessionList + getSessionPeople (2 calls)
- Notes: Partial name matching. Auto-resolves current session if session_id omitted.

**`legiscan_get_legislator_votes`**
- Params: `people_id` (number), `bill_ids` (number[], max 100), `chamber?` ("H"/"S"/"A")
- Returns: Per-bill vote positions (Yea/Nay/NV/Absent), roll call details, summary counts
- API calls: getBill for each bill + getRollCall for each vote (batched 10 at a time)
- Notes: This is the highest-value composite — without it you'd need ~80 calls for 10 bills.

**`legiscan_get_primary_authored`**
- Params: `people_id` (number), `session_id?`, `state?`
- Returns: Bills where legislator is primary author (not co-sponsor), with status and description
- API calls: getSponsoredList + getBill for each sponsored bill (batched)

#### Bill Tools (3)

**`legiscan_get_bill`**
- Params: `bill_id` (number)
- Returns: Full bill object: sponsors, history timeline, votes, texts, amendments, supplements, subjects, committee referrals, calendar events, SAST (same-as/similar-to) relationships, progress milestones
- This is the richest single endpoint — returns everything about a bill.

**`legiscan_find_bill_by_number`**
- Params: `state?` (2-letter), `session_id?`, `bill_number` (string)
- Returns: Bill summary (bill_id, number, status, last_action, title, description) or not-found
- Notes: Normalizes bill numbers (AB 858 = AB858 = AB-858). Fetches entire master list and scans — expensive for first call but cached by session.

**`legiscan_get_roll_call`**
- Params: `roll_call_id` (number)
- Returns: Full roll call: date, description, yea/nay/nv/absent counts, passed flag, individual votes per legislator (people_id + vote_text)

#### People Tools (2)

**`legiscan_get_person`**
- Params: `people_id` (number)
- Returns: Full legislator profile: party, role, district, name, and third-party IDs (VoteSmart, OpenSecrets, Ballotpedia, FollowTheMoney, KnowWho, BioGuide)

**`legiscan_get_session_people`**
- Params: `session_id` (number)
- Returns: All legislators active in that session with full Person objects

#### Search Tools (1)

**`legiscan_search`**
- Params: `query` (string), `state?` (2-letter or "ALL"), `year?`, `page?`, `session_id?`
- Returns: Paginated results (50/page): relevance score, state, bill_number, bill_id, title, last_action, URLs
- Notes: Full-text search across bill texts. Year filter supports special values (1=all, 2=current, 3=recent, 4=prior, or exact year).

#### Session Tools (1)

**`legiscan_get_session_list`**
- Params: `state?` (2-letter, omit for all states)
- Returns: Available sessions with session_id, year range, state info, sine_die status

### LegiScan API Endpoints Wrapped

The client wraps these LegiScan Pull API operations:

| API Operation | Client Method | Exposed as Tool? |
|---------------|---------------|-----------------|
| `getSessionList` | `getSessionList()` | Yes |
| `getMasterList` | `getMasterList()` | Indirectly (via findBillByNumber) |
| `getMasterListRaw` | `getMasterListRaw()` | No |
| `getBill` | `getBill()` | Yes |
| `getBillText` | `getBillText()` | No (client method exists, no tool) |
| `getAmendment` | `getAmendment()` | No (client method exists, no tool) |
| `getSupplement` | `getSupplement()` | No (client method exists, no tool) |
| `getRollCall` | `getRollCall()` | Yes |
| `getPerson` | `getPerson()` | Yes |
| `getSessionPeople` | `getSessionPeople()` | Yes |
| `getSponsoredList` | `getSponsoredList()` | Indirectly (via composite) |
| `getSearch` | `getSearch()` | Yes |
| `getSearchRaw` | `getSearchRaw()` | No |
| `getDatasetList` | `getDatasetList()` | No |
| `getDataset` | `getDataset()` | No |
| `getMonitorList` | `getMonitorList()` | No |
| `getMonitorListRaw` | `getMonitorListRaw()` | No |
| `setMonitor` | `setMonitor()` | No |

Notable: `getBillText`, `getAmendment`, `getSupplement` have client methods but NO MCP tools. You can get metadata about texts/amendments via `get_bill`, but can't retrieve the actual document content through the MCP layer. The dataset and monitor (GAITS) operations are also client-only.

### LegiScan API: Free Tier Details

Based on the README, source code comments, and known LegiScan documentation (v1.91 API manual referenced in types):

- **Free tier: 30,000 queries/month** (per README)
- **Pull API** (what this MCP wraps): Request/response, one call at a time
- **Push API** (not wrapped): Webhook-based, real-time updates — requires paid subscription
- **All 50 states + US Congress** covered
- **No per-second rate limit documented**, but the MCP batches 10 concurrent requests as a safety measure
- **Paid tiers** exist (LegiScan subscription/GAITS service) but pricing is not public — requires contacting LegiScan
- Free tier likely has access to all Pull API operations (the data is public legislative record)
- Dataset bulk downloads may be restricted to paid tier

### SC Coverage

LegiScan covers all 50 states including South Carolina. Based on the session numbering in our HAR analysis (session 126 = 2025-2026), LegiScan would have the current SC session. LegiScan typically has:
- All bills filed in the current session
- Sponsor information
- Full bill text
- Roll call votes
- Committee referrals
- Amendment tracking
- Status/progress timeline

Data freshness: LegiScan scrapes state legislature sites and updates typically within 24 hours of official state updates. For SC, this means data from scstatehouse.gov is mirrored with slight delay.

---

## 2. Comparison: LegiScan MCP vs. Our HAR Analysis Tool List

### What LegiScan MCP COVERS

| Our Tier 1 Tool | LegiScan Coverage | Quality |
|-----------------|-------------------|---------|
| **search_bills** | `legiscan_search` + `legiscan_find_bill_by_number` | GOOD — full-text search across all states, bill number lookup with normalization |
| **get_bill_details** | `legiscan_get_bill` | EXCELLENT — returns sponsors, full history, votes, texts, amendments, supplements, subjects, committee referrals, calendar events, cross-references. Richer than what HTML scraping would yield. |
| **search_votes** | `legiscan_get_legislator_votes` (by legislator) + `legiscan_get_roll_call` (by roll call ID) | GOOD — individual roll calls with per-member votes. Can search by bill (get_bill returns vote references). Missing: search by chamber for all votes in a session. |
| **get_vote_detail** | `legiscan_get_roll_call` | EXCELLENT — full roll call with individual legislator votes |
| **list_members** | `legiscan_get_session_people` | GOOD — all legislators in a session with party, role, district |
| **get_member** | `legiscan_get_person` | GOOD — profile with third-party IDs (VoteSmart, OpenSecrets, Ballotpedia, FollowTheMoney). Missing: photo URL, bio text, contact info, committee assignments. |
| **search_by_sponsor** | `legiscan_get_primary_authored` + `getSponsoredList` (client only) | GOOD — primary author filter is a nice bonus. Co-sponsor list available too. |

| Our Tier 2 Tool | LegiScan Coverage | Quality |
|-----------------|-------------------|---------|
| **get_meetings** | NOT AVAILABLE | LegiScan API has no committee meeting/hearing endpoint |
| **get_status_activity** | PARTIAL — `legiscan_search` with year filter, or `getMasterList` (client only) | WEAK — no date-range activity report. Would need to poll master list and diff. |
| **list_committees** | NOT AVAILABLE as standalone | Committee names appear in bill referrals but no dedicated committee listing |
| **find_legislators** | NOT AVAILABLE | LegiScan has no address-based legislator lookup (Open States does) |
| **get_calendar** | PARTIAL — bill calendar events in `get_bill` response | WEAK — only shows calendar events for a specific bill, not the full floor calendar |

| Our Tier 3 Tool | LegiScan Coverage | Quality |
|-----------------|-------------------|---------|
| **search_full_text** | `legiscan_search` | GOOD — searches bill texts. Does NOT search journals, code of laws, constitution, or budget (those are scstatehouse.gov specific). |
| **get_bill_text** | `getBillText()` client method exists but NO MCP tool | GAP — client can fetch base64-encoded bill text but it's not exposed as a tool |
| **get_introductions** | NOT AVAILABLE | No new-introductions-by-date endpoint |
| **get_delegations** | NOT AVAILABLE | SC-specific county delegation feature not in LegiScan |
| **get_ratifications** | PARTIAL — bill status field shows if signed into law | WEAK — no dedicated ratifications/acts listing |

### What LegiScan MCP DOES NOT Cover

1. **Committee meetings and hearing schedules** — This is a significant gap. scstatehouse.gov `/meetings.php` is one of the most useful endpoints for tracking legislative activity. LegiScan's API simply doesn't have meeting data.

2. **Floor calendars** — What bills are scheduled for debate today. Only available per-bill, not as a daily calendar view.

3. **Address-based legislator lookup** — "Who represents me?" Not in LegiScan. Open States has this via lat/lng.

4. **Committee rosters** — No standalone committee listing. You can see committee names in bill referrals but can't list "who's on the Judiciary Committee."

5. **Status activity reports** — "What happened this week in the legislature?" No date-range activity report.

6. **New introductions by date** — No endpoint for "what was filed today/this week."

7. **Bill full text retrieval** — The client method exists but isn't exposed as an MCP tool. Easy to fix by adding a tool wrapper.

8. **Amendment/supplement document retrieval** — Same as above — client methods exist, no MCP tools.

9. **SC-specific features** — County delegations, journals, legislative manual, code of laws search, state register. These are all scstatehouse.gov-specific.

10. **Video/streaming** — Not relevant for data extraction.

11. **Contact information** — LegiScan doesn't have legislator email/phone. scstatehouse.gov does.

12. **Legislator photos** — Not in LegiScan data.

13. **District maps** — Not in LegiScan data.

### Quality of Coverage Where It Does Cover

For the areas LegiScan covers, the data quality is **generally better than scraping** because:
- **Structured JSON** vs. HTML table parsing — no fragile parsers needed
- **Normalized data** — consistent field names across all 50 states
- **Third-party ID cross-references** — VoteSmart, OpenSecrets, Ballotpedia, FollowTheMoney
- **Historical data** — easy access to prior sessions
- **Cross-state queries** — search across all states at once

The tradeoff is **data freshness** — LegiScan scrapes state sites and re-publishes, so there's always a lag (typically <24 hours but can be longer for some states).

---

## 3. Open States MCP (`ag2-mcp-servers/open-states-api-v3`)

### Repository Maturity

| Metric | Value |
|--------|-------|
| Stars | 0 |
| Forks | 0 |
| Commits | 3 |
| License | Not specified |
| Last Updated | ~June 2025 |
| Generator | AG2 auto-generated from OpenAPI spec |

**Assessment:** Auto-generated code, not hand-tuned. Uses AG2's MCPProxy framework (Python + FastAPI). Extremely minimal — 3 commits, no documentation beyond setup. Not production-ready.

### Tools Exposed (11 endpoints mapped as tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `bills_search` | jurisdiction, session, chamber, identifier, classification, subject, updated_since, created_since, action_since, sort, sponsor, sponsor_classification, q, include, page, per_page | Search/filter bills |
| `bill_detail_by_id` | openstates_bill_id, include | Get bill by Open States internal ID |
| `bill_detail` | jurisdiction, session, bill_id, include | Get bill by state/session/number |
| `committee_list` | jurisdiction, classification, parent, chamber, include, page, per_page | List committees |
| `committee_detail` | committee_id, include | Get committee details |
| `event_list` | jurisdiction, deleted, before, after, require_bills, include, page, per_page | List legislative events |
| `event_detail` | event_id, include | Get event details |
| `jurisdiction_list` | classification, include, page, per_page | List jurisdictions (states) |
| `jurisdiction_detail` | jurisdiction_id, include | Get jurisdiction details |
| `people_search` | jurisdiction, name, id, org_classification, district, include, page, per_page | Search legislators |
| `people_geo` | lat, lng, include | Find legislators by lat/lng coordinates |

### Open States vs LegiScan: Key Differences

| Feature | Open States | LegiScan |
|---------|-------------|----------|
| Committees | Yes (list + detail) | No |
| Events/Hearings | Yes (experimental) | No |
| Geo lookup | Yes (lat/lng) | No |
| Vote roll calls | Via bill `include` param | Dedicated endpoint |
| Bill text | Via bill `include` param | Dedicated endpoint (base64) |
| Cross-state search | Yes | Yes |
| Third-party IDs | Some | Extensive (5+ services) |
| Free tier | Yes (API key required) | Yes (30K queries/month) |
| Data freshness | Varies by state | Typically <24 hours |
| SC coverage | Yes but historically spotty | Comprehensive |

Open States has committees and events that LegiScan lacks, plus geo-based legislator lookup. But the MCP implementation is auto-generated boilerplate with no composite tools, no error handling, and no documentation. The data quality for SC specifically has historically been less reliable than LegiScan.

---

## 4. Recommendation

### For SC Legislature Tracking: Use LegiScan MCP as a Foundation, Build a Supplementary Scraper

**Install LegiScan MCP now.** It covers the highest-value tools from our Tier 1 list (bill search, bill details, votes, legislators, sponsors) with clean JSON data and no parser maintenance. The 30K free queries/month is generous for personal research use.

**Gaps to fill with a custom SC scraper MCP (Phase 2):**

| Gap | Priority | Source |
|-----|----------|--------|
| Committee meetings & hearings | HIGH | scstatehouse.gov `/meetings.php` |
| Status activity (what happened this week) | HIGH | scstatehouse.gov `/statusact.php` |
| Floor calendars | MEDIUM | scstatehouse.gov session calendar pages |
| New introductions by date | MEDIUM | scstatehouse.gov `/sessphp/sintros.php` etc. |
| Find legislator by address | MEDIUM | scstatehouse.gov `/legislatorssearch.php` OR Open States API directly (no MCP needed) |
| Committee rosters | MEDIUM | scstatehouse.gov `/committee.php` |
| County delegations | LOW | scstatehouse.gov `/delegations.php` |
| Contact info / photos | LOW | scstatehouse.gov `/member.php` |

**Do NOT install the Open States MCP.** The AG2 auto-generated server is not production quality (3 commits, no error handling, depends on `autogen` framework). If you need geo-based legislator lookup, call the Open States API v3 directly with your existing API key (`f8747e7f-eaaf-4f16-994a-8daf6a9d7bd8`) — it's a simple REST call, no MCP needed.

### Quick-Win Improvements to LegiScan MCP

If you fork or contribute:
1. Add `legiscan_get_bill_text` tool (client method already exists, just needs a 10-line tool wrapper)
2. Add `legiscan_get_amendment` tool (same — client method exists)
3. Add `legiscan_get_master_list` tool for browsing all bills in a session without search

### Architecture for Combined Coverage

```
                         ┌─────────────────────┐
                         │   Claude / Agent     │
                         └─────────┬───────────┘
                                   │ MCP
                    ┌──────────────┼──────────────┐
                    │              │               │
           ┌────────▼───────┐  ┌──▼──────────┐  ┌─▼───────────────┐
           │  legiscan-mcp  │  │ sc-leg-mcp  │  │ sc-elections-mcp│
           │  (npm package) │  │ (custom)    │  │ (existing)      │
           └────────┬───────┘  └──┬──────────┘  └─┬───────────────┘
                    │             │                │
           ┌────────▼───────┐  ┌──▼──────────┐  ┌─▼───────────────┐
           │  LegiScan API  │  │scstatehouse │  │ SC Ethics +     │
           │  (all states)  │  │  .gov       │  │ VREMS           │
           └────────────────┘  └─────────────┘  └─────────────────┘
```

Three complementary MCP servers:
1. **legiscan-mcp** — bill details, votes, sponsors, search (all states, structured JSON)
2. **sc-leg-mcp** (to build) — meetings, calendars, status activity, delegations, contact info (SC-specific HTML scraping)
3. **sc-elections-mcp** (existing) — campaign finance, contributions, expenditures, ethics disclosures

The name-matching bridge between LegiScan people_ids and SC Ethics filer IDs would be needed for full cross-referencing (legislative votes + campaign finance in one view).

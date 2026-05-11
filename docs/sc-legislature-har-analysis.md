# SC Legislature Website (scstatehouse.gov) - API & Architecture Analysis

Analyzed from HAR capture (658 requests, ~31MB) + live page fetches. Date: 2026-03-17.

## Architecture Summary

**Server-rendered PHP site. No JSON API.** Everything returns HTML (one exception: `/video/sources/manifest.json`). The site is a classic LAMP-style application behind Cloudflare CDN. All data is embedded in HTML tables — no XHR/fetch data endpoints were observed. Forms use both GET and POST, returning full HTML pages.

Key characteristics:
- PHP backend, ISO-8859-1 charset, XHTML 1.0 Transitional
- jQuery 3.5.1 + custom JS (`main_linux.js`)
- No REST API, no JSON endpoints (except video manifest)
- No authentication required for any public data (staff portal at `/onlineservices/index.php` is separate)
- Cloudflare in front (CDN, RUM beacon)
- Bill full text pages are Word-to-HTML conversions (MSO styles, .docx downloads available)
- Session numbers are sequential (current: 126 = 2025-2026, 125 = 2023-2024, back to 101 = 1975-1976)
- CAPTCHA (securimage) protects the email/contact form only

## Session URL Pattern

Sessions encode in URLs as: `/sess{NUMBER}_{STARTYEAR}-{ENDYEAR}/`

Example: `/sess126_2025-2026/` for the current session.

Used in: bill text, journals, calendars, introductions.

---

## Endpoint Catalog

### 1. BILL SEARCH & LEGISLATION

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/billsearch.php` | GET | `billnumbers`, `session`, `summary=B`, `headerfooter=1`, `PRINT=1` | Bill detail page (sponsors, status timeline, committee referrals, vote links) |
| `/sponsorsearch.php` | POST | `summary=B`, `Senator={code}` or `Representative={code}`, `prime=Y/N`, `session={num}` | Bills by sponsor |
| `/committeesearch.php` | GET/POST | (not captured in HAR) | Bills by committee |
| `/actionsearch.php` | GET/POST | (not captured) | Bills by history action |
| `/indexsearch.php` | GET/POST | (not captured) | Bills by index |
| `/subjectsearch.php` | GET/POST | (not captured) | Bills by subject |
| `/subjectsponsorsearch.php` | GET/POST | (not captured) | Bills by subject+sponsor |
| `/statusact.php` | POST | `session`, `chamber`, date range, format (title/summary/both) | Status activity report |
| `/newintro.php` | GET/POST | (not captured) | New introductions |
| `/legislation.php` | GET | — | Legislation search hub page |
| `/multicriteria2/search.php` | GET/POST | Multiple criteria (sponsors, subjects, etc.) | Advanced bill search |
| `/currentbill.php` | GET | `PAGE=CURRENT`, `chamber=S/H` | Currently active bill on floor |
| `/currentamendment.php` | GET | `PAGE=CURRENT`, `chamber=S/H` | Currently active amendment |
| `/newlaws.php` | GET | — | Ratifications & Acts hub |
| `/rats2.php` | GET | — | Ratifications/Acts log |
| `/listofacts.php` | GET | — | Act list for current session |
| `/aacts.php` | GET | — | Archived acts (prior sessions) |

**Bill full text**: `/sess126_2025-2026/bills/{NUMBER}.htm` (HTML) and `.docx` (Word download)

**Amendment detail**: `/amendments.php?KEY={id}`

**Prefiled bills**: `/sessphp/prefil25.php`

### 2. MEMBERS / LEGISLATORS

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/member.php` | GET | `chamber=S/H` | Full member roster (name, district, party, photo) |
| `/member.php` | GET | `code={10-digit-code}` | Individual member profile (bio, committees, contact, district map) |
| `/member.php` | GET | `chamber=S/H&order=O` | Officers listing |
| `/legislatorssearch.php` | GET/POST | `address`, `city`, `zip` | Find legislators by address |
| `/email.php` | GET | `chamber=H/S/B` | Email directory |
| `/email.php` | GET | `T=M&C={membercode}` | Individual member contact |
| `/email.php` | GET | `T=C&C=S{num}` | Committee contact |
| `/delegations.php` | GET/POST | `delegation={COUNTY}&headerfooter=1` | County delegation members |

**Member codes**: 10-digit numeric identifiers (e.g., `0002272727` for Sen. Brian Adams).

**Member photos**: `/images/members/{code}.jpg`

**District maps**: `/maps/senate/Sen{num}.pdf` and `/maps/house/Hou{num}.pdf` (assumed pattern)

### 3. COMMITTEES

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/committee.php` | GET | `chamber=S/H` | All standing committees with members, anchored by abbreviation |
| `/committeeinfo.php` | GET | — | Committee postings & reports hub |
| `/CommitteeInfo/{name}.php` | GET | — | Individual committee info page |

**Committee anchor IDs** (Senate): `agr`, `ban`, `cor`, `edu`, `eth`, `fam`, `fin`, `fis`, `int`, `jud`, `lab`, `leg`, `med`, `rul`, `tra`

**Committee info pages**: `/CommitteeInfo/senate{name}.php` (e.g., `senatebanking.php`)

### 4. VOTES

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/votehistory.php` | GET | — | Vote search form |
| `/votehistory.php` | POST | `type=CHAMBER`, `session`, `chamber=S/H`, `headerfooter=1` | Full chamber vote history (HTML table) |
| `/votehistory.php` | POST | `type=SPONSOR`, `chamber=S/H`, `sponsor={code}`, `session` | Votes by sponsor |
| `/votehistory.php` | POST | `type=BILL`, `session`, `bill_number={num}` | Votes on specific bill |
| `/votehistory.php` | GET | `KEY={id}` | Individual roll call detail (HTML) |
| `/pdfvotehistory.php` | GET | (params unknown) | Vote history as PDF |

**Vote types in search form**: All Votes, Roll Calls Only, Elections Only

**Vote data columns**: Vote#, Bill#, Description, Date, Yeas, Nays, N/V (Not Voting), Exc. Abs. (Excused Absent), Pres. (Present)

**Vote KEY IDs**: Sequential numeric (e.g., 26978). Roughly 1190 vote references in a single session's House chamber history.

### 5. SESSIONS / JOURNALS / CALENDARS

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/sessphp/sencal.php` | GET | — | Senate calendar index |
| `/sessphp/houcal.php` | GET | — | House calendar index |
| `/sessphp/sjournal.php` | GET | — | Senate journal index |
| `/sessphp/hjournal.php` | GET | — | House journal index |
| `/sessphp/sintros.php` | GET | — | Senate introductions index |
| `/sessphp/hintros.php` | GET | — | House introductions index |

**Calendar pages**: `/sess126_2025-2026/scal26/{YYYYMMDD}.htm` (Senate), `/sess126_2025-2026/hcal26/{YYYYMMDD}.htm` (House, assumed)

**Journal pages**: `/sess126_2025-2026/sj26/{YYYYMMDD}.htm` (Senate), `/sess126_2025-2026/hj26/{YYYYMMDD}.htm` (House)

**Introduction pages**: `/sess126_2025-2026/sintro26/{YYYYMMDD}.htm` (Senate), `/sess126_2025-2026/hintro26/{YYYYMMDD}.htm` (House, assumed)

### 6. MEETINGS

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/meetings.php` | GET | `chamber=S/H` | Weekly meeting schedule |
| `/meetings.php` | GET | `chamber=S/H&archiveweek={n}` | Previous week's meetings |
| `/meetings.php` | GET | `chamber=S/H&PRINT=1` | Printer-friendly |
| `/meetings.php` | GET | `op=vid&loc=databox&FULLSITE=1&code=ALL` | Video-enabled meetings (6MB+ response!) |

**Agenda PDFs**: `/agendas/{SESSION}{CHAMBER_LETTER}{NUMBER}.pdf` (e.g., `/agendas/126s16196.pdf`)

### 7. FULL-TEXT SEARCH

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/query.php` | GET | `search=FIRST`, `searchtext={query}`, `category={CAT}`, `session={num}` | Search results |

**Category values**: `SUMMARY`, `LEGISLATION`, `CODEOFLAWS`, `CODEOFREGS`, `CONSTITUTION`, `BUDGET`, `SENATEJOURNALS`, `HOUSEJOURNALS`

### 8. LEGAL CODES & CONSTITUTION

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/code/statmast.php` | GET | — | Code of Laws master index |
| `/coderegs/statmast.php` | GET | — | Code of Regulations master index |
| `/scconstitution/scconst.php` | GET | — | SC Constitution |
| `/state_register.php` | GET | — | State Register |
| `/regnsrch.php` | GET/POST | — | Regulations by document number |

### 9. VIDEO / STREAMING

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/video/archives.php` | GET/POST | `op=loadvid&key={id}&part=0&time=0&captions=0` | Video archive |
| `/video/schedule.php` | GET | — | Upcoming video schedule |
| `/video/video.php` | GET | `PLAYERTYPE=flash&QUALITY=2&wide=2&chamber=S/H` | Live video stream |
| `/video/sources/manifest.json` | GET | — | **Only JSON endpoint** (video source manifest) |
| `/video/sources/youtube.htm` | GET | `reference=` | YouTube embed |

### 10. DASHBOARDS

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/dashboard/senate.php` | GET | — | Senate dashboard (AJAX widgets) |
| `/dashboard/house.php` | GET | — | House dashboard (AJAX widgets) |

Dashboard widgets load content via AJAX from endpoints like `currentbill.php`, `currentamendment.php`, `meetings.php`, `billsearch2.php`, `budget.php`.

### 11. OTHER

| Endpoint | Method | Parameters | Returns |
|----------|--------|------------|---------|
| `/budget.php` | GET | `headerfooter=0` | Budget information |
| `/man25/manual25.php` | GET | — | Legislative Manual Online |
| `/archives.php` | GET | — | Archives |
| `/citizensinterestpage/media.php` | GET | — | Media links |
| `/listtracking/main.php` | GET | — | Legislation tracking (likely requires session/login) |

---

## Key Observations

### No API — HTML Scraping Required
Every data endpoint returns server-rendered HTML. An MCP server would need HTML parsers for each page type. The HTML is table-based with inline styles (not semantic), making parsing moderately difficult but consistent.

### POST Forms Are Essential
The most useful data endpoints (vote history, sponsor search, delegations, status activity) use POST with form-encoded parameters. GET-only access misses critical functionality.

### Member Codes Are the Primary Key
Members identified by 10-digit codes (e.g., `0002272727`). These codes appear in URLs for member profiles, sponsor searches, vote history, and email contacts. Extracting the member roster gives you the lookup table.

### Session Numbers Are Required
Almost every search endpoint requires a `session` parameter (integer). Current: 126 (2025-2026). Historical data goes back to session 101 (1975-1976).

### Large Response Sizes
Vote history for a full chamber session is ~1-2MB HTML. Meeting video listings are 6MB+. Bill search results can be 100KB+. Responses are not paginated — full result sets in one response.

### Cloudflare Protection
Site is behind Cloudflare. Aggressive scraping may trigger rate limits or challenges. The securimage CAPTCHA is only on the email form, not on data pages.

---

## MCP Server Recommendations

### Tier 1 — Highest Value (core legislative tracking)

1. **`search_bills`** — Wraps `/billsearch.php` (GET). Parameters: bill number, session. Returns structured bill data (title, sponsors, status, committee, dates).

2. **`get_bill_details`** — Wraps `/billsearch.php` with parsing for full bill metadata, sponsor list, status timeline, related votes, and amendments.

3. **`search_votes`** — Wraps `/votehistory.php` (POST). Parameters: type (chamber/sponsor/bill), session, chamber, sponsor code, bill number. Returns vote records with yeas/nays/counts.

4. **`get_vote_detail`** — Wraps `/votehistory.php?KEY={id}` (GET). Returns individual roll call with per-member votes.

5. **`list_members`** — Wraps `/member.php?chamber=S/H` (GET). Returns roster with names, districts, parties, codes.

6. **`get_member`** — Wraps `/member.php?code={code}` (GET). Returns full profile: bio, committees, contact, photo URL, district map.

7. **`search_by_sponsor`** — Wraps `/sponsorsearch.php` (POST). Returns all bills by a given legislator.

### Tier 2 — High Value (schedules & activity)

8. **`get_meetings`** — Wraps `/meetings.php?chamber=S/H`. Returns scheduled committee meetings with time, location, bills, agendas.

9. **`get_status_activity`** — Wraps `/statusact.php` (POST). Returns bills acted on in a date range — great for "what happened this week" queries.

10. **`list_committees`** — Wraps `/committee.php?chamber=S/H`. Returns committee names, members, and anchor IDs.

11. **`find_legislators`** — Wraps `/legislatorssearch.php`. Find state legislators by address.

12. **`get_calendar`** — Wraps session calendar pages. Returns daily floor calendar (bills scheduled for debate).

### Tier 3 — Useful Reference

13. **`search_full_text`** — Wraps `/query.php`. Full-text search across bills, journals, code of laws, constitution, budget.

14. **`get_bill_text`** — Fetches `/sess{N}_{YEARS}/bills/{NUM}.htm`. Returns bill full text (stripped of MSO formatting).

15. **`get_introductions`** — Wraps introduction pages. New bills introduced by date.

16. **`get_delegations`** — Wraps `/delegations.php` (POST). County delegation rosters.

17. **`get_ratifications`** — Wraps `/rats2.php` / `/listofacts.php`. Bills signed into law.

### Implementation Notes

- **Parser-heavy**: Each endpoint needs a dedicated HTML parser. Use cheerio or similar.
- **POST endpoints critical**: Vote history, sponsor search, status activity, and delegations all require POST.
- **No auth needed**: All public data, no API keys or cookies required.
- **Rate limiting**: Respect Cloudflare. Add delays between requests. Cache aggressively — legislative data changes infrequently (votes and meetings are the most dynamic).
- **Session discovery**: Build a session-number-to-year mapping from the status activity form (sessions 101-126 listed).
- **Cross-reference with sc-elections-mcp**: Member codes here are different from SC Ethics/VREMS filer IDs. Would need a name-matching bridge to connect campaign finance data to legislative activity.

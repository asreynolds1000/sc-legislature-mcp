# SC Legislature Scraper/MCP Server — Research & Best Practices

Date: 2026-03-17

Research for building an MCP server that wraps scstatehouse.gov (a server-rendered PHP site with no JSON API). This document covers architecture patterns, existing work to leverage, resilience strategies, testing, and legal considerations.

See also: `sc-legislature-har-analysis.md` in this directory (detailed endpoint catalog from HAR capture).

---

## 1. Existing Data Sources — What Already Exists

### Open States (openstates.org → now pluralpolicy.com)

**Coverage**: SC has active scrapers in `openstates/openstates-scrapers` (Python, GPL-3.0). Files at `scrapers/sc/`:
- `bills.py` — Full bill scraper (sponsors, status timeline, committee referrals, votes)
- `events.py` — Meeting/hearing scraper with streaming links
- No `people.py` or `committees.py` in the SC directory (may use shared framework or be incomplete)

**SC Scraper Architecture** (from source code analysis):
- Uses `lxml.html` for HTML parsing (XPath queries, not CSS selectors)
- Uses `scrapelib` for HTTP with built-in retry logic
- Uses `spatula` (Page-class-oriented scraper framework by same author)
- **Key quirk handlers in SC scraper**:
  - HTTP/1.0 downgrade via `@toggle_http_version` decorator to prevent chunking errors
  - Catches `http.client.IncompleteRead` exceptions during subject scraping
  - Falls back to Internet Archive snapshots for past sessions (2017-2022)
  - Uses `urllib.request.urlopen()` for subject searches due to server non-compliance
  - PDF text extraction for vote roll calls (individual legislator votes are in PDFs)
- Action classification maps 30+ action phrases to standardized types

**Open States API v3** (`v3.openstates.org`):
- Endpoints: bills (search + detail), people (search + geo lookup), jurisdictions, committees, events
- Auth: API key via `X-API-KEY` header (free registration at pluralpolicy.com)
- Bill search supports: jurisdiction, session, chamber, subject, sponsor, full-text, date filters
- Returns: sponsors, actions, versions, documents, votes, related bills
- No rate limit info in docs (likely reasonable for non-commercial use)
- **SC data freshness unknown** — site redirects to JS-only app, couldn't verify update frequency

**Verdict**: Open States is a strong **supplementary** data source but not a replacement for direct scraping. Their SC scraper validates our approach and documents known quirks. The API could serve as a fallback or cross-reference.

### LegiScan (legiscan.com)

- Covers all 50 states including SC
- LegiScan's website blocks automated access (403 on API docs, 403 on SC page)
- **API tiers** (from prior knowledge):
  - Free: Limited requests/day, basic bill data
  - Paid: Full access, bulk downloads, push notifications for bill changes
  - Enterprise: Higher limits, custom feeds
- Provides: bill text, sponsors, votes, amendments, status, subjects
- Good for bill-level data; less useful for member profiles, committees, meetings
- **Not a replacement** for direct scraping — MCP server should own its data pipeline

**Verdict**: LegiScan is useful as a cross-reference or enrichment source, not a primary backend. The free tier may be too limited, and paid plans add cost for what we can scrape directly.

### Open States API Key

Alex already has one: `f8747e7f-eaaf-4f16-994a-8daf6a9d7bd8` (in global CLAUDE.md Quick Reference).

---

## 2. Scraping Architecture Patterns

### Library Choice: Node.js / TypeScript

Since this will be an MCP server (like sc-elections-mcp and gc-property-search), TypeScript is the right choice. Key libraries:

| Library | Use Case | Notes |
|---------|----------|-------|
| **node-html-parser** | Fast HTML parsing | Already used in sc-elections-mcp parsers. 10x faster than cheerio for simple extraction. No jQuery API but simpler for label/value and table parsing. |
| **cheerio** | Complex HTML parsing | jQuery-like API, better for navigating deeply nested structures. ~470M weekly npm downloads. Uses parse5 (spec-compliant) or htmlparser2 (faster, more forgiving) backends. |
| **jsdom** | Full DOM emulation | Overkill for server-rendered HTML. Only needed if pages require JS execution (scstatehouse.gov does not for data pages). Much slower than cheerio/node-html-parser. |
| **playwright/puppeteer** | JS-rendered pages | Not needed — scstatehouse.gov is server-rendered PHP. Would add unnecessary complexity and resource overhead. |

**Recommendation**: Use **node-html-parser** (consistency with sc-elections-mcp) for simple table/label extraction. Consider cheerio only if parsing becomes unwieldy with deeply nested structures.

### Parser Architecture Pattern

Based on sc-elections-mcp's proven structure and the scraper-mcp reference implementation:

```
src/
  api/
    legislature-client.ts    # HTTP fetching layer (fetch + retry + rate limit)
  parsers/
    bill-search.ts           # Parse bill search results
    bill-detail.ts           # Parse individual bill page
    member-list.ts           # Parse member roster
    member-detail.ts         # Parse individual member profile
    vote-history.ts          # Parse vote history tables
    vote-rollcall.ts         # Parse individual roll call
    committee-list.ts        # Parse committee listings
    meeting-list.ts          # Parse meeting schedules
    status-activity.ts       # Parse status activity report
    sponsor-search.ts        # Parse sponsor search results
    ...
  tools/
    bills.ts                 # MCP tool definitions for bill operations
    members.ts               # MCP tool definitions for member operations
    votes.ts                 # MCP tool definitions for vote operations
    committees.ts            # MCP tool definitions for committee operations
    meetings.ts              # MCP tool definitions for meeting/schedule operations
    search.ts                # MCP tool definitions for full-text search
  types.ts                   # Shared TypeScript interfaces
  data/
    sessions.ts              # Session number → year mapping (101-126)
    member-codes.ts          # Cached member code → name mapping (optional)
  index.ts                   # MCP server entry point
```

**Key principle from sc-elections-mcp**: Separate the HTTP client (fetching) from parsers (HTML extraction) from tools (MCP interface). Each parser is a pure function: HTML string in, typed object out. This makes parsers independently testable.

### Parser Design Patterns

From analyzing the sc-elections-mcp parsers and Open States SC scraper:

1. **Label/Value extraction** (most common on scstatehouse.gov):
   ```typescript
   // Pattern from sc-elections-mcp candidate-detail.ts
   function extractLabelValue(root: HTMLElement, label: string): string {
     const spans = root.querySelectorAll('span.label-min-width')
     for (const span of spans) {
       if (span.text.trim().replace(/:$/, '') === label) {
         return span.nextElementSibling?.text?.trim() || ''
       }
     }
     return ''
   }
   ```

2. **Table row extraction** (votes, member lists, bill search results):
   ```typescript
   // Pattern from sc-elections-mcp candidate-search.ts
   function parseRow(row: HTMLElement): ParsedRow | null {
     const cells = row.querySelectorAll('td')
     if (cells.length < EXPECTED_COLUMNS) return null
     return {
       field1: cells[0]?.text?.trim() || '',
       field2: cells[1]?.text?.trim() || '',
       // ...
     }
   }
   ```

3. **Fallback selectors** (handle HTML changes gracefully):
   ```typescript
   // Pattern from sc-elections-mcp — try specific selector, fall back to general
   const rows = root.querySelectorAll('table#gridCandidateSearch tbody tr')
   if (rows.length === 0) {
     const altRows = root.querySelectorAll('tbody tr')
     // ...
   }
   ```

---

## 3. Resilience Patterns

### HTTP Layer

The scstatehouse.gov site has known quirks (documented in Open States SC scraper):

| Issue | Mitigation |
|-------|------------|
| **Cloudflare protection** | Respectful rate limiting (1-2 req/sec max). Set a descriptive User-Agent. Avoid burst requests. |
| **Chunked encoding errors** | Open States uses HTTP/1.0 downgrade. In Node.js, can use `fetch` with appropriate headers or fall back to `http` module. |
| **IncompleteRead errors** | Retry with exponential backoff (2-3 attempts). |
| **Large responses (1-6MB)** | Stream responses where possible. Set appropriate timeouts (30s+). |
| **POST form encoding** | Use `application/x-www-form-urlencoded` content type. Some endpoints require specific parameter ordering. |
| **ISO-8859-1 charset** | The site uses ISO-8859-1, not UTF-8. Decode responses appropriately. |

**Rate Limiting Strategy**:
```typescript
// Simple token bucket or delay-between-requests
const MIN_DELAY_MS = 1000  // 1 request per second baseline
let lastRequestTime = 0

async function throttledFetch(url: string, options?: RequestInit): Promise<Response> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed)
  }
  lastRequestTime = Date.now()
  return fetch(url, options)
}
```

**Retry Pattern**:
```typescript
async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await throttledFetch(url, options)
      if (response.ok) return response
      if (response.status === 429 || response.status >= 500) {
        await sleep(Math.pow(2, attempt) * 1000)
        continue
      }
      return response // 4xx errors don't retry
    } catch (err) {
      if (attempt === maxRetries - 1) throw err
      await sleep(Math.pow(2, attempt) * 1000)
    }
  }
  throw new Error(`Failed after ${maxRetries} retries: ${url}`)
}
```

### Caching Strategy

Legislative data has predictable staleness:
- **Member roster**: Changes only at election time or special appointment. Cache for days/weeks.
- **Bill text/status**: Changes when actions occur (committee hearings, floor votes). Cache for hours.
- **Vote records**: Immutable once recorded. Cache indefinitely.
- **Meetings/calendar**: Changes weekly. Cache for hours.
- **Committee membership**: Changes at session start. Cache for days.

**Implementation options**:
1. **In-memory Map with TTL** — Simplest. Good for MCP server that restarts between sessions.
2. **File-based cache** — Persist across restarts. Write HTML responses to `~/.cache/sc-legislature/`.
3. **SQLite** — If we want structured caching with queries. Probably overkill for v1.

Recommended for v1: In-memory cache with configurable TTLs per data type. Add file-based persistence if session restarts become painful.

### HTML Change Detection

Government sites do change their HTML, but infrequently. Strategies:

1. **Defensive parsing** — Always check element existence before accessing properties. Return empty strings/nulls instead of throwing.
2. **Column count validation** — Table parsers should validate expected column counts and log warnings on mismatch.
3. **Structural assertions in tests** — Snapshot key page structures; alert on changes.
4. **Version headers** — Log the page's meta/generator tags if present to detect site updates.

---

## 4. MCP Server Patterns for Scraped Data

### Reference: scraper-mcp (cotdp)

Architecture worth emulating:
- **4 scraping modes**: raw HTML, markdown, plain text, link extraction
- **Three-tier cache**: realtime / default / static TTLs
- **Exponential backoff** for transient failures
- **CSS selector filtering** to reduce token usage (critical for LLM consumption)
- **Token optimization**: Reduces output by 70-90% vs raw HTML

### Reference: scrap-mcp (sigmaSd)

Simpler pattern:
- Single `scrape_page` tool with URL + CSS selector params
- Zod schema validation on inputs
- Comprehensive error messages for network, HTTP, parse, and selector failures
- Minimal permissions (`--allow-net` only)

### Reference: sc-elections-mcp (our own)

Proven patterns to reuse:
- **Typed parsers**: Each parser is a pure function (HTML string → typed result)
- **Client module**: Centralized HTTP layer with shared headers/config
- **Tool registration**: Tools grouped by domain (search, campaign, etc.)
- **MCP SDK**: `@modelcontextprotocol/sdk` with `McpServer` class
- **InMemoryTransport** for smoke tests
- **node-html-parser** for all HTML parsing

### MCP Tool Design for Legislative Data

Key insight from the HAR analysis: the site has ~50 endpoints but an MCP server should expose ~12-17 well-designed tools (see HAR analysis Tier 1-3 recommendations). Each tool should:

1. Accept human-readable parameters (bill number, member name, date range) not internal codes
2. Handle code lookups internally (member name → member code)
3. Return structured, token-efficient results (not raw HTML)
4. Include source URLs for attribution

---

## 5. Legal & Ethical Considerations

### robots.txt

Could not fetch scstatehouse.gov/robots.txt (blocked by domain verification). However:

- **Government websites are public records.** SC state government data is taxpayer-funded public information.
- **No authentication required** for any data endpoint on scstatehouse.gov.
- **No Terms of Service** visible on the site.
- **Precedent**: Open States has been scraping scstatehouse.gov for 10+ years with an open-source scraper on GitHub. No legal challenges known.

### Rate Limiting Etiquette

- Limit to 1 request/second maximum
- Use a descriptive User-Agent: `sc-legislature-mcp/1.0 (contact: a@alexreynolds.com)`
- Cache aggressively — most data doesn't change more than daily
- Avoid scraping during peak legislative session hours if possible
- Never scrape the staff portal (`/onlineservices/`)

### Government Data Access Principles

- The Freedom of Information Act (at federal level) and SC FOIA (state level) establish the principle that government data is public
- Scraping publicly available government websites for personal/civic use is generally accepted practice
- The CFAA (Computer Fraud and Abuse Act) typically applies to unauthorized access, not public websites
- The 2022 *hiQ Labs v. LinkedIn* Supreme Court case affirmed that scraping publicly available data is not unauthorized access

### Best Practice

- Respect any future robots.txt directives if they appear
- Identify the bot with a descriptive User-Agent
- Don't overwhelm the server — it's a small state government operation
- Cache results to minimize repeat requests
- Consider contributing upstream to Open States if we find improvements

---

## 6. Testing Strategies

### Unit Tests: Parser Functions

The strongest testing approach for HTML scrapers. Each parser is a pure function that can be tested with saved HTML snapshots.

```typescript
// tests/parsers/bill-detail.test.ts
import { parseBillDetail } from '../src/parsers/bill-detail'
import { readFileSync } from 'fs'

describe('parseBillDetail', () => {
  const html = readFileSync('tests/fixtures/bill-H3456.html', 'utf-8')

  it('extracts bill title', () => {
    const result = parseBillDetail(html)
    expect(result.title).toBe('A BILL TO AMEND...')
  })

  it('extracts sponsors', () => {
    const result = parseBillDetail(html)
    expect(result.sponsors).toContainEqual({
      name: 'Rep. John Smith',
      code: '0001234567',
      type: 'primary',
    })
  })

  it('handles empty results gracefully', () => {
    const result = parseBillDetail('<html><body></body></html>')
    expect(result.title).toBe('')
    expect(result.sponsors).toEqual([])
  })
})
```

**Fixture management**:
- Save actual HTML responses as test fixtures in `tests/fixtures/`
- Name by content: `bill-H3456.html`, `member-roster-house.html`, `vote-rollcall-26978.html`
- Update fixtures periodically (quarterly) to catch HTML structure changes
- Git-track fixtures — they're small and essential for reproducibility

### Snapshot Testing

Use Vitest snapshots to detect parser output changes:

```typescript
it('bill detail structure matches snapshot', () => {
  const result = parseBillDetail(html)
  expect(result).toMatchSnapshot()
})
```

When a snapshot fails, it means either:
1. The parser changed (intentional — update snapshot)
2. The site HTML changed (needs parser fix — update fixture + parser)

### Smoke Tests (Live Site)

Following sc-elections-mcp's pattern:

```typescript
describe('MCP server smoke test', () => {
  const server = new McpServer({ name: 'sc-legislature-mcp', version: '1.0.0' })
  // Register all tools...

  it('lists all expected tools', async () => {
    const [client, server] = InMemoryTransport.createLinkedPair()
    // Verify tool count and names
  })
})
```

### Integration Tests (Optional, CI-only)

Run against the live site on a schedule (weekly) to detect HTML changes:

```typescript
// tests/integration/site-structure.test.ts
describe('scstatehouse.gov structure', { timeout: 30000 }, () => {
  it('member listing has expected table structure', async () => {
    const html = await fetch('https://www.scstatehouse.gov/member.php?chamber=H').then(r => r.text())
    const root = parse(html)
    const members = root.querySelectorAll(MEMBER_SELECTOR)
    expect(members.length).toBeGreaterThan(100) // House has 124 members
  })
})
```

Run these sparingly (not on every commit) and gate on a `LIVE_TESTS=1` env var.

---

## 7. Alternatives to Scraping

### Does SC Legislature Have Hidden APIs?

**No.** The HAR analysis (658 requests) found exactly one JSON endpoint: `/video/sources/manifest.json` (video streaming only). Everything else is server-rendered HTML. No XHR data endpoints, no GraphQL, no REST API.

### RSS Feeds?

**No.** No RSS or Atom feeds were found on the site. No `<link rel="alternate" type="application/rss+xml">` tags in page headers.

### Bulk Data Downloads?

**No.** No bulk export options. The closest thing is the full-text search endpoint (`/query.php`) which returns HTML.

### Open States API as Alternative

**Partial alternative.** The Open States API v3 provides:
- Bills (search, detail, votes, sponsors, actions)
- People (search, geo lookup)
- Committees
- Events

**What Open States lacks** (that direct scraping provides):
- Real-time floor activity (`currentbill.php`, `currentamendment.php`)
- Calendar/schedule data (daily floor calendars)
- Full meeting details with agendas and video links
- Full-text search across legislation, journals, and legal codes
- County delegation lookups
- Status activity reports (what happened in a date range)
- Direct bill text (Open States has links but not necessarily the text)
- Member contact info and photos

**Recommendation**: Use Open States API as a supplementary data source (e.g., geo lookup for "who represents this address"), but build the primary data pipeline from direct scraping for completeness and freshness.

### LegiScan as Alternative

**Partial alternative, with cost.** LegiScan provides bill-level data across all 50 states. Free tier is limited. Paid tiers add cost. Does not cover member profiles, committees, meetings, calendars, or real-time floor activity.

Not worth building a dependency on for an SC-specific MCP server.

---

## 8. Implementation Recommendations

### Phase 1: Core (Tier 1 tools from HAR analysis)

1. Build `legislature-client.ts` with rate-limited fetch, retry, caching
2. Build parsers for bill search, bill detail, member list, member detail, vote history, vote rollcall, sponsor search
3. Expose 7 MCP tools matching the Tier 1 recommendations
4. Tests: Parser unit tests with HTML fixtures + smoke test for tool registration

### Phase 2: Activity Tracking (Tier 2)

5. Add meetings, status activity, committees, legislator lookup, calendar parsers
6. 5 more MCP tools
7. Cross-reference with sc-elections-mcp via name matching (bridge campaign finance to legislative activity)

### Phase 3: Search & Reference (Tier 3)

8. Full-text search, bill text, introductions, delegations, ratifications
9. 5 more MCP tools

### Tech Stack

- TypeScript, `@modelcontextprotocol/sdk`
- `node-html-parser` for parsing (consistent with sc-elections-mcp)
- Vitest for testing
- In-memory cache with TTLs
- No external dependencies for data (direct scraping only)
- Optional: Open States API client for geo lookup enrichment

### Naming

`sc-legislature-mcp` — follows the `sc-elections-mcp` naming pattern. Published to npm as `sc-legislature-mcp`.

### Estimated Effort

- Phase 1: 2-3 sessions (7 parsers + client + tests + MCP registration)
- Phase 2: 1-2 sessions (5 simpler parsers)
- Phase 3: 1 session (straightforward parsers)

### Key Risks

1. **Cloudflare blocking** — Mitigate with rate limiting and descriptive User-Agent. Open States has not been blocked, which is encouraging.
2. **HTML structure changes** — Mitigate with defensive parsing, fallback selectors, and fixture-based tests.
3. **ISO-8859-1 encoding** — Must handle explicitly; Node.js defaults to UTF-8.
4. **PDF vote rollcalls** — Individual member votes are in PDFs. Need a PDF parsing strategy (Open States uses `convert_pdf` utility). Consider `pdf-parse` npm package or skip PDF parsing in v1.
5. **Large response sizes** — Some pages are 1-6MB. Need appropriate timeouts and memory handling.

---

## 9. Reference Links

- Open States SC scraper: `github.com/openstates/openstates-scrapers/tree/main/scrapers/sc`
- Open States API v3 docs: `v3.openstates.org/docs`
- Open States API key: Already have one (see CLAUDE.md Quick Reference)
- spatula (scraper framework): `github.com/openstates/spatula` — Page-class architecture, worth studying even though it's Python
- scraper-mcp (reference MCP): `github.com/cotdp/scraper-mcp` — Three-tier cache, token optimization
- scrap-mcp (reference MCP): `github.com/sigmaSd/scrap-mcp` — Simple CSS-selector-based scraping
- sc-elections-mcp (our own): `~/Code/sc-elections-mcp` — Proven parser + client + tool pattern
- HAR analysis: `~/Projects/_scratch/sc-legislature-har-analysis.md` — Full endpoint catalog
- node-html-parser: `npmjs.com/package/node-html-parser` — Fast HTML parser used in sc-elections-mcp
- cheerio: `cheerio.js.org` — jQuery-like API, heavier but more ergonomic for complex DOM

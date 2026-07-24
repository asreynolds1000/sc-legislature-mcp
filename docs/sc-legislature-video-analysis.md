# SC Legislature Video Archive — Technical Analysis

**Date:** 2026-03-17
**Source:** Live page analysis of scstatehouse.gov video system
**Note:** HAR file was not found at `~/Downloads/www.scstatehouse.gov.har`. Analysis based on live fetches of all video-related endpoints.

---

## Executive Summary

The SC Legislature operates a fully self-hosted video archive system at `scstatehouse.gov/video/` with direct MP4 downloads from `video.scstatehouse.gov`. Every committee hearing and floor session since ~2013 is recorded, indexed, and downloadable. The system also supports YouTube as an alternate video host (for live streams), but the archive overwhelmingly uses self-hosted MP4 files. **This is a goldmine for an MCP tool** — no other service (LegiScan, Open States, Plural) provides direct links to hearing recordings.

---

## Architecture Overview

```
┌─────────────────────────────────┐
│  archives.php (main UI)         │
│  - Session selector (126 sessions, 1975-2026)
│  - Chamber filter (S/H/J)      │
│  - Bill number search           │
│  - Committee filter             │
├─────────────────────────────────┤
│  POST archives.php              │
│  op=loadvid&key=X&part=Y        │
│  → returns JSON with video ref  │
├─────────────────────────────────┤
│  meetings.php?op=vid&loc=databox│
│  - Lists meetings with videos   │
│  - Filterable by chamber/code   │
├─────────────────────────────────┤
│  sources/mediacluster.php       │   sources/youtube.htm
│  - JWPlayer embed               │   - YouTube iframe API
│  - 3 media servers              │   - reference=YouTubeVideoID
│  - HLS/MP4 streaming            │
├─────────────────────────────────┤
│  video.scstatehouse.gov/mp4/    │
│  - Direct MP4 downloads         │
│  - Predictable URL pattern      │
└─────────────────────────────────┘
```

---

## Key Endpoints

### 1. Video Archive Page
**URL:** `https://www.scstatehouse.gov/video/archives.php`

Main UI with:
- **Session dropdown:** 126 (2025-2026) back to 101 (1975-1976) — 26 sessions
- **Chamber filter:** Senate (S), House (H), Joint (J)
- **Bill number search field**
- **Committee navigation** via `gocommittee()` function

### 2. Video Loading API (POST)
**URL:** `POST https://www.scstatehouse.gov/video/archives.php`
**Content-Type:** `application/x-www-form-urlencoded`

**Parameters:**
| Param | Description | Example |
|-------|-------------|---------|
| `op` | Operation | `loadvid` |
| `key` | Meeting/video ID (numeric) | `16194` |
| `part` | Part number (1-based) | `1` |
| `time` | Seek position in seconds | `0` |
| `captions` | Enable captions | `0` or `1` |

**Response:** JSON object:
```json
{
  "reference": "mp4/20260317SFinanceNaturalResourcesand16194_1.mp4",
  "poster": "Archives_whiteSenate.png",
  "message": "",
  "meetingstatus": "<html>",
  "meetinginfo": "<html>",
  "draftquality": false,
  "key": 16194,
  "part": 1,
  "orderby": ""
}
```

The `reference` field determines the video source:
- **Contains `.mp4`** → loads `sources/mediacluster.php?reference=<ref>`
- **No `.mp4`** → loads `sources/youtube.htm?reference=<YouTubeID>`

### 3. Meeting Listing Endpoint
**URL:** `https://www.scstatehouse.gov/meetings.php`

**Parameters:**
| Param | Value | Description |
|-------|-------|-------------|
| `op` | `vid` | Video mode |
| `loc` | `databox` | Display target |
| `FULLSITE` | `1` | Full site mode |
| `chamber` | `S`, `H`, `J`, or empty | Filter by chamber |
| `code` | `ALL` or `0` | `ALL` = all committees, `0` = floor sessions only |
| `current` | key value | Current video key |
| `PART` | part number | Current part |
| `orderby` | sort field | Ordering |

Returns HTML with meeting listings including:
- Date, time, committee name
- Duration
- Download links (direct MP4 URLs)
- `changevideo(key, part)` onclick handlers

### 4. Video Player Embed — Media Cluster
**URL:** `https://www.scstatehouse.gov/video/sources/mediacluster.php`

**Parameters:**
| Param | Description |
|-------|-------------|
| `reference` | MP4 filename (& replaced with *) |
| `time` | Start time in seconds |
| `muted` | Mute flag |
| `captions` | Caption reference |
| `poster` | Thumbnail image |

**Player:** JWPlayer with 3 media servers:
- `media1.scstatehouse.gov`
- `media2.scstatehouse.gov`
- `media3.scstatehouse.gov`

### 5. Video Player Embed — YouTube
**URL:** `https://www.scstatehouse.gov/video/sources/youtube.htm?reference=<YouTubeVideoID>`

Standard YouTube iframe API embed. Used for live streams; archive recordings are predominantly MP4.

### 6. Direct MP4 Downloads
**URL:** `https://video.scstatehouse.gov/mp4/<filename>.mp4`

Also serves as the media server root with RSS/podcast feeds.

### 7. Video Schedule
**URL:** `https://www.scstatehouse.gov/video/schedule.php`

Lists upcoming live broadcasts. Uses `get_vidmeetings(room)` for dynamic loading. Auto-refreshes every 5 minutes (300,000ms).

---

## MP4 Filename Convention

**Format:** `YYYYMMDD[Chamber][CommitteeName][MeetingID]_[Part].mp4`

| Component | Values | Example |
|-----------|--------|---------|
| Date | `YYYYMMDD` | `20260317` |
| Chamber | `S` (Senate), `H` (House), `J` (Joint) | `S` |
| Committee | CamelCase, spaces removed, truncated | `FinanceNaturalResourcesand` |
| Meeting ID | 4-5 digit numeric | `16194` |
| Part | `_1`, `_2`, etc. | `_1` |

### Examples

| Filename | Meeting |
|----------|---------|
| `20260312SSenate16185_1.mp4` | Senate floor session |
| `20260311HHouseofRepresentatives16181_1.mp4` | House floor session |
| `20260312SLaborCommerceandIndustryCommittee16176_1.mp4` | Senate Labor Committee |
| `20260225SSenate16067_2.mp4` | Senate floor (Part 2) |
| `20260305JCollegeandUniversityTrusteeScreening15931_1.mp4` | Joint screening commission |
| `20130320SJudiciarySubcommitteeonS1790_1.mp4` | Senate Judiciary subcommittee (2013) |

**Meeting IDs are sequential and globally unique** — they increment across all chambers and committees. Current range: ~15000-16200 (2026), ~1300-3500 (2013-2014), ~9500-10500 (2019-2020).

---

## RSS/Podcast Feeds

The media server at `video.scstatehouse.gov` provides RSS feeds for podcast subscriptions.

### Feed URL Pattern
```
https://video.scstatehouse.gov/feeds/videoarchive_[committeeID].xml
```

### Chamber Feed IDs
| Chamber | committeeID | iTunes Video ID | iTunes Audio ID |
|---------|-------------|-----------------|-----------------|
| Senate | `1` | `1109016181` | `1303756981` |
| House | `2` | `1109015654` | `1303756781` |

**Note:** Chamber feeds at `/feeds/videoarchive_1.xml` returned 404. Committee-specific feeds work: `/feeds/videoarchive_2000000800.xml` (Senate Judiciary) confirmed working.

### Committee Feed IDs (All Active)

**Senate:**
| Committee | committeeID | Has Feeds |
|-----------|-------------|-----------|
| Agriculture and Natural Resources | `2000000375` | Yes |
| Banking and Insurance | `2000000450` | Yes |
| Corrections and Penology | `2000000500` | Yes |
| Education | `2000000525` | Yes |
| Ethics | `2000000575` | Yes |
| Finance | `2000000625` | Yes |
| Fish, Game and Forestry | `2000000650` | Yes |
| General | `2000000675` | Yes |
| Interstate Cooperation | `2000000750` | No |
| Invitations | `2000000775` | No |
| Judiciary | `2000000800` | Yes |
| Labor, Commerce and Industry | `2000000825` | Yes |
| Medical Affairs | `2000000900` | Yes |
| Rules | `2000001025` | No |
| Transportation | `2000001100` | No |

**House:**
| Committee | committeeID | Has Feeds |
|-----------|-------------|-----------|
| Agriculture, Natural Resources and Environmental Affairs | `2000000050` | Yes |
| Education and Public Works | `2000000100` | Yes |
| Ethics | `2000000125` | Yes |
| Interstate Cooperation | `2000000150` | No |
| Judiciary | `2000000200` | Yes |
| Labor, Commerce and Industry | `2000000225` | Yes |
| Legislative Oversight | `2000000235` | Yes |
| Medical, Military, Public and Municipal Affairs | `2000000250` | Yes |
| Operations and Management | `2000000275` | No |
| Regulations and Administrative Procedures | `2000000285` | Yes |
| Rules | `2000000300` | No |
| Ways and Means | `2000000325` | Yes |

---

## Video Player Communication

The archive page communicates with the embedded player iframe via `postMessage()`:

```javascript
// Commands sent to iframe
{command: 'play'}
{command: 'seek', pos: <seconds>}
```

The iframe (mediacluster.php or youtube.htm) sends state back via `window.parent.process()`.

---

## Data Volume

- **~180+ Senate floor sessions** in current view (2021-2026)
- **Hundreds of committee recordings** per session
- **Archives back to at least 2013** with MP4 files (Senate Judiciary RSS feed confirmed 2013 entries)
- **Session dropdown goes to 1975** but video availability likely starts around 2003-2013
- **Meeting IDs range from ~1300 (2013) to ~16200 (2026)** — roughly 15,000 recorded meetings

---

## MCP Tool Feasibility Assessment

### What Would Be Valuable

1. **Search video archives by committee, date range, bill number**
   - The `meetings.php?op=vid` endpoint already supports chamber and code filtering
   - Bill number search exists in the archives.php UI
   - Could return structured results: date, committee, duration, direct MP4 URL

2. **Get video URL for a specific hearing**
   - Given a meeting ID (key), POST to archives.php with `op=loadvid` returns the MP4 reference
   - Direct download: `https://video.scstatehouse.gov/<reference>`
   - Unique value: no other API provides this

3. **Link bills to hearing recordings**
   - When a bill is discussed in committee, the meeting entry includes bill numbers
   - Could cross-reference with existing sc-elections-mcp bill data

4. **Committee video RSS feeds**
   - Subscribe to specific committees via podcast feeds
   - 22 active committee feeds + 2 chamber feeds

### Implementation Approach

**Two main data access patterns:**

1. **HTML scraping of meetings.php** — returns meeting listings with all metadata and MP4 URLs. Filter by chamber/code. No API key needed. Public data.

2. **POST to archives.php** — `op=loadvid` with key/part returns JSON with video reference. This is the cleanest "API" — structured JSON response.

3. **RSS feeds** — committee-specific feeds from `video.scstatehouse.gov/feeds/` provide podcast-format listings with enclosure URLs.

### Proposed MCP Tools

| Tool | Input | Output |
|------|-------|--------|
| `search_video_archives` | chamber, committee, date_range, bill_number, session | List of meetings with dates, committees, durations, MP4 URLs |
| `get_video_url` | meeting_key, part | Direct MP4 download URL + meeting metadata |
| `list_committee_feeds` | chamber (optional) | RSS feed URLs for podcast subscription |
| `get_video_schedule` | none | Upcoming live broadcast schedule |

### Competitive Advantage

**No other legislative data service provides this.** LegiScan has bill text, votes, and sponsors. Open States has legislator info and votes. Plural has some hearing data. None of them link to actual video recordings of hearings and floor sessions. This would be genuinely unique functionality.

### Technical Risks

- **HTML scraping** — meetings.php returns HTML, not JSON. Committee names and meeting details need parsing.
- **No formal API** — could break with site redesign (though the site has been stable for years).
- **Large files** — MP4s can be multi-hour recordings (some floor sessions are 6+ hours).
- **Meeting ID opacity** — the numeric key is sequential but not predictable. Need to scrape the listing to find a specific meeting.
- **Session parameter** — filtering by legislative session via the meetings endpoint needs more testing; the dropdown appears to be JavaScript-driven rather than query parameter-based.

### Integration with sc-elections-mcp

This could either be:
1. **Added to sc-elections-mcp** as new tools (keeps all SC legislative data in one server)
2. **Separate MCP server** (`sc-legislature-video-mcp`) if the scope feels distinct

Recommendation: **Add to sc-elections-mcp** since the user base overlaps completely. Anyone researching SC politics wants bills + campaign finance + hearing videos together.

---

## Raw URL Reference

```
# Archive UI
https://www.scstatehouse.gov/video/archives.php
https://www.scstatehouse.gov/video/schedule.php

# Video loading API
POST https://www.scstatehouse.gov/video/archives.php
  op=loadvid&key=16194&part=1&time=0&captions=0
  → JSON response with reference field

# Meeting listings (HTML)
https://www.scstatehouse.gov/meetings.php?op=vid&loc=databox&FULLSITE=1&chamber=S&code=ALL&orderby=
https://www.scstatehouse.gov/meetings.php?op=vid&loc=databox&FULLSITE=1&chamber=H&code=ALL&orderby=
https://www.scstatehouse.gov/meetings.php?op=vid&loc=databox&FULLSITE=1&chamber=J&code=ALL&orderby=
https://www.scstatehouse.gov/meetings.php?op=vid&loc=databox&FULLSITE=1&chamber=S&code=0&orderby=  # Floor sessions only

# Direct MP4 downloads
https://video.scstatehouse.gov/mp4/20260312SSenate16185_1.mp4

# Video player embeds
https://www.scstatehouse.gov/video/sources/mediacluster.php?reference=mp4/FILE.mp4
https://www.scstatehouse.gov/video/sources/youtube.htm?reference=YOUTUBE_ID

# Media servers (JWPlayer streaming)
media1.scstatehouse.gov
media2.scstatehouse.gov
media3.scstatehouse.gov

# RSS/Podcast feeds (per committee)
https://video.scstatehouse.gov/feeds/videoarchive_2000000800.xml  # Senate Judiciary
https://video.scstatehouse.gov/feeds/videoarchive_[committeeID].xml

# Committee/chamber metadata
https://video.scstatehouse.gov/feeds/chambers.json   # Note: under /feeds/, not root
https://video.scstatehouse.gov/feeds/committees.json
```

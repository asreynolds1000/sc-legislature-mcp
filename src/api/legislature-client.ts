import { RateLimitError, NetworkError, CloudflareChallengeError } from '../errors.js'
import { isCloudflareChallenge } from '../parsers/parser-utils.js'
import type { VideoLoadResult } from '../types.js'

const BASE_URL = 'https://www.scstatehouse.gov'
const VIDEO_BASE_URL = 'https://video.scstatehouse.gov'
const USER_AGENT = process.env.SC_LEGISLATURE_USER_AGENT
  || 'sc-legislature-mcp/0.1.0 (https://github.com/asreynolds1000/sc-legislature-mcp)'

const DEFAULT_TIMEOUT_MS = 30_000
const LARGE_TIMEOUT_MS = 60_000
const MIN_DELAY_MS = 1000 // 1 request per second

// --- Rate limiter ---

let lastRequestTime = 0

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function throttle(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed)
  }
  lastRequestTime = Date.now()
}

// --- Cache ---

interface CacheEntry {
  data: string
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const MAX_CACHE_ENTRIES = 50
const MAX_CACHE_BYTES = 50 * 1024 * 1024 // 50MB
let cacheBytes = 0

function getCached(key: string, ttlMs: number): string | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > ttlMs) {
    cacheBytes -= entry.data.length * 2 // rough byte estimate for JS strings
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: string): void {
  const dataBytes = data.length * 2 // rough byte estimate

  // Evict oldest entries until under limits
  while ((cache.size >= MAX_CACHE_ENTRIES || cacheBytes + dataBytes > MAX_CACHE_BYTES) && cache.size > 0) {
    let oldest: string | null = null
    let oldestTime = Infinity
    for (const [k, v] of cache) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp
        oldest = k
      }
    }
    if (oldest) {
      const evicted = cache.get(oldest)
      if (evicted) cacheBytes -= evicted.data.length * 2
      cache.delete(oldest)
    } else {
      break
    }
  }

  cache.set(key, { data, timestamp: Date.now() })
  cacheBytes += dataBytes
}

// Cache TTLs
const TTL = {
  VIDEO_LOAD: 24 * 60 * 60 * 1000,       // 24h — MP4 URLs are stable
  MEETING_LIST: 15 * 60 * 1000,            // 15min
  SCHEDULE: 5 * 60 * 1000,                 // 5min
  COMMITTEE_ROSTER: 24 * 60 * 60 * 1000,   // 24h
  MEMBER_DETAIL: 24 * 60 * 60 * 1000,      // 24h
  STATUS_ACTIVITY: 60 * 60 * 1000,          // 1h
  CALENDAR: 60 * 60 * 1000,                // 1h for future dates
  CALENDAR_PAST: 7 * 24 * 60 * 60 * 1000,  // 7 days for past dates
  INDEFINITE: 365 * 24 * 60 * 60 * 1000,   // effectively forever
} as const

// --- Core fetch ---

async function throttledFetch(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  await throttle()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        ...options?.headers,
      },
    })
    return response
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError(`Request timed out after ${timeoutMs}ms: ${url}`)
    }
    throw new NetworkError(error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await throttledFetch(url, options, timeoutMs)

      if (response.ok) return response

      if (response.status === 429) {
        throw new RateLimitError(429)
      }

      if (response.status >= 500 && attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 1000)
        continue
      }

      return response // 4xx errors don't retry (except 429)
    } catch (error) {
      if (error instanceof RateLimitError) throw error
      if (error instanceof NetworkError && attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 1000)
        continue
      }
      throw error
    }
  }

  throw new NetworkError(`Failed after ${maxRetries} retries: ${url}`)
}

/** Fetch HTML page with ISO-8859-1 decoding */
async function fetchHtml(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const response = await fetchWithRetry(url, options, 3, timeoutMs)
  // scstatehouse.gov uses ISO-8859-1 encoding
  const buffer = await response.arrayBuffer()
  const html = new TextDecoder('iso-8859-1').decode(buffer)

  // Check for CF challenge before returning
  if (isCloudflareChallenge(html)) {
    throw new CloudflareChallengeError()
  }

  return html
}

/** Fetch JSON response (for the video loadvid endpoint) */
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithRetry(url, options)
  if (!response.ok) {
    if (response.status === 404) {
      throw new NetworkError('Video meeting not found. The meeting key may be invalid.')
    }
    throw new NetworkError(`HTTP ${response.status} from ${url}`)
  }
  return response.json() as Promise<T>
}

// --- Input validation ---

/** Validate member code is numeric only */
function validateMemberCode(code: string): void {
  if (!/^\d+$/.test(code)) {
    throw new Error(`Invalid member code: "${code}" (must be numeric)`)
  }
}

/** Validate county name is alphabetic + spaces only */
function validateCounty(county: string): void {
  if (!/^[A-Za-z\s.'-]+$/.test(county)) {
    throw new Error(`Invalid county name: "${county}" (must be alphabetic)`)
  }
}

/** Validate date is YYYY-MM-DD format */
function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: "${date}" (expected YYYY-MM-DD)`)
  }
}

// --- Public API ---

/**
 * Load video metadata for a specific meeting.
 * POST archives.php with op=loadvid — returns JSON.
 */
export async function loadVideo(key: number, part = 1): Promise<VideoLoadResult> {
  const cacheKey = `video:${key}:${part}`
  const cached = getCached(cacheKey, TTL.VIDEO_LOAD)
  if (cached) return JSON.parse(cached)

  const body = new URLSearchParams({
    op: 'loadvid',
    key: String(key),
    part: String(part),
    time: '0',
    captions: '0',
  })

  const result = await fetchJson<VideoLoadResult>(`${BASE_URL}/video/archives.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  setCache(cacheKey, JSON.stringify(result))
  return result
}

/** Construct full video URL from a reference path */
export function buildVideoUrl(reference: string): string {
  if (!reference) return ''
  if (reference.includes('.mp4')) {
    return `${VIDEO_BASE_URL}/${reference}`
  }
  // YouTube reference — return as-is (it's a YouTube video ID)
  return `https://www.youtube.com/watch?v=${reference}`
}

/** Construct media player URL (for streaming, not download) */
export function buildStreamUrl(reference: string): string {
  if (reference.includes('.mp4')) {
    return `${BASE_URL}/video/sources/mediacluster.php?reference=${encodeURIComponent(reference)}`
  }
  return `${BASE_URL}/video/sources/youtube.htm?reference=${encodeURIComponent(reference)}`
}

/**
 * Get meeting listing with video links.
 * meetings.php?op=vid returns HTML with meeting metadata and MP4 URLs.
 */
export async function getVideoMeetingList(
  chamber?: 'S' | 'H' | 'J',
  code?: string,
): Promise<string> {
  const params = new URLSearchParams({
    op: 'vid',
    loc: 'databox',
    FULLSITE: '1',
  })
  if (chamber) params.set('chamber', chamber)
  params.set('code', code || 'ALL')

  const cacheKey = `video-meetings:${chamber || 'all'}:${code || 'ALL'}`
  const cached = getCached(cacheKey, TTL.MEETING_LIST)
  if (cached) return cached

  const url = `${BASE_URL}/meetings.php?${params.toString()}`
  const html = await fetchHtml(url, undefined, LARGE_TIMEOUT_MS)
  setCache(cacheKey, html)
  return html
}

/** Get upcoming video broadcast schedule */
export async function getVideoSchedule(): Promise<string> {
  const cacheKey = 'video-schedule'
  const cached = getCached(cacheKey, TTL.SCHEDULE)
  if (cached) return cached

  const html = await fetchHtml(`${BASE_URL}/video/schedule.php`)
  setCache(cacheKey, html)
  return html
}

/** Get committee meeting schedule (non-video page) */
export async function getMeetings(chamber?: 'S' | 'H', weekOffset?: number): Promise<string> {
  const params = new URLSearchParams()
  if (chamber) params.set('chamber', chamber)
  if (weekOffset !== undefined) params.set('archiveweek', String(weekOffset))

  const cacheKey = `meetings:${chamber || 'all'}:${weekOffset || 0}`
  const cached = getCached(cacheKey, TTL.MEETING_LIST)
  if (cached) return cached

  const html = await fetchHtml(`${BASE_URL}/meetings.php?${params.toString()}`)
  setCache(cacheKey, html)
  return html
}

/** Convert YYYY-MM-DD to MM/DD/YYYY for scstatehouse.gov POST forms */
function toStatehouseDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) return `${match[2]}/${match[3]}/${match[1]}`
  // Already in MM/DD/YYYY or unknown format — pass through
  return isoDate
}

/** Post status activity report for a date range */
export async function getStatusActivity(
  session: number,
  chamber: 'S' | 'H' | 'B',
  dateFrom: string,
  dateTo: string,
  format: 'title' | 'summary' | 'both' = 'both',
): Promise<string> {
  const cacheKey = `status:${session}:${chamber}:${dateFrom}:${dateTo}:${format}`
  const cached = getCached(cacheKey, TTL.STATUS_ACTIVITY)
  if (cached) return cached

  const body = new URLSearchParams({
    session: String(session),
    chamber,
    begdate: toStatehouseDate(dateFrom),
    enddate: toStatehouseDate(dateTo),
    type: format,
    headerfooter: '1',
  })

  const html = await fetchHtml(`${BASE_URL}/statusact.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  setCache(cacheKey, html)
  return html
}

/** Get committee roster page */
export async function getCommitteeList(chamber: 'S' | 'H'): Promise<string> {
  const cacheKey = `committees:${chamber}`
  const cached = getCached(cacheKey, TTL.COMMITTEE_ROSTER)
  if (cached) return cached

  const html = await fetchHtml(`${BASE_URL}/committee.php?chamber=${chamber}`)
  setCache(cacheKey, html)
  return html
}

/** Get individual member detail page */
export async function getMemberDetail(code: string): Promise<string> {
  validateMemberCode(code)
  const cacheKey = `member:${code}`
  const cached = getCached(cacheKey, TTL.MEMBER_DETAIL)
  if (cached) return cached

  const html = await fetchHtml(`${BASE_URL}/member.php?code=${encodeURIComponent(code)}`)
  setCache(cacheKey, html)
  return html
}

/** Get member roster (for name→code resolution) */
export async function getMemberRoster(chamber: 'S' | 'H'): Promise<string> {
  const cacheKey = `roster:${chamber}`
  const cached = getCached(cacheKey, TTL.COMMITTEE_ROSTER)
  if (cached) return cached

  const html = await fetchHtml(`${BASE_URL}/member.php?chamber=${chamber}`)
  setCache(cacheKey, html)
  return html
}

/** Search legislators by address */
export async function searchLegislatorByAddress(
  address: string,
  city?: string,
  zip?: string,
): Promise<string> {
  const body = new URLSearchParams({ address })
  if (city) body.set('city', city)
  if (zip) body.set('zip', zip)

  return fetchHtml(`${BASE_URL}/legislatorssearch.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

/** Get county delegation */
export async function getDelegation(county: string): Promise<string> {
  validateCounty(county)
  const body = new URLSearchParams({
    delegation: county,
    headerfooter: '1',
  })

  return fetchHtml(`${BASE_URL}/delegations.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

/** Get floor calendar page for a specific date */
export async function getCalendarPage(
  session: number,
  chamber: 'S' | 'H',
  date: string,
): Promise<string> {
  validateDate(date)
  const sessionSuffix = String(session).slice(-2) // 126 → "26"
  const startYear = 1975 + (session - 101) * 2
  const endYear = startYear + 1
  const calPrefix = chamber === 'S' ? 'scal' : 'hcal'
  const dateFormatted = date.replace(/-/g, '') // YYYY-MM-DD → YYYYMMDD

  const url = `${BASE_URL}/sess${session}_${startYear}-${endYear}/${calPrefix}${sessionSuffix}/${dateFormatted}.htm`

  const isPast = new Date(date) < new Date()
  const ttl = isPast ? TTL.CALENDAR_PAST : TTL.CALENDAR
  const cacheKey = `calendar:${chamber}:${date}`
  const cached = getCached(cacheKey, ttl)
  if (cached) return cached

  const html = await fetchHtml(url)
  setCache(cacheKey, html)
  return html
}

/** Get new introductions page for a specific date */
export async function getIntroductionsPage(
  session: number,
  chamber: 'S' | 'H',
  date: string,
): Promise<string> {
  validateDate(date)
  const sessionSuffix = String(session).slice(-2)
  const startYear = 1975 + (session - 101) * 2
  const endYear = startYear + 1
  const introPrefix = chamber === 'S' ? 'sintro' : 'hintro'
  const dateFormatted = date.replace(/-/g, '')

  const url = `${BASE_URL}/sess${session}_${startYear}-${endYear}/${introPrefix}${sessionSuffix}/${dateFormatted}.htm`
  return fetchHtml(url)
}

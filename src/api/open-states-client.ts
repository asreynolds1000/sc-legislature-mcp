import { NetworkError, RateLimitError } from '../errors.js'

const OS_BASE_URL = 'https://v3.openstates.org'
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'
const API_KEY: string = (() => {
  const key = process.env.OPEN_STATES_API_KEY
  if (!key) throw new Error('OPEN_STATES_API_KEY environment variable is required. Get a free key at https://openstates.org/api/register/')
  return key
})()
const USER_AGENT = 'sc-legislature-mcp/0.2.0 (https://github.com/asreynolds1000/sc-legislature-mcp)'

// NOTE: Free tier = 500 requests/day, 1 req/sec. The API returns no rate limit headers,
// so remaining quota cannot be tracked at runtime. Use caching aggressively.

const MIN_DELAY_MS = 1000

// --- Separate rate limiter (does not share state with legislature-client.ts) ---

let osLastRequestTime = 0
let nominatimLastRequestTime = 0

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function throttleOs(): Promise<void> {
  const now = Date.now()
  const elapsed = now - osLastRequestTime
  if (elapsed < MIN_DELAY_MS) await sleep(MIN_DELAY_MS - elapsed)
  osLastRequestTime = Date.now()
}

async function throttleNominatim(): Promise<void> {
  const now = Date.now()
  const elapsed = now - nominatimLastRequestTime
  if (elapsed < MIN_DELAY_MS) await sleep(MIN_DELAY_MS - elapsed)
  nominatimLastRequestTime = Date.now()
}

// --- Cache (separate from legislature-client, keyed with 'os-' prefix) ---

interface CacheEntry {
  data: string
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const MAX_CACHE_ENTRIES = 50
const MAX_CACHE_BYTES = 50 * 1024 * 1024
let cacheBytes = 0

const TTL = {
  PEOPLE: 7 * 24 * 60 * 60 * 1000,    // 7d — legislators change rarely
  BILLS: 6 * 60 * 60 * 1000,           // 6h — bill status changes daily
  BILL_DETAIL: 60 * 60 * 1000,         // 1h
  GEOCODE: 30 * 24 * 60 * 60 * 1000,   // 30d — addresses don't change
} as const

function getCached(key: string, ttlMs: number): string | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > ttlMs) {
    cacheBytes -= entry.data.length * 2
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: string): void {
  const dataBytes = data.length * 2
  while ((cache.size >= MAX_CACHE_ENTRIES || cacheBytes + dataBytes > MAX_CACHE_BYTES) && cache.size > 0) {
    let oldest: string | null = null
    let oldestTime = Infinity
    for (const [k, v] of cache) {
      if (v.timestamp < oldestTime) { oldestTime = v.timestamp; oldest = k }
    }
    if (oldest) {
      const evicted = cache.get(oldest)
      if (evicted) cacheBytes -= evicted.data.length * 2
      cache.delete(oldest)
    } else break
  }
  cache.set(key, { data, timestamp: Date.now() })
  cacheBytes += dataBytes
}

// --- Core fetch ---

async function fetchOs<T>(path: string, params: Record<string, string | string[]> = {}): Promise<T> {
  await throttleOs()

  const url = new URL(`${OS_BASE_URL}${path}`)
  url.searchParams.set('apikey', API_KEY)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item)
    } else {
      url.searchParams.set(k, v)
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    })

    if (response.status === 429) throw new RateLimitError(429)
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new NetworkError(`Open States API error ${response.status}: ${body.slice(0, 200)}`)
    }

    return response.json() as Promise<T>
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof NetworkError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError('Open States request timed out after 30s')
    }
    throw new NetworkError(error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timeout)
  }
}

// --- Types for raw API responses ---

interface OsPersonRaw {
  id: string
  name: string
  party: string
  current_role: {
    title: string
    org_classification: 'upper' | 'lower'
    district: string
    division_id: string
  }
  jurisdiction: {
    id: string
    name: string
    classification: 'country' | 'state'
  }
  given_name: string
  family_name: string
  email: string
  image: string
  openstates_url: string
  offices?: Array<{ name: string; voice?: string; address?: string; classification: string }>
  links?: Array<{ url: string; note: string }>
}

interface OsBillRaw {
  id: string
  identifier: string
  title: string
  session: string
  jurisdiction: { id: string; name: string; classification: string }
  from_organization?: { name: string; classification: string }
  classification: string[]
  subject: string[]
  abstracts?: Array<{ abstract: string; note: string }>
  sponsorships?: Array<{
    name: string
    classification: string
    entity_type: string
    primary: boolean
    person?: { id: string; name: string }
  }>
  actions?: Array<{
    date: string
    description: string
    classification: string[]
    organization: { name: string; classification: string }
  }>
  openstates_url: string
  updated_at: string
}

interface OsBillsResponse {
  results: OsBillRaw[]
  pagination: { per_page: number; page: number; max_page: number; total_items: number }
}

interface OsPeopleResponse {
  results: OsPersonRaw[]
  pagination: { per_page: number; page: number; max_page: number; total_items: number }
}

// --- Geocoding via Nominatim ---

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; displayName: string }> {
  const cacheKey = `os-geo:${address.toLowerCase().trim()}`
  const cached = getCached(cacheKey, TTL.GEOCODE)
  if (cached) return JSON.parse(cached)

  await throttleNominatim()

  const url = new URL(`${NOMINATIM_BASE_URL}/search`)
  url.searchParams.set('q', address)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'us')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    })

    if (!response.ok) throw new NetworkError(`Geocoding error: HTTP ${response.status}`)

    const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>
    if (!results.length) throw new NetworkError(`Could not geocode address: "${address}". Try including city and state.`)

    const result = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), displayName: results[0].display_name }
    setCache(cacheKey, JSON.stringify(result))
    return result
  } catch (error) {
    if (error instanceof NetworkError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError('Geocoding request timed out')
    }
    throw new NetworkError(error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timeout)
  }
}

// --- Public API ---

export interface OsRepresentative {
  name: string
  party: string
  role: string
  district: string
  chamber: 'Senate' | 'House' | string
  email: string
  website: string
  phone: string
  ocd_person_id: string
  openstates_url: string
}

export interface OsBillSummary {
  identifier: string
  title: string
  session: string
  subjects: string[]
  abstract: string
  latest_action: string
  latest_action_date: string
  sponsors: Array<{ name: string; classification: string; primary: boolean }>
  openstates_url: string
}

export interface OsBillDetail extends OsBillSummary {
  actions: Array<{ date: string; description: string; classification: string[] }>
}

export interface OsBillsResult {
  total: number
  page: number
  per_page: number
  max_page: number
  bills: OsBillSummary[]
}

/** Normalize a bill identifier: "s330" → "S 330", "H 1234" stays "H 1234" */
export function normalizeBillId(id: string): string {
  const trimmed = id.trim().toUpperCase().replace(/\s+/g, ' ')
  // Already has space: "S 330" → keep
  if (/^[A-Z]+\s\d+$/.test(trimmed)) return trimmed
  // No space: "S330" → "S 330"
  const match = trimmed.match(/^([A-Z]+)(\d+)$/)
  if (match) return `${match[1]} ${match[2]}`
  return trimmed
}

function mapPerson(p: OsPersonRaw): OsRepresentative {
  const website = p.links?.find((l) => l.note === 'homepage')?.url || ''
  const phone = p.offices?.find((o) => o.voice)?.voice || ''
  const chamber = p.current_role?.org_classification === 'upper' ? 'Senate' : 'House'

  return {
    name: p.name,
    party: p.party,
    role: p.current_role?.title || '',
    district: p.current_role?.district || '',
    chamber,
    email: p.email || '',
    website,
    phone,
    ocd_person_id: p.id,
    openstates_url: p.openstates_url,
  }
}

function mapBillSummary(b: OsBillRaw): OsBillSummary {
  const actions = b.actions || []
  const lastAction = actions[actions.length - 1]
  const sponsors = (b.sponsorships || []).map((s) => ({
    name: s.name,
    classification: s.classification,
    primary: s.primary,
  }))
  return {
    identifier: b.identifier,
    title: b.title,
    session: b.session,
    subjects: b.subject || [],
    abstract: b.abstracts?.[0]?.abstract || '',
    latest_action: lastAction?.description || '',
    latest_action_date: lastAction?.date || '',
    sponsors,
    openstates_url: b.openstates_url,
  }
}

/** Get representatives for a geographic location. Returns raw results separated into federal/state. */
export async function getPeopleGeo(lat: number, lng: number): Promise<{ federal: OsRepresentative[]; state: OsRepresentative[] }> {
  const cacheKey = `os-geo-people:${lat.toFixed(4)},${lng.toFixed(4)}`
  const cached = getCached(cacheKey, TTL.PEOPLE)
  if (cached) return JSON.parse(cached)

  const data = await fetchOs<OsPeopleResponse>('/people.geo', {
    lat: String(lat),
    lng: String(lng),
    include: ['offices', 'links'],
  })

  const FEDERAL_JURISDICTION = 'ocd-jurisdiction/country:us/government'
  const federal = data.results
    .filter((p) => p.jurisdiction.id === FEDERAL_JURISDICTION)
    .map(mapPerson)
  const state = data.results
    .filter((p) => p.jurisdiction.id !== FEDERAL_JURISDICTION)
    .map(mapPerson)

  const result = { federal, state }
  setCache(cacheKey, JSON.stringify(result))
  return result
}

/** Search bills. jurisdiction defaults to 'sc'. */
export async function searchBills(params: {
  q?: string
  jurisdiction?: string
  session?: string
  chamber?: string
  sponsor_id?: string
  updated_since?: string
  page?: number
  per_page?: number
}): Promise<OsBillsResult> {
  const jurisdiction = params.jurisdiction || 'sc'
  const session = params.session || '2025-2026'

  const queryParams: Record<string, string | string[]> = {
    jurisdiction,
    session,
    include: ['sponsorships', 'abstracts', 'actions'],
    per_page: String(params.per_page || 20),
    page: String(params.page || 1),
  }
  if (params.q) queryParams.q = params.q
  if (params.chamber) queryParams.chamber = params.chamber
  if (params.sponsor_id) queryParams.sponsor = params.sponsor_id
  if (params.updated_since) queryParams.updated_since = params.updated_since

  const cacheKey = `os-bills:${JSON.stringify(queryParams)}`
  const cached = getCached(cacheKey, TTL.BILLS)
  if (cached) return JSON.parse(cached)

  const data = await fetchOs<OsBillsResponse>('/bills', queryParams)
  const result: OsBillsResult = {
    total: data.pagination.total_items,
    page: data.pagination.page,
    per_page: data.pagination.per_page,
    max_page: data.pagination.max_page,
    bills: data.results.map(mapBillSummary),
  }
  setCache(cacheKey, JSON.stringify(result))
  return result
}

/** Get full bill detail by UUID or by normalized identifier. */
export async function getBillDetail(billId: string, jurisdiction = 'sc', session = '2025-2026'): Promise<OsBillDetail> {
  const isUuid = billId.startsWith('ocd-bill/')

  if (isUuid) {
    const cacheKey = `os-bill:${billId}`
    const cached = getCached(cacheKey, TTL.BILL_DETAIL)
    if (cached) return JSON.parse(cached)

    const data = await fetchOs<OsBillRaw>(`/bills/${encodeURIComponent(billId)}`, {
      include: ['sponsorships', 'abstracts', 'actions'],
    })
    const result: OsBillDetail = {
      ...mapBillSummary(data),
      actions: (data.actions || []).map((a) => ({
        date: a.date,
        description: a.description,
        classification: a.classification,
      })),
    }
    setCache(cacheKey, JSON.stringify(result))
    return result
  }

  // Short identifier — use search with identifier filter
  const normalized = normalizeBillId(billId)
  const cacheKey = `os-bill:${jurisdiction}:${session}:${normalized}`
  const cached = getCached(cacheKey, TTL.BILL_DETAIL)
  if (cached) return JSON.parse(cached)

  const data = await fetchOs<OsBillsResponse>('/bills', {
    jurisdiction,
    session,
    identifier: normalized,
    include: ['sponsorships', 'abstracts', 'actions'],
    per_page: '1',
  })

  if (!data.results.length) {
    throw new NetworkError(`Bill "${normalized}" not found in ${jurisdiction} session ${session}`)
  }

  const b = data.results[0]
  const result: OsBillDetail = {
    ...mapBillSummary(b),
    actions: (b.actions || []).map((a) => ({
      date: a.date,
      description: a.description,
      classification: a.classification,
    })),
  }
  setCache(cacheKey, JSON.stringify(result))
  return result
}

/** Search legislators by name, district, or chamber. SC-only. */
export async function searchLegislators(params: {
  name?: string
  district?: string
  chamber?: 'upper' | 'lower'
  jurisdiction?: string
}): Promise<{ count: number; total: number; page: number; per_page: number; max_page: number; legislators: OsRepresentative[] }> {
  const jurisdiction = params.jurisdiction || 'sc'

  const queryParams: Record<string, string | string[]> = {
    jurisdiction,
    include: ['offices'],
    per_page: '20',
  }
  if (params.name) queryParams.name = params.name
  if (params.district) queryParams.district = params.district
  if (params.chamber) queryParams.org_classification = params.chamber

  const cacheKey = `os-people:${JSON.stringify(queryParams)}`
  const cached = getCached(cacheKey, TTL.PEOPLE)
  if (cached) return JSON.parse(cached)

  const data = await fetchOs<OsPeopleResponse>('/people', queryParams)
  const result = {
    count: data.results.length,
    total: data.pagination.total_items,
    page: data.pagination.page,
    per_page: data.pagination.per_page,
    max_page: data.pagination.max_page,
    legislators: data.results.map(mapPerson),
  }
  setCache(cacheKey, JSON.stringify(result))
  return result
}

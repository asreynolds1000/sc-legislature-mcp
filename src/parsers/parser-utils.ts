import { parse, HTMLElement } from 'node-html-parser'
import { ParserStructureError, CloudflareChallengeError } from '../errors.js'

/** Check if HTML response is a Cloudflare challenge page */
export function isCloudflareChallenge(html: string): boolean {
  // CF challenge indicators
  if (html.includes('<title>Just a moment...</title>')) return true
  if (html.includes('cf-browser-verification')) return true
  if (html.includes('cf_chl_opt')) return true
  if (html.includes('challenges.cloudflare.com')) return true
  return false
}

/** Throw CloudflareChallengeError if the HTML is a CF challenge page */
export function rejectIfCloudflare(html: string): void {
  if (isCloudflareChallenge(html)) {
    throw new CloudflareChallengeError()
  }
}

/** Assert that the parsed HTML contains at least one table element */
export function assertHasTable(root: HTMLElement, context: string): void {
  const tables = root.querySelectorAll('table')
  if (tables.length === 0) {
    throw new ParserStructureError(context, 'No <table> elements found in page')
  }
}

/** Assert that a header row contains the expected column names (case-insensitive, substring match) */
export function assertColumnHeaders(
  headerRow: HTMLElement | null,
  expected: string[],
  context: string,
): void {
  if (!headerRow) {
    throw new ParserStructureError(context, 'No header row found')
  }
  const cells = headerRow.querySelectorAll('th, td')
  const actualHeaders = cells.map((c) => c.text.trim().toLowerCase())

  for (const exp of expected) {
    const found = actualHeaders.some((h) => h.includes(exp.toLowerCase()))
    if (!found) {
      throw new ParserStructureError(
        context,
        `Expected column "${exp}" not found. Actual headers: [${actualHeaders.join(', ')}]`,
      )
    }
  }
}

/** Parse HTML string into a root element, rejecting CF challenges first */
export function safeParse(html: string, context: string): HTMLElement {
  rejectIfCloudflare(html)
  if (!html || html.trim().length === 0) {
    throw new ParserStructureError(context, 'Empty HTML response')
  }
  return parse(html)
}

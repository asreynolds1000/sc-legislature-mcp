import { safeParse } from './parser-utils.js'
import { ParserStructureError } from '../errors.js'
import type { LegislatorResult } from '../types.js'

/**
 * Parse the legislatorssearch.php POST response.
 * Returns legislators matching an address search.
 * Results include links to member profiles with name and district.
 */
export function parseLegislatorSearch(html: string): LegislatorResult[] {
  let root
  try {
    root = safeParse(html, 'legislator-search')
  } catch (e) {
    if (e instanceof ParserStructureError) return []
    throw e
  }
  const results: LegislatorResult[] = []

  const links = root.querySelectorAll('a[href*="member.php?code="]')
  for (const link of links) {
    const href = link.getAttribute('href') || ''
    const codeMatch = href.match(/code=(\d+)/)
    const name = link.text.replace(/&nbsp;/g, ' ').trim()
    if (!name) continue

    // Determine chamber and district from context
    const parentText = (link.parentNode?.text || '').replace(/&nbsp;/g, ' ')
    const chamber: 'S' | 'H' = parentText.toLowerCase().includes('senator') ||
      parentText.toLowerCase().includes('senate') ? 'S' : 'H'
    const distMatch = parentText.match(/District\s+(\d+)/i)
    const district = distMatch ? `District ${distMatch[1]}` : ''

    results.push({
      name,
      chamber,
      district,
      memberCode: codeMatch ? codeMatch[1] : undefined,
    })
  }

  return results
}

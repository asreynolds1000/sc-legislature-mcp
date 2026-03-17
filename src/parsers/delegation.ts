import { safeParse } from './parser-utils.js'
import { ParserStructureError } from '../errors.js'
import type { DelegationMember } from '../types.js'

/**
 * Parse the delegations.php POST response for county delegation members.
 *
 * Structure: <ul> lists with <li> containing member links:
 * <li><a href="/member.php?code=15340908">Karl B. Allen, District 7</a></li>
 *
 * Senate and House members are in separate <ul> sections,
 * preceded by "Senate" or "House" headers.
 */
export function parseDelegation(html: string): DelegationMember[] {
  let root
  try {
    root = safeParse(html, 'delegation')
  } catch (e) {
    if (e instanceof ParserStructureError) return []
    throw e
  }
  const members: DelegationMember[] = []

  // Find the delegation content div
  const contentDiv = root.querySelector('#delegationcontent') || root
  const allHtml = contentDiv.innerHTML

  // Find positions of Senate and House section headers
  // Pattern: "South Carolina Senate Delegation" and "South Carolina House Delegation"
  const senatePos = allHtml.indexOf('Senate Delegation')
  const housePos = allHtml.indexOf('House Delegation')
  // Also handle "U.S. Congressional" section — skip those members
  const congressPos = allHtml.indexOf('Congressional Delegation')

  const links = contentDiv.querySelectorAll('a[href*="member.php?code="]')

  for (const link of links) {
    const href = link.getAttribute('href') || ''
    const codeMatch = href.match(/code=(\d+)/)
    const text = link.text.replace(/&nbsp;/g, ' ').trim()
    if (!text) continue

    // Skip U.S. Congressional delegation members (federal, not state)
    const linkPos = allHtml.indexOf(href)
    if (congressPos >= 0 && linkPos > congressPos) continue

    // Parse "Karl B. Allen, District 7" or "Thomas D. "Tom" Corbin, District 5"
    const parts = text.match(/^(.+?),\s*District\s+(\d+)$/i)
    const name = parts ? parts[1].trim() : text
    const district = parts ? `District ${parts[2]}` : ''

    // Determine chamber by position relative to Senate/House headers
    let chamber: 'S' | 'H' = 'H'
    if (senatePos >= 0 && housePos >= 0) {
      chamber = linkPos < housePos ? 'S' : 'H'
    } else if (senatePos >= 0) {
      chamber = 'S'
    }

    members.push({
      name,
      chamber,
      district,
      memberCode: codeMatch ? codeMatch[1] : undefined,
    })
  }

  return members
}

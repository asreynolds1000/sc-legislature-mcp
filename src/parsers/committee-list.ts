import { parse } from 'node-html-parser'
import { rejectIfCloudflare } from './parser-utils.js'
import type { Committee, CommitteeMember } from '../types.js'

/**
 * Parse the committee.php?chamber=S|H response.
 *
 * Structure: A header div list with committee names, chairs, phones, rooms,
 * followed by detail sections anchored by <a name="agr">, etc.
 * Each detail section has member links with roles (Chairman, Vice Chairman).
 *
 * Header row pattern:
 * <div style="width:750px..."><div>CommitteeName</div><div>ChairName</div><div>Phone</div><div>Room</div></div>
 *
 * Detail section pattern:
 * <a name="agr"></a>
 * <h3>Agriculture and Natural Resources</h3>
 * <b>Chairman:</b> <a href="/member.php?code=XXX">Name</a>
 * Members listed as <a href="/member.php?code=XXX">Name</a>
 */
export function parseCommitteeList(html: string, chamber: 'S' | 'H'): Committee[] {
  rejectIfCloudflare(html)

  const root = parse(html)
  const committees: Committee[] = []

  // Find all anchor names (committee abbreviations like "agr", "ban", etc.)
  const anchors = root.querySelectorAll('a[name]')
  const committeeAnchors = anchors.filter((a) => {
    const name = a.getAttribute('name') || ''
    // Committee anchors are short lowercase strings (not numbers, not long IDs)
    return name.length >= 2 && name.length <= 5 && /^[a-z]+$/.test(name)
  })

  for (const anchor of committeeAnchors) {
    const abbr = anchor.getAttribute('name') || ''

    // Find the committee name — in h4 > a link after the anchor, or h3/bold
    let container = anchor.parentNode
    if (!container) continue

    // Walk siblings to find committee content
    const containerHtml = container.innerHTML || ''

    // The anchor position in the HTML — find the h4 that follows it
    const anchorPos = containerHtml.indexOf(`name="${abbr}"`)
    const afterAnchor = anchorPos >= 0 ? containerHtml.substring(anchorPos) : containerHtml

    // Try h4 > a pattern first (Senate committees), then h3, then bold
    const nameMatch = afterAnchor.match(/<h[34][^>]*>(?:<a[^>]*>)?\s*([^<]+)\s*(?:<\/a>)?<\/h[34]>/i)
      || afterAnchor.match(/<b>\s*([^<]+)\s*<\/b>/i)
    const committeeName = nameMatch ? nameMatch[1].replace(/&nbsp;/g, ' ').trim() : abbr

    // Extract all member links
    const memberLinks = container.querySelectorAll('a[href*="member.php?code="]')
    const members: CommitteeMember[] = []

    for (const link of memberLinks) {
      const href = link.getAttribute('href') || ''
      const codeMatch = href.match(/code=(\d+)/)
      const memberCode = codeMatch ? codeMatch[1] : ''
      const name = link.text.replace(/&nbsp;/g, ' ').trim()

      if (!name || !memberCode) continue

      // Determine role by checking surrounding text
      const surroundingText = (link.parentNode?.text || '').toLowerCase()
      let role: 'Chair' | 'Vice Chair' | 'Member' = 'Member'
      if (surroundingText.includes('chairman') && !surroundingText.includes('vice')) {
        role = 'Chair'
      } else if (surroundingText.includes('vice chairman') || surroundingText.includes('vice-chairman')) {
        role = 'Vice Chair'
      }

      members.push({ name, memberCode, role })
    }

    if (members.length > 0) {
      committees.push({
        name: committeeName,
        abbreviation: abbr,
        chamber,
        members,
      })
    }
  }

  return committees
}

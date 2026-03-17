import { safeParse } from './parser-utils.js'
import type { MemberDetail } from '../types.js'

/**
 * Parse the member.php?code=XXX response for a single legislator's profile.
 *
 * Structure:
 * - Photo: <img src="/images/members/0002272727.jpg">
 * - Name in breadcrumbs: "Senator Brian Adams"
 * - District: "District 44 - Berkeley & Charleston Counties"
 * - Columbia Address with phone
 * - Home Address
 * - Committees: <li><a href="/committee.php?chamber=S#cor">Corrections and Penology</a></li>
 * - District map: <a href="/maps/senate/Sen44.pdf">
 */
export function parseMemberDetail(html: string): MemberDetail {
  const root = safeParse(html, 'member-detail')

  // Extract name from breadcrumbs: "Senate > Members of the Senate > Senator Brian Adams"
  // Or from the h2 element directly
  const h2 = root.querySelector('h2')
  const h2Text = h2?.text?.replace(/&nbsp;/g, ' ').trim() || ''
  const breadcrumbs = root.querySelector('#breadcrumbs')
  const breadcrumbText = breadcrumbs?.text || ''

  // Try h2 first (more reliable), then breadcrumbs
  const nameSource = h2Text || breadcrumbText
  const nameMatch = nameSource.match(/(?:Senator|Representative)\s+(.+?)(?:\s*$|\s*>)/)
  const fullName = nameMatch ? nameMatch[1].trim() : ''
  const chamber: 'S' | 'H' = nameSource.includes('Senator') ? 'S' : 'H'

  // Extract member code from photo URL
  const photoImg = root.querySelector('img[src*="/images/members/"]')
  const photoSrc = photoImg?.getAttribute('src') || ''
  const codeMatch = photoSrc.match(/\/(\d+)\.jpg/)
  const memberCode = codeMatch ? codeMatch[1] : ''
  const photoUrl = photoSrc ? `https://www.scstatehouse.gov${photoSrc}` : ''

  // Extract district info — find the <p> containing "District"
  const allParagraphs = root.querySelectorAll('p')
  const districtP = allParagraphs.find((p) => p.text.includes('District'))
  const districtText = districtP?.text?.replace(/&nbsp;/g, ' ').replace(/\s*-\s*Map$/, '').trim() || ''
  const districtMatch = districtText.match(/District\s+(\d+)\s*-\s*(.+)/)
  const district = districtMatch ? `District ${districtMatch[1]} - ${districtMatch[2].trim()}` : districtText

  // Extract party — look in the paragraph near the district info, not the full page
  // The party appears in a <p> with font-size:17px near the top (e.g., "Republican - Berkeley")
  let party = ''
  const partyP = allParagraphs.find((p) => {
    const text = p.text.trim()
    return (text.includes('Republican') || text.includes('Democrat')) && text.length < 100
  })
  if (partyP) {
    const partyText = partyP.text.trim()
    if (partyText.includes('Republican')) party = 'R'
    else if (partyText.includes('Democrat')) party = 'D'
  }

  // Extract Columbia address and phone
  const allText = root.innerHTML
  const phoneMatch = allText.match(/Business Phone<\/span>\s*([0-9-]+)/)
  const phone = phoneMatch ? phoneMatch[1].trim() : ''

  // Extract address from Columbia Address section
  let address = ''
  const colAddrMatch = allText.match(/Columbia Address<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i)
  if (colAddrMatch) {
    address = colAddrMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  }

  // Extract email (if present)
  const emailMatch = allText.match(/mailto:([^"]+)"/)
  const email = emailMatch ? emailMatch[1] : ''

  // Extract committees
  const committeeLinks = root.querySelectorAll('a[href*="committee.php"]')
  const committees = committeeLinks
    .map((a) => a.text.replace(/&nbsp;/g, ' ').trim())
    .filter((name) => name.length > 0 && !name.includes('Standing'))

  // Extract district map URL
  const mapLink = root.querySelector('a[href*="/maps/"]')
  const mapHref = mapLink?.getAttribute('href') || ''
  const districtMapUrl = mapHref ? `https://www.scstatehouse.gov${mapHref}` : undefined

  // Extract bio (if present)
  const bio = '' // Bio text varies too much to reliably parse

  return {
    name: fullName,
    memberCode,
    district,
    party,
    chamber,
    photoUrl,
    bio,
    address,
    phone,
    email,
    committees,
    districtMapUrl,
  }
}

/**
 * Parse the member roster page (member.php?chamber=S|H) to extract name→code mappings.
 * Used for resolving names to member codes.
 */
export function parseMemberRoster(html: string): Array<{ name: string; memberCode: string; district: string; party: string }> {
  const root = safeParse(html, 'member-roster')
  const members: Array<{ name: string; memberCode: string; district: string; party: string }> = []

  const links = root.querySelectorAll('a[href*="member.php?code="]')
  for (const link of links) {
    const href = link.getAttribute('href') || ''
    const codeMatch = href.match(/code=(\d+)/)
    if (!codeMatch) continue

    const name = link.text.replace(/&nbsp;/g, ' ').trim()
    if (!name) continue

    // District and party info may be in surrounding text
    const parentText = link.parentNode?.text || ''
    const distMatch = parentText.match(/District\s+(\d+)/)
    const district = distMatch ? `District ${distMatch[1]}` : ''

    let party = ''
    if (parentText.includes('(R)')) party = 'R'
    else if (parentText.includes('(D)')) party = 'D'

    members.push({
      name,
      memberCode: codeMatch[1],
      district,
      party,
    })
  }

  return members
}

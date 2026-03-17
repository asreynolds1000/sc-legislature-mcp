import { safeParse } from './parser-utils.js'
import type { StatusActivity } from '../types.js'

/**
 * Parse the statusact.php POST response for bill status activity.
 *
 * The resultsbox div contains bill entries. When the legislature is in session,
 * entries appear as bill links with titles and action descriptions.
 * When there's no activity, the page shows "No activity during this time frame."
 *
 * The page structure (when there IS activity) contains:
 * - Date headers in bold
 * - Bill links with billnumber text
 * - Action descriptions in adjacent text
 * - Title text (when "both" format selected)
 */
export function parseStatusActivity(html: string): StatusActivity[] {
  const root = safeParse(html, 'status-activity')
  const activities: StatusActivity[] = []

  // Check for "No activity" message
  const pageText = root.text
  if (pageText.includes('No activity during this time frame') || pageText.includes('No bills found')) {
    return []
  }

  // Find the results container
  const resultsBox = root.querySelector('#resultsbox')
  if (!resultsBox) return []

  const resultsHtml = resultsBox.innerHTML

  // Extract date from the page header (e.g., "Status Activity on 03/17/2026")
  const dateMatch = resultsHtml.match(/Status Activity on (\d{2}\/\d{2}\/\d{4})/)
  const reportDate = dateMatch ? dateMatch[1] : ''

  // Look for bill links — these are the primary content
  const links = resultsBox.querySelectorAll('a[href*="billsearch"]')

  for (const link of links) {
    const billNumber = link.text.trim()
    if (!billNumber) continue

    // Determine chamber from bill prefix
    const chamber: 'S' | 'H' = billNumber.toUpperCase().startsWith('H') ? 'H' : 'S'

    // Get surrounding text for title and action
    const parent = link.parentNode
    if (!parent) continue

    const parentHtml = parent.innerHTML
    const parentText = parent.text.replace(/&nbsp;/g, ' ').trim()

    // Extract text after the bill number link for title/action
    const linkEndPos = parentHtml.indexOf('</a>', parentHtml.indexOf(link.getAttribute('href') || ''))
    const afterLink = linkEndPos >= 0
      ? parentHtml.substring(linkEndPos + 4).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      : ''

    // Split into title and action if possible
    // Common pattern: "Title -- Action description"
    const dashSplit = afterLink.split(/\s*[-—]+\s*/)
    const title = dashSplit[0]?.trim() || ''
    const action = dashSplit.slice(1).join(' — ').trim() || afterLink

    activities.push({
      billNumber,
      title,
      action,
      actionDate: reportDate,
      chamber,
    })
  }

  return activities
}

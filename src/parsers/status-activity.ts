import { parse } from 'node-html-parser'
import { rejectIfCloudflare } from './parser-utils.js'
import type { StatusActivity } from '../types.js'

/**
 * Parse the statusact.php POST response for bill status activity.
 *
 * The response contains bill actions in a formatted HTML page.
 * Bill entries appear as links with billnumber text followed by action descriptions.
 */
export function parseStatusActivity(html: string): StatusActivity[] {
  rejectIfCloudflare(html)

  const root = parse(html)
  const activities: StatusActivity[] = []

  // Status activity shows date header and bill entries
  // Look for billsearch links which contain bill numbers
  const links = root.querySelectorAll('a[href*="billsearch"]')

  for (const link of links) {
    const billNumber = link.text.trim()
    if (!billNumber || !billNumber.match(/^[SH]\.?\s*\d+/i)) continue

    const href = link.getAttribute('href') || ''

    // Get the surrounding text for the action description
    const parent = link.parentNode
    if (!parent) continue

    const parentText = parent.text.replace(/&nbsp;/g, ' ').trim()

    // Extract title — typically in bold or after the bill number
    // Pattern: "S. 123 — Title text here"
    const titleMatch = parentText.match(new RegExp(billNumber.replace(/\./g, '\\.') + '\\s*[-—]?\\s*(.+)'))
    const title = titleMatch ? titleMatch[1].trim() : ''

    // Determine chamber from bill prefix
    const chamber: 'S' | 'H' = billNumber.startsWith('H') ? 'H' : 'S'

    activities.push({
      billNumber,
      title,
      action: '', // Will be populated if we can find the action text
      actionDate: '',
      chamber,
    })
  }

  return activities
}

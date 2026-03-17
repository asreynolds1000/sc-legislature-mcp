import { parse } from 'node-html-parser'
import { rejectIfCloudflare } from './parser-utils.js'
import type { Introduction } from '../types.js'

/**
 * Parse an introductions page (e.g., /sess126_2025-2026/sintro26/20260317.htm).
 *
 * Introduction pages list newly filed bills with bill number, sponsor, and title.
 */
export function parseIntroductions(html: string): Introduction[] {
  rejectIfCloudflare(html)

  const root = parse(html)
  const introductions: Introduction[] = []

  // Introduction pages have bill links and descriptions
  const links = root.querySelectorAll('a[href*="billsearch"]')

  for (const link of links) {
    const billNumber = link.text.trim()
    if (!billNumber) continue

    const parent = link.parentNode
    const contextText = parent ? parent.text.replace(/&nbsp;/g, ' ').trim() : ''

    // Determine chamber from bill prefix
    const chamber: 'S' | 'H' = billNumber.startsWith('H') ? 'H' : 'S'

    // Extract sponsor and title from context
    const afterBill = contextText.substring(contextText.indexOf(billNumber) + billNumber.length).trim()
    // Common pattern: "by Sen. Name -- Title"
    const sponsorMatch = afterBill.match(/by\s+((?:Sen\.|Rep\.)\s*[^-—]+)\s*[-—]\s*(.+)/i)

    introductions.push({
      billNumber,
      title: sponsorMatch ? sponsorMatch[2].trim() : afterBill.substring(0, 200).trim(),
      primarySponsor: sponsorMatch ? sponsorMatch[1].trim() : '',
      chamber,
      dateIntroduced: '',
    })
  }

  return introductions
}

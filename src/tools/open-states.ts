import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { formatToolError } from '../errors.js'
import {
  geocodeAddress,
  getPeopleGeo,
  searchBills,
  getBillDetail,
  searchLegislators,
  normalizeBillId,
} from '../api/open-states-client.js'

export function registerOpenStatesTools(server: McpServer) {
  // --- find_representatives ---
  server.tool(
    'find_representatives',
    'Find all elected representatives for an address — SC state legislators (Senate + House) AND federal representatives (US Senators + US House). Returns ocd_person_id for each rep, which can be passed to get_legislator_bills.',
    {
      address: z.string().describe('Full street address including city and state (e.g., "31 Noble Wing Lane, Taylors, SC 29687")'),
    },
    async (args) => {
      try {
        const geo = await geocodeAddress(args.address)
        const { federal, state } = await getPeopleGeo(geo.lat, geo.lng)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              address_matched: geo.displayName,
              coordinates: { lat: geo.lat, lng: geo.lng },
              federal: federal.map((r) => ({
                name: r.name,
                role: r.role,
                party: r.party,
                district: r.district,
                email: r.email || undefined,
                website: r.website || undefined,
                phone: r.phone || undefined,
                ocd_person_id: r.ocd_person_id,
                openstates_url: r.openstates_url,
              })),
              state: state.map((r) => ({
                name: r.name,
                role: r.role,
                party: r.party,
                district: r.district,
                chamber: r.chamber,
                email: r.email || undefined,
                website: r.website || undefined,
                phone: r.phone || undefined,
                ocd_person_id: r.ocd_person_id,
                openstates_url: r.openstates_url,
              })),
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- search_bills ---
  server.tool(
    'search_bills',
    'Search SC bills by keyword, sponsor, or subject. Defaults to the current SC session (2025-2026). At least one filter is recommended.',
    {
      q: z.string().optional().describe('Full-text search query (e.g., "property tax", "school funding")'),
      session: z.string().optional().describe('Legislative session (default: "2025-2026")'),
      chamber: z.enum(['upper', 'lower']).optional().describe('Chamber: "upper" = Senate, "lower" = House'),
      sponsor_id: z.string().optional().describe('Filter by sponsor ocd_person_id (from find_representatives or search_legislators)'),
      updated_since: z.string().optional().describe('ISO date — only bills updated after this date (e.g., "2026-03-01")'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
    },
    async (args) => {
      try {
        const result = await searchBills({
          q: args.q,
          session: args.session,
          chamber: args.chamber,
          sponsor_id: args.sponsor_id,
          updated_since: args.updated_since,
          page: args.page,
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: result.total,
              page: result.page,
              per_page: result.per_page,
              max_page: result.max_page,
              bills: result.bills.map((b) => ({
                identifier: b.identifier,
                title: b.title,
                session: b.session,
                subjects: b.subjects.length ? b.subjects : undefined,
                abstract: b.abstract || undefined,
                latest_action: b.latest_action || undefined,
                latest_action_date: b.latest_action_date || undefined,
                primary_sponsor: b.sponsors.find((s) => s.primary)?.name,
                cosponsors: b.sponsors.filter((s) => !s.primary).map((s) => s.name),
                openstates_url: b.openstates_url,
              })),
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_bill ---
  server.tool(
    'get_bill',
    'Get full details for a specific SC bill including all actions (history), sponsors, and abstract. Accepts bill identifier like "S 330", "S330", "H 1234", or an ocd-bill/... UUID.',
    {
      bill_id: z.string().describe('Bill identifier (e.g., "S 330", "H1234") or ocd-bill/... UUID'),
      session: z.string().optional().describe('Legislative session (default: "2025-2026")'),
      jurisdiction: z.string().optional().describe('Jurisdiction (default: "sc")'),
    },
    async (args) => {
      try {
        const bill = await getBillDetail(args.bill_id, args.jurisdiction, args.session)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              identifier: bill.identifier,
              title: bill.title,
              session: bill.session,
              subjects: bill.subjects.length ? bill.subjects : undefined,
              abstract: bill.abstract || undefined,
              primary_sponsor: bill.sponsors.find((s) => s.primary)?.name,
              cosponsors: bill.sponsors.filter((s) => !s.primary).map((s) => s.name),
              action_count: bill.actions.length,
              latest_action: bill.latest_action || undefined,
              latest_action_date: bill.latest_action_date || undefined,
              actions: bill.actions,
              openstates_url: bill.openstates_url,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_legislator_bills ---
  server.tool(
    'get_legislator_bills',
    'Get all bills sponsored by a specific legislator in the current SC session. Pass ocd_person_id from find_representatives or search_legislators output.',
    {
      person_id: z.string().describe('Open States person ID (ocd-person/... UUID, from find_representatives or search_legislators)'),
      session: z.string().optional().describe('Legislative session (default: "2025-2026")'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
    },
    async (args) => {
      try {
        const result = await searchBills({
          sponsor_id: args.person_id,
          session: args.session || '2025-2026',
          per_page: 20,
          page: args.page,
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              person_id: args.person_id,
              session: args.session || '2025-2026',
              total: result.total,
              page: result.page,
              per_page: result.per_page,
              max_page: result.max_page,
              bills: result.bills.map((b) => ({
                identifier: b.identifier,
                title: b.title,
                latest_action: b.latest_action || undefined,
                latest_action_date: b.latest_action_date || undefined,
                openstates_url: b.openstates_url,
              })),
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- search_legislators ---
  server.tool(
    'search_legislators',
    'Search SC state legislators by name, district, or chamber. Returns ocd_person_id for each result, usable with get_legislator_bills. For federal representatives, use find_representatives with an address instead.',
    {
      name: z.string().optional().describe('Legislator name (partial match, e.g., "Elliott", "Jason Elliott")'),
      district: z.string().optional().describe('District number (e.g., "6"). Provide chamber too — district numbers repeat across Senate and House.'),
      chamber: z.enum(['upper', 'lower']).optional().describe('"upper" = Senate, "lower" = House. Required when filtering by district.'),
    },
    async (args) => {
      if (!args.name && !args.district && !args.chamber) {
        return formatToolError(new Error('Provide at least one filter: name, district, or chamber'))
      }

      try {
        const result = await searchLegislators({
          name: args.name,
          district: args.district,
          chamber: args.chamber,
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: result.count,
              total: result.total,
              page: result.page,
              per_page: result.per_page,
              max_page: result.max_page,
              legislators: result.legislators.map((l) => ({
                name: l.name,
                party: l.party,
                role: l.role,
                district: l.district,
                chamber: l.chamber,
                email: l.email || undefined,
                website: l.website || undefined,
                phone: l.phone || undefined,
                ocd_person_id: l.ocd_person_id,
                openstates_url: l.openstates_url,
              })),
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )
}

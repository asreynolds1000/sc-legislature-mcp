import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { formatToolError } from '../errors.js'
import { searchLegislatorByAddress, getDelegation } from '../api/legislature-client.js'
import { parseLegislatorSearch } from '../parsers/legislator-search.js'
import { parseDelegation } from '../parsers/delegation.js'

export function registerMemberTools(server: McpServer) {
  // --- find_legislator_by_address ---
  server.tool(
    'find_legislator_by_address',
    'Find SC state legislators (Senate and House) who represent a given address. "Who represents me?"',
    {
      address: z.string().describe('Street address'),
      city: z.string().optional().describe('City name'),
      zip: z.string().optional().describe('ZIP code'),
    },
    async (args) => {
      try {
        const html = await searchLegislatorByAddress(args.address, args.city, args.zip)
        const results = parseLegislatorSearch(html)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: results.length,
              query: { address: args.address, city: args.city, zip: args.zip },
              legislators: results.map((r) => ({
                name: r.name,
                chamber: r.chamber === 'S' ? 'Senate' : 'House',
                district: r.district,
                member_code: r.memberCode,
              })),
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_county_delegation ---
  server.tool(
    'get_county_delegation',
    'Get SC state legislators in a county delegation — all Senators and Representatives for a given county.',
    {
      county: z.string().describe('County name (e.g., "GREENVILLE", "RICHLAND", "CHARLESTON")'),
    },
    async (args) => {
      try {
        const html = await getDelegation(args.county.toUpperCase())
        const members = parseDelegation(html)

        const senators = members.filter((m) => m.chamber === 'S')
        const reps = members.filter((m) => m.chamber === 'H')

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              county: args.county,
              total_members: members.length,
              senators: senators.map((m) => ({
                name: m.name,
                district: m.district,
                member_code: m.memberCode,
              })),
              representatives: reps.map((m) => ({
                name: m.name,
                district: m.district,
                member_code: m.memberCode,
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

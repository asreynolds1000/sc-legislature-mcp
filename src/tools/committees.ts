import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { formatToolError } from '../errors.js'
import { getCommitteeList, getMemberDetail as fetchMemberDetail, getMemberRoster } from '../api/legislature-client.js'
import { parseCommitteeList } from '../parsers/committee-list.js'
import { parseMemberDetail, parseMemberRoster } from '../parsers/member-detail.js'

export function registerCommitteeTools(server: McpServer) {
  // --- list_committees ---
  server.tool(
    'list_committees',
    'List SC Legislature standing committees with members, chairs, and contact info.',
    {
      chamber: z.enum(['S', 'H']).describe('S=Senate, H=House'),
    },
    async (args) => {
      try {
        const html = await getCommitteeList(args.chamber)
        const committees = parseCommitteeList(html, args.chamber)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: committees.length,
              chamber: args.chamber === 'S' ? 'Senate' : 'House',
              committees: committees.map((c) => ({
                name: c.name,
                abbreviation: c.abbreviation,
                members: c.members.map((m) => ({
                  name: m.name,
                  role: m.role,
                  member_code: m.memberCode,
                })),
              })),
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_member_detail ---
  server.tool(
    'get_member_detail',
    'Get detailed SC legislator profile: contact info, photo, bio, committee assignments, district map. Accepts member_code (from other tools) or name + chamber for lookup.',
    {
      member_code: z.string().optional().describe('10-digit member code from other tool results'),
      name: z.string().optional().describe('Legislator name for lookup (partial match OK)'),
      chamber: z.enum(['S', 'H']).optional().describe('Required when using name lookup. S=Senate, H=House'),
    },
    async (args) => {
      try {
        let code = args.member_code

        // Name-based lookup: fetch roster, fuzzy match, get code
        if (!code && args.name) {
          if (!args.chamber) {
            return {
              content: [{ type: 'text', text: 'Error: chamber is required when searching by name. Use chamber="S" for Senate or chamber="H" for House.' }],
              isError: true,
            }
          }
          const rosterHtml = await getMemberRoster(args.chamber)
          const roster = parseMemberRoster(rosterHtml)
          const query = args.name.toLowerCase()
          const match = roster.find((m) => m.name.toLowerCase().includes(query))

          if (!match) {
            return {
              content: [{ type: 'text', text: `No ${args.chamber === 'S' ? 'Senator' : 'Representative'} found matching "${args.name}". Try a different spelling or check the other chamber.` }],
              isError: true,
            }
          }
          code = match.memberCode
        }

        if (!code) {
          return {
            content: [{ type: 'text', text: 'Error: Provide either member_code or name + chamber.' }],
            isError: true,
          }
        }

        const html = await fetchMemberDetail(code)
        const member = parseMemberDetail(html)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              name: member.name,
              member_code: member.memberCode,
              district: member.district,
              party: member.party || 'Unknown',
              chamber: member.chamber === 'S' ? 'Senate' : 'House',
              photo_url: member.photoUrl,
              address: member.address,
              phone: member.phone,
              email: member.email,
              committees: member.committees,
              district_map_url: member.districtMapUrl,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )
}

import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerVideoTools } from '../src/tools/video.js'

const originalApiKey = process.env.OPEN_STATES_API_KEY

function deleteOpenStatesApiKey(): void {
  delete process.env.OPEN_STATES_API_KEY
}

function restoreOpenStatesApiKey(): void {
  if (originalApiKey === undefined) {
    deleteOpenStatesApiKey()
  } else {
    process.env.OPEN_STATES_API_KEY = originalApiKey
  }
}

function textContent(result: Awaited<ReturnType<Client['callTool']>>): string {
  return result.content
    .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
}

async function connectInMemory(server: McpServer): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])
  return client
}

afterEach(() => {
  restoreOpenStatesApiKey()
  vi.unstubAllGlobals()
})

describe('optional Open States API key', () => {
  it('boots the stdio server and registers all tools without OPEN_STATES_API_KEY', async () => {
    const childEnv = { ...process.env }
    delete childEnv.OPEN_STATES_API_KEY

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/index.ts'],
      cwd: process.cwd(),
      env: childEnv,
      stderr: 'pipe',
    })
    const client = new Client({ name: 'stdio-test-client', version: '1.0.0' })

    try {
      await client.connect(transport)
      const { tools } = await client.listTools()
      expect(tools).toHaveLength(18)
    } finally {
      await client.close()
    }
  }, 10_000)

  it('returns an actionable MCP tool error when an Open States tool is called without a key', async () => {
    deleteOpenStatesApiKey()
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const { registerOpenStatesTools } = await import('../src/tools/open-states.js')
    const server = new McpServer({ name: 'test-server', version: '1.0.0' })
    registerOpenStatesTools(server)
    const client = await connectInMemory(server)

    try {
      const result = await client.callTool({
        name: 'search_bills',
        arguments: { q: 'education' },
      })

      expect(result.isError).toBe(true)
      expect(textContent(result)).toContain('OPEN_STATES_API_KEY')
      expect(textContent(result)).toContain('https://openstates.org/api/register/')
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('serves a video archive tool without an Open States key', async () => {
    deleteOpenStatesApiKey()
    const fixture = await readFile(new URL('./fixtures/loadvid-response.json', import.meta.url), 'utf8')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const server = new McpServer({ name: 'test-server', version: '1.0.0' })
    registerVideoTools(server)
    const client = await connectInMemory(server)

    try {
      const result = await client.callTool({
        name: 'get_hearing_video',
        arguments: { meeting_key: 16194 },
      })

      expect(result.isError).not.toBe(true)
      expect(textContent(result)).toContain('Finance Natural Resources')
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      await client.close()
      await server.close()
    }
  })
})

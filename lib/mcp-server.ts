import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { log } from './logger';

export function createMcpServer(user: string): Server {
  log('MCP-FAC', `Creating MCP server for user="${user}"`);

  const server = new Server(
    { name: 'mcp-oauth-next', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('MCP-SRV', `ListTools (user="${user}")`);
    return {
      tools: [{
        name:        'get_current_day',
        description: "Returns today's day of the week and full date.",
        inputSchema: {
          type:                 'object' as const,
          properties:           {},
          required:             [],
          additionalProperties: false,
        },
      }],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    log('MCP-SRV', `CallTool="${name}" user="${user}"`);

    if (name === 'get_current_day') {
      const now    = new Date();
      const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      const text   = `Today is ${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
      log('MCP-SRV', `→ "${text}"`);
      return { content: [{ type: 'text' as const, text }], isError: false };
    }

    return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
  });

  return server;
}

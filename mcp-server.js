// MCP server for agentboard — @modelcontextprotocol/sdk (stdio transport)
// Human visibility: http://localhost:3099/ (REST API + Dashboard)
// Shared tool defs/handlers: lib/mcp-handlers.js

var { Server } = require('@modelcontextprotocol/sdk/server/index.js');
var { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
var { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
var mcp = require('./lib/mcp-handlers');

function textResult(text, isError) {
  var r = { content: [{ type: 'text', text: text }] };
  if (isError) r.isError = true;
  return r;
}

var server = new Server(
  { name: 'agentboard', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async function () {
  return { tools: mcp.TOOL_DEFS };
});

server.setRequestHandler(CallToolRequestSchema, async function (request) {
  var name = request.params.name;
  var args = request.params.arguments;
  if (!name) return textResult('Error: Missing tool name', true);
  var handler = mcp.TOOL_HANDLERS[name];
  if (!handler) return textResult('Error: Unknown tool: ' + name, true);
  try {
    return handler(args);
  } catch (e) {
    return textResult('Error: ' + e.message, true);
  }
});

var transport = new StdioServerTransport();
server.connect(transport);

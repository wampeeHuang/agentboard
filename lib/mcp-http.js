// MCP Streamable HTTP endpoint (stateless)
var { Server } = require('@modelcontextprotocol/sdk/server/index.js');
var { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
var { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
var mcpHandlers = require('./mcp-handlers');

function registerMcp(app) {
  // DNS rebinding + Origin guard
  var MCP_ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '127.0.0.1:3099', 'localhost:3099'];
  var MCP_ALLOWED_ORIGINS = ['http://127.0.0.1:3099', 'http://localhost:3099', 'http://localhost'];

  app.use('/mcp', function(req, res, next) {
    // Host header check
    var host = (req.headers.host || '').split(':')[0];
    if (MCP_ALLOWED_HOSTS.indexOf(req.headers.host || '') === -1 &&
        MCP_ALLOWED_HOSTS.indexOf(host) === -1) {
      return res.status(403).json({ error: 'Forbidden host' });
    }
    // Origin check (only when present — CLI/curl send no Origin)
    var origin = req.headers.origin;
    if (origin && MCP_ALLOWED_ORIGINS.indexOf(origin) === -1) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }
    next();
  });

  // Stateless POST — new transport per request
  app.post('/mcp', async function(req, res) {
    try {
      var server = new Server(
        { name: 'agentboard', version: '2.0.0' },
        { capabilities: { tools: {} } }
      );

      server.setRequestHandler(ListToolsRequestSchema, async function() {
        return { tools: mcpHandlers.TOOL_DEFS };
      });

      server.setRequestHandler(CallToolRequestSchema, async function(request) {
        var name = request.params.name;
        var args = request.params.arguments;
        if (!name) return { content: [{ type: 'text', text: 'Error: Missing tool name' }], isError: true };
        var handler = mcpHandlers.TOOL_HANDLERS[name];
        if (!handler) return { content: [{ type: 'text', text: 'Error: Unknown tool: ' + name }], isError: true };
        try {
          return handler(args);
        } catch (e) {
          return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
        }
      });

      var transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        enableDnsRebindingProtection: true,
        allowedHosts: ['127.0.0.1', 'localhost', '127.0.0.1:3099', 'localhost:3099']
      });

      res.on('close', function() {
        transport.close();
        server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: e.message },
          id: null
        });
      }
    }
  });

  // Stateless — no SSE, no sessions
  app.get('/mcp', function(req, res) {
    res.set('Allow', 'POST').status(405).json({ error: 'Method Not Allowed. Use POST for stateless MCP.' });
  });
  app.delete('/mcp', function(req, res) {
    res.set('Allow', 'POST').status(405).json({ error: 'Method Not Allowed. Stateless — no sessions to delete.' });
  });
}

module.exports = registerMcp;

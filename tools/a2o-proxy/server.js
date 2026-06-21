// a2o-proxy: Anthropic Messages API → OpenAI Chat Completions translator
// Enables Claude Code to use aigoapi's Claude models via Chat Completions endpoint

const http = require("http");

const UPSTREAM = process.env.A2O_UPSTREAM || "https://aigoapi.com/v1";
const API_KEY = process.env.A2O_API_KEY || process.env.AIGOAPI_API_KEY || "";
const PORT = parseInt(process.env.A2O_PORT || "8787", 10);
const HOST = process.env.A2O_HOST || "127.0.0.1";
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || "";

function parseUrl(url) {
  const u = new URL(url);
  const protocol = (u.protocol === "https:" ? "https" : "http");
  return { protocol, hostname: u.hostname, port: u.port || (protocol === "https" ? 443 : 80), path: u.pathname + u.search };
}

function proxyRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const target = parseUrl(url);
    const proxy = PROXY ? parseUrl(PROXY) : null;

    const opts = {
      method,
      hostname: proxy ? proxy.hostname : target.hostname,
      port: proxy ? proxy.port : target.port,
      path: proxy ? url : target.path,
      headers: { ...headers },
      timeout: 120000,
    };

    if (proxy) {
      opts.headers.Host = target.hostname;
    }

    const req = http.request(opts, (res) => {
      let data = [];
      res.on("data", (chunk) => data.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(data) }));
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });

    if (body) req.write(body);
    req.end();
  });
}

// Anthropic → OpenAI message conversion
function convertMessages(anthropicBody) {
  const messages = [];
  if (anthropicBody.system) {
    const sysContent = Array.isArray(anthropicBody.system)
      ? anthropicBody.system.map(s => s.text || "").join("\n")
      : anthropicBody.system;
    messages.push({ role: "system", content: sysContent });
  }
  for (const msg of anthropicBody.messages || []) {
    const role = msg.role === "assistant" ? "assistant" : "user";
    let content = "";
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const parts = [];
      for (const block of msg.content) {
        if (block.type === "text") parts.push(block.text);
        else if (block.type === "image" && block.source) {
          parts.push(`data:${block.source.media_type};base64,${block.source.data}`);
        }
        else if (block.type === "tool_result") parts.push(JSON.stringify(block));
        else if (block.type === "tool_use") parts.push(JSON.stringify(block));
      }
      content = parts.join("\n");
    }
    messages.push({ role, content });
  }
  return messages;
}

// OpenAI → Anthropic non-streaming response
function toAnthropicResponse(openaiBody, model) {
  const choice = openaiBody.choices?.[0] || {};
  const msg = choice.message || {};
  return {
    id: `msg_${openaiBody.id || "unknown"}`,
    type: "message",
    role: "assistant",
    model: openaiBody.model || model,
    content: [{ type: "text", text: msg.content || "" }],
    stop_reason: choice.finish_reason === "length" ? "max_tokens"
      : choice.finish_reason === "stop" ? "end_turn"
      : choice.finish_reason || "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: openaiBody.usage?.prompt_tokens || 0,
      output_tokens: openaiBody.usage?.completion_tokens || 0,
    },
  };
}

// OpenAI SSE → Anthropic SSE
function convertStream(data, model, msgId) {
  if (!data.startsWith("data:")) return data;
  const jsonStr = data.slice(5).trim();
  if (jsonStr === "[DONE]") return "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

  try {
    const obj = JSON.parse(jsonStr);
    const choice = obj.choices?.[0];
    if (!choice || !choice.delta) return "";

    const delta = choice.delta;
    let events = "";

    if (delta.role === "assistant" || (delta.content && !msgId.started)) {
      msgId.started = true;
      events += `event: message_start\ndata: {"type":"message_start","message":{"id":"${msgId.id}","type":"message","role":"assistant","model":"${model}","content":[]}}\n\n`;
      events += `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`;
    }

    if (delta.content) {
      events += `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(delta.content)}}}\n\n`;
    }

    if (choice.finish_reason) {
      events += `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`;
      events += `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"${choice.finish_reason === "length" ? "max_tokens" : "end_turn"}","stop_sequence":null},"usage":{"output_tokens":0}}\n\n`;
      events += `event: message_stop\ndata: {"type":"message_stop"}\n\n`;
    }

    return events;
  } catch {
    return "";
  }
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", upstream: UPSTREAM }));
    return;
  }

  // List models
  if (req.method === "GET" && (req.url === "/v1/models" || req.url === "/models")) {
    try {
      const r = await proxyRequest("GET", `${UPSTREAM}/models`, { Authorization: `Bearer ${API_KEY}` });
      // Return models that start with "claude" since we're translating for Anthropic format
      const models = JSON.parse(r.body.toString());
      if (models.data) {
        const claudeModels = models.data.filter(m => m.id.startsWith("claude"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: claudeModels }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(r.body.toString());
      }
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Upstream unreachable: " + e.message } }));
    }
    return;
  }

  // POST /v1/messages — Anthropic Messages API
  if (req.method === "POST" && req.url === "/v1/messages") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", async () => {
      try {
        const anthropicReq = JSON.parse(body);
        const model = anthropicReq.model || "claude-opus-4-8";
        const stream = anthropicReq.stream === true;
        const openaiMessages = convertMessages(anthropicReq);

        const openaiReq = {
          model,
          messages: openaiMessages,
          max_tokens: anthropicReq.max_tokens || 4096,
          stream,
        };
        if (anthropicReq.temperature != null) openaiReq.temperature = anthropicReq.temperature;
        if (anthropicReq.top_p != null) openaiReq.top_p = anthropicReq.top_p;
        if (anthropicReq.top_k != null) openaiReq.top_k = anthropicReq.top_k;

        const upstreamRes = await proxyRequest(
          "POST",
          `${UPSTREAM}/chat/completions`,
          {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
            Accept: stream ? "text/event-stream" : "application/json",
          },
          JSON.stringify(openaiReq)
        );

        if (upstreamRes.status >= 400) {
          res.writeHead(upstreamRes.status, { "Content-Type": "application/json" });
          res.end(upstreamRes.body);
          return;
        }

        if (stream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          const msgId = { id: "msg_" + Date.now(), started: false };
          const lines = upstreamRes.body.toString().split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;
            const converted = convertStream(line, model, msgId);
            if (converted) res.write(converted);
          }
          res.end();
        } else {
          const openaiBody = JSON.parse(upstreamRes.body.toString());
          const anthropicRes = toAnthropicResponse(openaiBody, model);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(anthropicRes));
        }
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: e.message } }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: "Not found" } }));
});

server.listen(PORT, HOST, () => {
  console.log(`a2o-proxy listening on http://${HOST}:${PORT}`);
  console.log(`Upstream: ${UPSTREAM}`);
});

# Mcp tool 

This is a tool that any outside of the site ai can use, it makes it easy for any ai to use the mcp tools in the site.

# MCP Test Artifacts

Test scripts used to validate the MT5 AI Bridge MCP server. Run them against a
live server (`npm run dev`, ports 3000 + 7777) from the project root.

Written in **Node.js** using only built-in modules (`net`, `fs`, `path`) — no
dependencies, and no Python required. Node 24 is already installed (the project
is TypeScript/Node).

## Transports exercised

| Transport | Endpoint | Script |
|---|---|---|
| JSON-RPC 2.0 direct POST | `POST /api/mcp` | curl example below |
| REST tool shortcut | `POST /api/mcp/tools/:name` | curl example below |
| SSE (Server-Sent Events) | `GET /api/mcp/sse` + `POST /api/mcp/messages` | `sse.js`, `sse-roundtrip.js` |
| Health / handshake | `GET /api/mt5/health` (ports 3000 & 7777) | curl |

## Scripts

- `sse.js` — minimal raw-socket test: connect to the MCP SSE endpoint and read
  the `endpoint` event that tells the client where to POST JSON-RPC messages.
- `sse-roundtrip.js` — full SSE round-trip: open the stream, capture the
  `sessionId` from the `endpoint` event, POST a `tools/call` to
  `/api/mcp/messages?sessionId=<id>`, then read the JSON-RPC response as a
  pushed `event: message` on the SSE stream.

Both accept an optional output directory as the first argument
(`node backend/mcp-test/sse.js [out-dir]`), defaulting to `backend/mcp-test/out`.

## Direct JSON-RPC examples

```bash
# initialize handshake
curl -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# list tools
curl -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# call a tool
curl -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"mt5_get_account_info","arguments":{}}}'
```

## What was verified live

- `initialize` / `tools/list` handshake returns 13 tools with full JSON schemas.
- Real EA data flowing (Deriv-Demo account, live ticks, open positions).
- Full trade round-trip: `mt5_execute_trade` → queued → dispatched to EA →
  executed on MT5 → position confirmed via `mt5_get_open_positions`.
- SSE push-back of JSON-RPC responses on the stream.
- Risk engine: `mt5_configure_risk_guard`, kill-switch blocking new orders,
  auto `CLOSE_ALL` on TP/SL triggers.
- Error handling: unknown method (`-32601`), unknown tool (`isError: true`),
  missing required args.
- Persistence: `/api/database/analytics`, `/api/database/orders`,
  `/api/database/download`, `/api/ea/code`, `/api/simulate-tick`.

## Also available in the UI

The **AI MCP Hub** tab in the web app has an in-app "Execute Tool via MCP"
tester and copy-paste snippets for Claude Desktop, Cursor IDE, and a Python
agent — see `src/components/mcp/McpConsole.tsx`. Those snippets point at the
same endpoints these scripts exercise.
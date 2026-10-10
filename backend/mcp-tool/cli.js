// MCP CLI — call any tool or JSON-RPC method directly from the terminal.
//
//   node backend/mcp-tool/cli.js list
//   node backend/mcp-tool/cli.js call <toolName> '<json args>' | @file.json | @-
//   node backend/mcp-tool/cli.js rpc <method> '<json params>' | @file.json | @-
//   node backend/mcp-tool/cli.js health [url]
//
// Examples:
//   node backend/mcp-tool/cli.js list
//   node backend/mcp-tool/cli.js call mt5_get_account_info '{}'
//   node backend/mcp-tool/cli.js call mt5_get_market_data '{"symbol":"EURUSD"}'
//   node backend/mcp-tool/cli.js call mt5_execute_trade '{"symbol":"EURUSD","orderType":"BUY","volume":0.01,"sl":1.1180,"tp":1.1210}'
//   node backend/mcp-tool/cli.js rpc initialize '{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}'
//
// JSON args can be passed inline (single-quoted), read from a file with
// @file.json, or read from stdin with @-.
// Defaults to http://127.0.0.1:3000/api/mcp. Override with MCP_URL env var.
// Uses only Node built-ins (http, fs). No dependencies.

import http from 'http';
import fs from 'fs';

const BRIDGE_URL = new URL(process.env.MCP_URL || 'http://127.0.0.1:3000/api/mcp');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: BRIDGE_URL.hostname,
        port: BRIDGE_URL.port,
        path: path || BRIDGE_URL.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data, status: res.statusCode });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: BRIDGE_URL.hostname, port: BRIDGE_URL.port, path, method: 'GET' },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data, status: res.statusCode });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function usage() {
  console.log(`Usage:
  node backend/mcp-tool/cli.js list
  node backend/mcp-tool/cli.js call <toolName> '<json args>' | @file.json | @-
  node backend/mcp-tool/cli.js rpc <method> '<json params>' | @file.json | @-
  node backend/mcp-tool/cli.js health [url]

Examples:
  node backend/mcp-tool/cli.js list
  node backend/mcp-tool/cli.js call mt5_get_account_info '{}'
  node backend/mcp-tool/cli.js call mt5_get_market_data '{"symbol":"EURUSD"}'
  node backend/mcp-tool/cli.js call mt5_execute_trade '{"symbol":"EURUSD","orderType":"BUY","volume":0.01,"sl":1.1180,"tp":1.1210}'
  node backend/mcp-tool/cli.js rpc initialize '{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}'

Set MCP_URL to override the bridge endpoint (default http://127.0.0.1:3000/api/mcp).`);
  process.exit(1);
}

// Resolve a JSON argument: inline string, @file path, or @- for stdin.
function resolveArg(raw) {
  if (!raw) return {};
  if (raw === '@-') return JSON.parse(fs.readFileSync(0, 'utf8'));
  if (raw.startsWith('@')) return JSON.parse(fs.readFileSync(raw.slice(1), 'utf8'));
  return JSON.parse(raw);
}

const [, , cmd, arg1, arg2] = process.argv;

try {
  if (cmd === 'list') {
    const res = await post(BRIDGE_URL.pathname, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = res.result?.tools || [];
    console.log(`${tools.length} tools:\n`);
    for (const t of tools) {
      const req = t.inputSchema?.required?.length
        ? ` (required: ${t.inputSchema.required.join(', ')})`
        : '';
      console.log(`  ${t.name}${req}`);
      console.log(`    ${t.description}`);
    }
  } else if (cmd === 'call') {
    if (!arg1) usage();
    const name = arg1;
    const args = resolveArg(arg2);
    const res = await post(BRIDGE_URL.pathname, {
      jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
      params: { name, arguments: args },
    });
    const text = res.result?.content?.[0]?.text;
    const parsed = text ? JSON.parse(text) : res;
    console.log(JSON.stringify(parsed, null, 2));
    if (res.result?.isError) process.exitCode = 1;
  } else if (cmd === 'rpc') {
    if (!arg1) usage();
    const method = arg1;
    const params = resolveArg(arg2);
    const res = await post(BRIDGE_URL.pathname, { jsonrpc: '2.0', id: Date.now(), method, params });
    console.log(JSON.stringify(res, null, 2));
    if (res.error) process.exitCode = 1;
  } else if (cmd === 'health') {
    const url = arg1 || 'http://127.0.0.1:3000/api/mt5/health';
    const u = new URL(url);
    const res = await get(u.pathname + u.search);
    console.log(JSON.stringify(res, null, 2));
  } else {
    usage();
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
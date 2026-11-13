// SPDX-License-Identifier: GPL-3.0-or-later
// Teste de protocolo: fala MCP por stdio e exercita a ponte como se fosse o aplicativo.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PORT = 47899;
const server = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const client = new Client({ name: "teste", version: "0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: { ...process.env, NOVELO_BRIDGE_PORT: String(PORT) },
  }),
);

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
assert.deepEqual(tools, ["novelo_bridge_call", "novelo_run_script", "novelo_status"]);

const run = await client.callTool({ name: "novelo_run_script", arguments: { code: "console.log(1+1)" } });
assert.match(run.content[0].text, /exit=0[\s\S]*\n2\n/);
const bad = await client.callTool({ name: "novelo_run_script", arguments: { code: "process.exit(3)" } });
assert.equal(bad.isError, true);

const off = await client.callTool({ name: "novelo_bridge_call", arguments: { method: "x" } });
assert.equal(off.isError, true);
assert.match(off.content[0].text, /não conectado/);

// Simula o aplicativo: register, poll, result.
const base = `http://127.0.0.1:${PORT}`;

// Outra página do navegador não pode falar com a ponte; o studio local pode.
const evil = await fetch(`${base}/register`, {
  method: "POST",
  headers: { origin: "http://evil.example" },
  body: "{}",
});
assert.equal(evil.status, 403);
const health = await fetch(`${base}/health`, { headers: { origin: "http://localhost:5173" } });
assert.equal(health.status, 200);
assert.equal(health.headers.get("access-control-allow-origin"), "http://localhost:5173");
const reg = await (
  await fetch(`${base}/register`, { method: "POST", body: JSON.stringify({ client: "fake", version: "0" }) })
).json();
const call = client.callTool({ name: "novelo_bridge_call", arguments: { method: "eco", params: { a: 1 } } });
const cmd = await (await fetch(`${base}/poll?session=${reg.session}`)).json();
assert.equal(cmd.method, "eco");
await fetch(`${base}/result`, {
  method: "POST",
  body: JSON.stringify({ session: reg.session, id: cmd.id, ok: true, result: { eco: cmd.params } }),
});
const r = await call;
assert.deepEqual(JSON.parse(r.content[0].text), { eco: { a: 1 } });

// reconexão no meio de um comando: falha na hora, sem esperar o tempo limite
const reg2 = await (
  await fetch(`${base}/register`, { method: "POST", body: JSON.stringify({ client: "fake", version: "1" }) })
).json();
const slow = client.callTool({ name: "novelo_bridge_call", arguments: { method: "lento", timeout_s: 30 } });
await (await fetch(`${base}/poll?session=${reg2.session}`)).json();
const t0 = Date.now();
await fetch(`${base}/register`, { method: "POST", body: JSON.stringify({ client: "fake", version: "2" }) });
const lost = await slow;
assert.equal(lost.isError, true);
assert.match(lost.content[0].text, /reconectou/);
assert.ok(Date.now() - t0 < 5000);

await client.close();
console.log("OK: protocolo MCP, execução de scripts e ponte verificados");

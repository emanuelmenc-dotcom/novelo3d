// SPDX-License-Identifier: GPL-3.0-or-later
// Servidor MCP do Novelo3D (stdio). Logs só em stderr: stdout é o protocolo.

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createBridge } from "./bridge.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(here, "..", "..", ".."); // novelo3d/
const log = (m) => process.stderr.write(`[novelo3d-mcp] ${m}\n`);
const text = (t, isError = false) => ({
  content: [{ type: "text", text: t }],
  ...(isError ? { isError: true } : {}),
});

const bridge = createBridge({ port: Number(process.env.NOVELO_BRIDGE_PORT ?? 47821), log });
const bridgeUp = await bridge.start();

const server = new McpServer({ name: "novelo3d", version: "0.1.0" });

server.registerTool(
  "novelo_status",
  {
    description:
      "Estado do servidor MCP do Novelo3D: versão do Node, raiz do projeto e se o aplicativo está conectado à ponte.",
  },
  async () =>
    text(
      JSON.stringify(
        {
          node: process.version,
          projectRoot: PROJECT_ROOT,
          bridge: { listening: bridgeUp, port: bridge.port, app: bridge.info() },
          nota: "novelo_run_script roda Node puro; novelo_bridge_call exige o studio aberto (npm run dev).",
        },
        null,
        2,
      ),
    ),
);

server.registerTool(
  "novelo_run_script",
  {
    description:
      "Roda um script Node (ESM, .mjs) em processo separado, com a raiz do projeto como diretório de trabalho. Devolve código de saída, stdout e stderr. Use para testes, análises e geração de arquivos.",
    inputSchema: {
      code: z.string().describe("Código ESM completo"),
      timeout_s: z.number().positive().max(600).default(60),
    },
  },
  async ({ code, timeout_s }) => {
    const dir = await mkdtemp(join(tmpdir(), "novelo-"));
    const file = join(dir, "script.mjs");
    await writeFile(file, code, "utf8");
    try {
      const out = await new Promise((res) => {
        const p = spawn(process.execPath, [file], { cwd: PROJECT_ROOT, windowsHide: true });
        let so = "",
          se = "",
          killed = false;
        const cap = (s, c) => (s + c).slice(-200_000);
        p.stdout.on("data", (c) => {
          so = cap(so, c);
        });
        p.stderr.on("data", (c) => {
          se = cap(se, c);
        });
        const t = setTimeout(() => {
          killed = true;
          p.kill();
        }, timeout_s * 1000);
        p.on("close", (c) => {
          clearTimeout(t);
          res({ code: c, killed, so, se });
        });
        p.on("error", (e) => {
          clearTimeout(t);
          res({ code: -1, killed, so, se: String(e) });
        });
      });
      const body = `exit=${out.code}${out.killed ? " (encerrado por tempo)" : ""}\n--- stdout ---\n${out.so}\n--- stderr ---\n${out.se}`;
      return text(body, out.code !== 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

server.registerTool(
  "novelo_bridge_call",
  {
    description:
      "Chama um comando no aplicativo Novelo3D conectado à ponte (método + parâmetros JSON). Falha com mensagem clara se o aplicativo não estiver conectado. Os métodos existirão a partir de P0.",
    inputSchema: {
      method: z.string().describe("Nome do comando, ex.: pattern.verify"),
      params: z.record(z.string(), z.unknown()).default({}),
      timeout_s: z.number().positive().max(300).default(30),
    },
  },
  async ({ method, params, timeout_s }) => {
    try {
      const r = await bridge.call(method, params, timeout_s * 1000);
      return text(JSON.stringify(r, null, 2));
    } catch (e) {
      return text(String(e.message ?? e), true);
    }
  },
);

await server.connect(new StdioServerTransport());
log(`pronto (ponte ${bridgeUp ? "em 127.0.0.1:" + bridge.port : "indisponível"})`);

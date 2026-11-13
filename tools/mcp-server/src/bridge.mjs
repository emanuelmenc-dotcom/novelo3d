// SPDX-License-Identifier: GPL-3.0-or-later
// Ponte HTTP local entre o servidor MCP e o aplicativo Novelo3D (lado servidor).
// Protocolo (long-poll, sem dependências), sempre em 127.0.0.1:
//   POST /register        corpo {client, version}      -> {ok, session}
//   GET  /poll?session=S  espera até 25 s por um comando -> {id, method, params} | 204
//   POST /result          corpo {session, id, ok, result?, error?}
//   GET  /health          -> {ok, connected}
// O aplicativo (a partir de P0) faz register, depois poll em laço e responde com result.

import { randomUUID } from "node:crypto";
import http from "node:http";

const POLL_MS = 25_000;
const STALE_MS = 60_000;

// Só o studio local pode falar com a ponte: outra página aberta no navegador (Origin diferente) é recusada.
// Clientes sem Origin (scripts e testes em Node) passam. Outras origens: NOVELO_ALLOWED_ORIGINS="a,b".
const ALLOWED = (process.env.NOVELO_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function createBridge({ port = 47821, log = () => {} } = {}) {
  let session = null; // {id, client, version, lastSeen}
  const queue = []; // comandos aguardando o poll
  let waiter = null; // resposta HTTP do poll em espera
  const pending = new Map(); // id -> {resolve, reject, timer}

  const connected = () => session !== null && Date.now() - session.lastSeen < STALE_MS;
  const corsFor = (req) => ({
    ...(req?.headers.origin ? { "access-control-allow-origin": req.headers.origin, vary: "origin" } : {}),
    "access-control-allow-headers": "content-type",
  });
  const json = (res, code, body) => {
    res.writeHead(code, { "content-type": "application/json", ...corsFor(res.req) });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (c) => {
        data += c;
        if (data.length > 5_000_000) reject(new Error("corpo grande demais"));
      });
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
    });

  function deliver() {
    if (waiter && queue.length) {
      const w = waiter;
      waiter = null;
      clearTimeout(w.timer);
      json(w.res, 200, queue.shift());
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const origin = req.headers.origin;
    if (origin !== undefined && !ALLOWED.includes(origin)) {
      log(`origem recusada: ${origin}`);
      res.writeHead(403, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "origem não permitida" }));
    }
    const cors = corsFor(req);
    try {
      if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { ok: true, connected: connected() });
      }
      if (req.method === "POST" && url.pathname === "/register") {
        const b = await readBody(req);
        // um novo registro (página recarregada) invalida os comandos em andamento: falha já, não no tempo limite
        for (const p of pending.values()) {
          clearTimeout(p.timer);
          p.reject(new Error("o aplicativo reconectou durante o comando; repita o comando"));
        }
        pending.clear();
        queue.length = 0;
        session = {
          id: randomUUID(),
          client: String(b.client ?? "?"),
          version: String(b.version ?? "?"),
          lastSeen: Date.now(),
        };
        log(`app conectado: ${session.client} ${session.version}`);
        return json(res, 200, { ok: true, session: session.id });
      }
      if (req.method === "GET" && url.pathname === "/poll") {
        if (!session || url.searchParams.get("session") !== session.id)
          return json(res, 410, { error: "sessão inválida" });
        session.lastSeen = Date.now();
        if (waiter) {
          clearTimeout(waiter.timer);
          waiter.res.writeHead(204, cors).end();
        }
        const timer = setTimeout(() => {
          waiter = null;
          res.writeHead(204, cors).end();
        }, POLL_MS);
        waiter = { res, timer };
        return deliver();
      }
      if (req.method === "POST" && url.pathname === "/result") {
        const b = await readBody(req);
        if (!session || b.session !== session.id) return json(res, 410, { error: "sessão inválida" });
        session.lastSeen = Date.now();
        const p = pending.get(b.id);
        if (p) {
          pending.delete(b.id);
          clearTimeout(p.timer);
          b.ok ? p.resolve(b.result) : p.reject(new Error(String(b.error ?? "erro no aplicativo")));
        }
        return json(res, 200, { ok: true });
      }
      json(res, 404, { error: "rota desconhecida" });
    } catch (e) {
      json(res, 400, { error: String(e.message ?? e) });
    }
  });

  return {
    port,
    connected,
    info: () =>
      session ? { client: session.client, version: session.version, connected: connected() } : null,
    start: () =>
      new Promise((resolve) => {
        server.once("error", (e) => {
          log(`ponte indisponível (${e.code}); ferramentas de script continuam funcionando`);
          resolve(false);
        });
        server.listen(port, "127.0.0.1", () => resolve(true));
      }),
    call(method, params = {}, timeoutMs = 30_000) {
      if (!connected()) return Promise.reject(new Error("aplicativo não conectado à ponte"));
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`tempo esgotado (${timeoutMs} ms) em ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        queue.push({ id, method, params });
        deliver();
      });
    },
    close: () => server.close(),
  };
}

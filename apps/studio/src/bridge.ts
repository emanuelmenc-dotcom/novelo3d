// SPDX-License-Identifier: GPL-3.0-or-later
// Cliente da ponte MCP (long-poll). Protocolo em tools/mcp-server/README.md.
// Uma única conexão por porta, compartilhada entre quem a usa: o React em desenvolvimento monta e desmonta os
// componentes duas vezes, e um segundo registro na ponte derrubaria os comandos em andamento.
import { dispatch } from "@novelo/commands";

export type BridgeState = "off" | "connected";

interface Shared {
  port: number;
  refs: number;
  state: BridgeState;
  listeners: Set<(s: BridgeState) => void>;
  stop: boolean;
}
let shared: Shared | null = null;

function run(sh: Shared): void {
  const base = `http://127.0.0.1:${sh.port}`;
  const post = (path: string, body: unknown) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const set = (s: BridgeState) => {
    sh.state = s;
    for (const fn of sh.listeners) fn(s);
  };

  async function loop() {
    while (!sh.stop) {
      try {
        const reg = (await (await post("/register", { client: "studio", version: "0.0.0" })).json()) as {
          session: string;
        };
        set("connected");
        while (!sh.stop) {
          const r = await fetch(`${base}/poll?session=${reg.session}`);
          if (r.status === 410) break; // sessão perdida: registra de novo
          if (r.status !== 200) continue;
          const cmd = (await r.json()) as { id: string; method: string; params: Record<string, unknown> };
          try {
            const result = dispatch(cmd.method, cmd.params);
            await post("/result", { session: reg.session, id: cmd.id, ok: true, result });
          } catch (e) {
            await post("/result", {
              session: reg.session,
              id: cmd.id,
              ok: false,
              error: String((e as Error).message),
            });
          }
        }
      } catch {
        set("off");
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }
  void loop();
}

export function startBridge(port: number, onState: (s: BridgeState) => void): () => void {
  if (!shared || shared.port !== port || shared.stop) {
    shared = { port, refs: 0, state: "off", listeners: new Set(), stop: false };
    run(shared);
  }
  const sh = shared;
  sh.refs++;
  sh.listeners.add(onState);
  onState(sh.state);
  return () => {
    sh.refs--;
    sh.listeners.delete(onState);
    // adia o encerramento: se o componente remontar logo em seguida (StrictMode), a conexão continua
    setTimeout(() => {
      if (sh.refs === 0) {
        sh.stop = true;
        if (shared === sh) shared = null;
      }
    }, 0);
  };
}

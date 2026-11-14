// SPDX-License-Identifier: GPL-3.0-or-later
// Auxiliar dos testes (G6): reexecutar a linha do tempo a partir do projeto-base tem de dar o mesmo projeto que o estado
// ao vivo. Chamado no afterEach das suites; acha comando sem classificar e entrada que a reexecução não resolve.
import { expect } from "vitest";
import { dispatch, flushText, replayTimeline, timelineView } from "../src/index.ts";

/** O projeto inteiro, com o motor de pontos de cada peça já construído (os uids permanentes entram na comparação). */
function snapshot(): string {
  const parts = (dispatch("parts.get") as { parts: { id: string; kind: string }[] }).parts;
  const st = dispatch("project.export") as {
    parts: { parts: { id: string; text: string; dialect?: string }[] };
  };
  for (const p of st.parts.parts) {
    if (!parts.some((q) => q.id === p.id && q.kind === "own")) continue;
    try {
      dispatch("points.info", { text: p.text, ...(p.dialect ? { dialect: p.dialect } : {}) });
    } catch {
      // receita inválida: sem motor
    }
  }
  const out = dispatch("project.export") as {
    timeline?: unknown;
    edit?: Record<string, Record<string, unknown>>;
    parts: { parts: { id: string; kind: string }[] };
  };
  out.timeline = undefined;
  // instâncias e espelhadas usam o armazém da original: só as peças originais têm o seu
  for (const p of out.parts.parts) if (p.kind !== "own") delete out.edit?.[p.id];
  // uma peça sem edição nenhuma e sem motor é o mesmo que uma peça sem armazém
  for (const [id, slot] of Object.entries(out.edit ?? {})) {
    const empty =
      !(slot.yarn as unknown[] | undefined)?.length && !(slot.tension as unknown[] | undefined)?.length;
    if (empty && !slot.uids && !(slot.selection as unknown[] | undefined)?.length && !slot.defaultTension)
      delete (out.edit as Record<string, unknown>)[id];
  }
  return JSON.stringify(out);
}

export function expectReplayMatchesLive(): void {
  if (!timelineView().hasBase) return;
  // texto livre (de testes que passam uma receita fora das peças) não tem como ser reexecutado pelo motor da peça
  const free = (f: { method: string; params: Record<string, unknown>; items?: unknown[] }): boolean =>
    f.method !== "parts.commitText" && typeof f.params.text === "string";
  if (timelineView().features.some(free)) return;
  // projeto sem receita (testes de comandos que passam o texto direto) não tem o que reexecutar no motor da peça
  const own = (dispatch("project.export") as { parts: { parts: { kind: string; text: string }[] } }).parts
    .parts;
  if (own.some((q) => q.kind === "own" && q.text.trim() === "")) return;
  flushText();
  const live = snapshot();
  replayTimeline();
  try {
    expect(JSON.parse(snapshot())).toEqual(JSON.parse(live));
  } catch (e) {
    const bad = timelineView().features.filter((f) => f.status === "failed");
    if (bad.length)
      console.log(
        "features que falharam na reexecução:",
        JSON.stringify(bad.map((f) => [f.method, f.error])),
      );
    throw e;
  }
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Máquina de estados do criador de pontos (etapa B, docs/16): as alças na agulha mudam a cada comando (laçada, inserir,
// puxar pelas k alças, terminar). Puro: não lança, não altera a entrada e não toca no registro; o resultado é o id do tipo
// embutido mais próximo (`wraps` e `lengthFactor` vêm do registro).
import { stitchType } from "./registry.ts";

export const MAX_LOOPS = 16;
export const MAX_BASES = 4;

export type InsertMode = "both" | "flo" | "blo" | "fp" | "bp" | "space";
export type LoopKind = "initial" | "yo" | "pulled";

export interface Loop {
  id: number;
  kind: LoopKind;
  /** Índice da base (na carreira de baixo) de onde a alça foi puxada. */
  base?: number;
  mode?: InsertMode;
}

export type Cmd =
  | { kind: "yo" }
  | { kind: "insert"; base?: number; mode?: InsertMode }
  | { kind: "draw"; k: number }
  | { kind: "finish" };

export interface BuilderEvent {
  cmd: Cmd;
  /** Ids das alças criadas ou removidas pelo comando. */
  added?: number;
  /** `draw`: ids das alças atravessadas (e removidas), da mais próxima da ponta da agulha para trás. */
  through?: number[];
}

export interface BuilderState {
  /** Da mais antiga à mais nova (a mais nova está na ponta da agulha). */
  loops: Loop[];
  cmds: Cmd[];
  events: BuilderEvent[];
  nextId: number;
  finished: boolean;
}

export type Reason =
  | "finished"
  | "max_loops"
  | "no_base"
  | "bad_base"
  | "base_order"
  | "max_bases"
  | "bad_k"
  | "k_too_big"
  | "need_one_loop"
  | "no_draw_yet";

export type Applied = { ok: true; state: BuilderState } | { ok: false; reason: Reason };

export interface Allowed {
  yo: boolean;
  insert: boolean;
  /** Maior k aceito por `draw` (0 = nenhum). */
  drawMax: number;
  finish: boolean;
}

export const start = (): BuilderState => ({
  loops: [{ id: 0, kind: "initial" }],
  cmds: [],
  events: [],
  nextId: 1,
  finished: false,
});

/** Bases distintas, na ordem em que apareceram. */
export function basesOf(cmds: readonly Cmd[]): number[] {
  const out: number[] = [];
  for (const c of cmds) {
    if (c.kind === "insert" && c.base !== undefined && out[out.length - 1] !== c.base) out.push(c.base);
  }
  return out;
}

const drawsOf = (cmds: readonly Cmd[]): number => cmds.filter((c) => c.kind === "draw").length;

export function apply(state: BuilderState, cmd: Cmd): Applied {
  if (state.finished) return { ok: false, reason: "finished" };
  const n = state.loops.length;
  switch (cmd.kind) {
    case "yo": {
      if (n >= MAX_LOOPS) return { ok: false, reason: "max_loops" };
      const loop: Loop = { id: state.nextId, kind: "yo" };
      return next(state, cmd, [...state.loops, loop], { added: loop.id });
    }
    case "insert": {
      if (n >= MAX_LOOPS) return { ok: false, reason: "max_loops" };
      const b = cmd.base;
      if (b === undefined) return { ok: false, reason: "no_base" };
      if (!Number.isInteger(b) || b < 0) return { ok: false, reason: "bad_base" };
      const bases = basesOf(state.cmds);
      const last = bases[bases.length - 1];
      if (last !== undefined && b !== last) {
        if (b !== last + 1) return { ok: false, reason: "base_order" };
        if (bases.length >= MAX_BASES) return { ok: false, reason: "max_bases" };
      }
      const loop: Loop = { id: state.nextId, kind: "pulled", base: b, mode: cmd.mode ?? "both" };
      return next(state, cmd, [...state.loops, loop], { added: loop.id });
    }
    case "draw": {
      if (!Number.isInteger(cmd.k) || cmd.k < 1) return { ok: false, reason: "bad_k" };
      if (cmd.k > n - 1) return { ok: false, reason: "k_too_big" };
      const top = state.loops[n - 1] as Loop;
      const below = state.loops.slice(n - 1 - cmd.k, n - 1);
      const kept = state.loops.slice(0, n - 1 - cmd.k);
      return next(state, cmd, [...kept, top], { through: below.map((l) => l.id).reverse() });
    }
    case "finish": {
      if (n !== 1) return { ok: false, reason: "need_one_loop" };
      if (drawsOf(state.cmds) < 1) return { ok: false, reason: "no_draw_yet" };
      return {
        ok: true,
        state: {
          ...state,
          cmds: [...state.cmds, cmd],
          events: [...state.events, { cmd }],
          finished: true,
        },
      };
    }
  }
}

function next(
  state: BuilderState,
  cmd: Cmd,
  loops: Loop[],
  extra: { added?: number; through?: number[] },
): Applied {
  const adds = extra.added !== undefined;
  return {
    ok: true,
    state: {
      loops,
      cmds: [...state.cmds, cmd],
      events: [...state.events, { cmd, ...extra }],
      nextId: adds ? state.nextId + 1 : state.nextId,
      finished: false,
    },
  };
}

/** O que cada comando aceitaria agora (`insert`: se algum índice de base seria aceito). */
export function allowed(state: BuilderState): Allowed {
  const n = state.loops.length;
  if (state.finished) return { yo: false, insert: false, drawMax: 0, finish: false };
  return {
    yo: n < MAX_LOOPS,
    insert: n < MAX_LOOPS,
    drawMax: n - 1,
    finish: n === 1 && drawsOf(state.cmds) >= 1,
  };
}

export function replay(
  cmds: readonly Cmd[],
): { ok: true; state: BuilderState } | { ok: false; reason: Reason; at: number } {
  let state = start();
  for (let i = 0; i < cmds.length; i++) {
    const r = apply(state, cmds[i] as Cmd);
    if (!r.ok) return { ok: false, reason: r.reason, at: i };
    state = r.state;
  }
  return { ok: true, state };
}

/** Desfaz o último comando: o mesmo que refazer tudo menos o último. */
export function undo(state: BuilderState): BuilderState {
  const r = replay(state.cmds.slice(0, -1));
  return r.ok ? r.state : start();
}

/** Assinatura da sequência (tipos de comando e k, sem as bases), para comparar com as canônicas. */
const signature = (cmds: readonly Cmd[]): string =>
  cmds
    .filter((c) => c.kind !== "finish")
    .map((c) => (c.kind === "draw" ? `d${c.k}` : c.kind))
    .join(",");

/** Sequências canônicas dos tipos embutidos (sem as bases). */
export const CANONICAL: Record<string, string> = {
  CH: "yo,d1",
  SL: "insert,d1",
  SC: "insert,yo,d2",
  HDC: "yo,insert,yo,d3",
  DC: "yo,insert,yo,d2,yo,d2",
  TR: "yo,yo,insert,yo,d2,yo,d2,yo,d2",
};

export interface Summary {
  /** Id do tipo embutido mais próximo; null enquanto não há como decidir (nenhum `draw`). */
  type: string | null;
  legs: number;
  bases: number[];
  consumed: number;
  produced: number;
  /** A sequência é igual à canônica de um tipo embutido (ignorando as bases). */
  exact: boolean;
  /** Modos de inserção usados, na ordem. */
  modes: InsertMode[];
  wraps: number;
  lengthFactor: number;
  complete: boolean;
}

export function typeOf(cmds: readonly Cmd[]): string | null {
  const draws = drawsOf(cmds);
  if (draws < 1) return null;
  const firstInsert = cmds.findIndex((c) => c.kind === "insert");
  if (firstInsert < 0) return "CH";
  const yos = cmds.slice(0, firstInsert).filter((c) => c.kind === "yo").length;
  if (cmds.every((c) => c.kind !== "yo")) return "SL";
  if (yos === 0) return "SC";
  if (yos === 1) return draws === 1 ? "HDC" : "DC";
  return "TR";
}

export function summarize(state: BuilderState): Summary {
  const type = typeOf(state.cmds);
  const bases = basesOf(state.cmds);
  const sig = signature(state.cmds);
  const def = type ? stitchType(type) : undefined;
  return {
    type,
    legs: bases.length,
    bases,
    consumed: bases.length,
    produced: 1,
    exact: type !== null && CANONICAL[type] === sig,
    modes: state.cmds.flatMap((c) => (c.kind === "insert" ? [c.mode ?? "both"] : [])),
    wraps: def?.model.wraps ?? 0,
    lengthFactor: def?.lengthFactor ?? 0,
    complete: state.finished,
  };
}

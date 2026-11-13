// SPDX-License-Identifier: GPL-3.0-or-later
// Criador de pontos, etapa D (docs/16): comandos stitchEditor.* pelo dispatch (a mesma via da janela e da ponte MCP).
import { stitchDiagramSvg } from "@novelo/charts";
import { stitchBuilder as B } from "@novelo/core";
import { beforeEach, describe, expect, test } from "vitest";
import { dispatch } from "../src/index.ts";

interface View {
  cmds: B.Cmd[];
  loops: number;
  allowed: B.Allowed;
  insertBases: number[];
  selectedBase: number;
  hand: "right" | "left";
  bases: number;
  summary: B.Summary;
  canUndo: boolean;
  svg: string;
  width: number;
  height: number;
}

const call = (method: string, params: Record<string, unknown> = {}): View => dispatch(method, params) as View;
const apply = (p: Record<string, unknown>): View => call("stitchEditor.apply", p);
const state = (): View => call("stitchEditor.state");
const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "ok";
};
/** Recusa e o estado não muda. */
const reason = (p: Record<string, unknown>): string => {
  const before = state();
  const msg = refused(() => apply(p));
  expect(state().cmds).toEqual(before.cmds);
  return msg.split(":")[0] as string;
};

beforeEach(() => {
  // recomeçar mantém a mão: volta ao destro para cada teste partir do mesmo ponto
  call("stitchEditor.setHand", { hand: "right" });
  call("stitchEditor.reset");
});

describe("pb e pa passo a passo", () => {
  test("pb: alças, o que cada botão aceita e as bases habilitadas em cada passo", () => {
    const steps: [Record<string, unknown>, number][] = [
      [{ kind: "insert", base: 0 }, 2],
      [{ kind: "yo" }, 3],
      [{ kind: "draw", k: 2 }, 1],
    ];
    expect(state()).toMatchObject({ loops: 1, insertBases: [0, 1, 2, 3, 4], canUndo: false });
    expect(state().allowed).toMatchObject({ yo: true, insert: true, drawMax: 0, finish: false });
    for (const [cmd, loops] of steps) {
      const v = apply(cmd);
      expect(v.loops).toBe(loops);
    }
    // ponto pronto: só o fim do ponto
    expect(state().allowed).toEqual({ yo: false, insert: false, drawMax: 0, finish: true });
    expect(state().insertBases).toEqual([]);
    const done = apply({ kind: "finish" });
    expect(done.summary).toMatchObject({ type: "SC", legs: 1, exact: true, complete: true });
    expect(done.allowed.finish).toBe(false);
  });

  test("pa: yo, insert na base selecionada, yo, puxar por 2, yo, puxar por 2, fim", () => {
    call("stitchEditor.selectBase", { base: 2 });
    for (const c of [
      { kind: "yo" },
      { kind: "insert" },
      { kind: "yo" },
      { kind: "draw", k: 2 },
      { kind: "yo" },
      { kind: "draw", k: 2 },
      { kind: "finish" },
    ]) {
      apply(c);
    }
    const v = state();
    expect(v.summary).toMatchObject({ type: "DC", legs: 1, bases: [2], exact: true, complete: true });
    expect(v.cmds[1]).toEqual({ kind: "insert", base: 2 });
  });

  test("o diagrama é exatamente o do stitchDiagramSvg com os mesmos ajustes, e o quadro nunca encolhe", () => {
    let lastW = 0;
    for (const c of [
      { kind: "insert", base: 0 },
      { kind: "yo" },
      { kind: "draw", k: 2 },
      { kind: "finish" },
    ]) {
      const v = apply(c);
      const replay = B.replay(v.cmds);
      expect(replay.ok).toBe(true);
      if (!replay.ok) return;
      expect(v.svg).toBe(
        stitchDiagramSvg(replay.state, { bases: 5, hand: v.hand, minWidth: v.width, minHeight: v.height }),
      );
      expect(v.width).toBeGreaterThanOrEqual(lastW);
      lastW = v.width;
    }
  });
});

describe("recusas (o estado não muda)", () => {
  test("terminar cedo, puxar por mais do que há e bases fora de ordem", () => {
    expect(reason({ kind: "finish" })).toBe("no_draw_yet");
    apply({ kind: "yo" });
    expect(reason({ kind: "finish" })).toBe("need_one_loop");
    expect(reason({ kind: "draw", k: 3 })).toBe("k_too_big");
    expect(reason({ kind: "draw", k: 0 })).toBe("bad_k");
    apply({ kind: "insert", base: 1 });
    expect(reason({ kind: "insert", base: 3 })).toBe("base_order");
    expect(reason({ kind: "insert", base: 0 })).toBe("base_order");
  });

  test("a quinta base distinta e o limite de alças", () => {
    for (const base of [0, 1, 2, 3]) apply({ kind: "insert", base });
    expect(reason({ kind: "insert", base: 4 })).toBe("max_bases");
    call("stitchEditor.reset");
    for (let i = 1; i < B.MAX_LOOPS; i++) apply({ kind: "yo" });
    expect(reason({ kind: "yo" })).toBe("max_loops");
  });

  test("ponto pronto e ponto terminado", () => {
    for (const c of [{ kind: "insert", base: 0 }, { kind: "yo" }, { kind: "draw", k: 2 }]) apply(c);
    expect(reason({ kind: "insert", base: 1 })).toBe("stitch_done");
    expect(reason({ kind: "yo" })).toBe("stitch_done");
    apply({ kind: "finish" });
    expect(reason({ kind: "yo" })).toBe("finished");
    expect(reason({ kind: "finish" })).toBe("finished");
  });

  test("comando e parâmetros inválidos", () => {
    expect(refused(() => apply({ kind: "pular" }))).toContain("kind deve ser");
    expect(refused(() => call("stitchEditor.setHand", { hand: "centro" }))).toContain("hand deve ser");
    expect(refused(() => call("stitchEditor.selectBase", { base: 9 }))).toContain("bad_base");
    expect(refused(() => call("stitchEditor.selectBase", { base: -1 }))).toContain("bad_base");
  });
});

describe("base escolhida, desfazer, recomeçar e mão", () => {
  test("selectBase só aceita base que o insert aceitaria; depois de um insert só a última e a seguinte", () => {
    expect(call("stitchEditor.selectBase", { base: 4 }).selectedBase).toBe(4);
    call("stitchEditor.reset");
    apply({ kind: "insert", base: 2 });
    expect(state().insertBases).toEqual([2, 3]);
    expect(refused(() => call("stitchEditor.selectBase", { base: 4 }))).toContain("base_order");
    expect(call("stitchEditor.selectBase", { base: 3 }).selectedBase).toBe(3);
  });

  test("a base escolhida passa à primeira aceita quando deixa de valer", () => {
    call("stitchEditor.selectBase", { base: 0 });
    apply({ kind: "insert", base: 3 });
    // a base 0 não vale mais (só 3 e 4): a escolhida muda para a primeira aceita
    expect(state().selectedBase).toBe(3);
  });

  test("desfazer volta um comando (e no começo não faz nada); recomeçar limpa tudo, inclusive o quadro", () => {
    expect(call("stitchEditor.undo").cmds).toEqual([]);
    apply({ kind: "insert", base: 0 });
    apply({ kind: "yo" });
    expect(call("stitchEditor.undo").cmds).toEqual([{ kind: "insert", base: 0 }]);
    for (const c of [{ kind: "yo" }, { kind: "draw", k: 2 }]) apply(c);
    const wide = state().width;
    const r = call("stitchEditor.reset");
    expect(r).toMatchObject({ cmds: [], loops: 1, selectedBase: 0, hand: "right", canUndo: false });
    expect(r.width).toBeLessThanOrEqual(wide);
    // a mão é preferência: recomeçar não a muda
    call("stitchEditor.setHand", { hand: "left" });
    apply({ kind: "yo" });
    expect(call("stitchEditor.reset")).toMatchObject({ cmds: [], hand: "left" });
  });

  test("a mão esquerda é o espelho: mesma largura, o SVG muda; não afeta o ponto", () => {
    apply({ kind: "insert", base: 0 });
    const right = state();
    const left = call("stitchEditor.setHand", { hand: "left" });
    expect(left.hand).toBe("left");
    expect(left.cmds).toEqual(right.cmds);
    expect(left.width).toBe(right.width);
    expect(left.svg).not.toBe(right.svg);
    expect(call("stitchEditor.setHand", { hand: "right" }).svg).toBe(right.svg);
  });
});

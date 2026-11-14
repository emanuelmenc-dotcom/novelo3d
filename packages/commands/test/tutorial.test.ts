// SPDX-License-Identifier: GPL-3.0-or-later
// Comandos tutorial.* (P4): passo atual, ir e voltar, ir à volta, posição por uid que sobrevive a edições, posição no projeto.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dispatch, exportTutorial, loadTutorial, resetPaint, resetParts } from "../src/index.ts";

const BOLA = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: (2 pb, 1 aum) x6 (24)",
  "V5: (3 pb, 1 aum) x6 (30)",
  "V6: (4 pb, 1 aum) x6 (36)",
  "V7-12: 1 pb em cada ponto (36)",
  "V13: (4 pb, 1 dim) x6 (30)",
  "V14: (3 pb, 1 dim) x6 (24)",
  "V15: (2 pb, 1 dim) x6 (18)",
  "V16: (1 pb, 1 dim) x6 (12)",
  "V17: 6 dim (6)",
].join("\n");

interface View {
  reading?: boolean;
  total: number;
  rounds: number;
  index: number;
  milestones: number;
  step: {
    index: number;
    kind: string;
    instruction: string;
    count: number;
    milestone: number;
    round: number;
    rowLabel: string;
    positionInRow: number;
    alerts: string[];
  } | null;
  doneThrough: number;
  currentUids: number[];
  parentUids: number[];
}
const get = (text = BOLA, extra: Record<string, unknown> = {}) =>
  dispatch("tutorial.get", { text, ...extra }) as View;
const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "ok";
};

beforeEach(() => {
  resetParts("");
  resetPaint();
  dispatch("tutorial.reset");
});
afterEach(() => dispatch("tutorial.reset"));

describe("tutorial.*", () => {
  test("começa no primeiro passo e descreve o roteiro", () => {
    const v = get();
    expect(v.total).toBe(129); // 105 cadeias e dois slides em cada um dos 12 marcos
    expect(v.rounds).toBe(17);
    expect(v.milestones).toBe(12);
    expect(v.step).toMatchObject({ kind: "step", instruction: "6 pb", count: 6 });
    expect(v.index).toBe(0);
    expect(v.step?.round).toBe(1);
    expect(v.step?.alerts).toContain("rowStart");
    expect(v.doneThrough).toBe(0); // o anel mágico já está pronto
  });

  test("next e prev andam um passo e param nas pontas", () => {
    expect(dispatch("tutorial.prev", { text: BOLA })).toMatchObject({ index: 0 });
    dispatch("tutorial.next", { text: BOLA });
    const v = dispatch("tutorial.next", { text: BOLA }) as View;
    expect(v.index).toBe(2);
    expect(v.step?.kind).toBe("state"); // depois da volta 1: slide de revisão e slide de estado
    expect(v.doneThrough).toBe(6);
    expect((dispatch("tutorial.prev", { text: BOLA }) as View).index).toBe(1);
    dispatch("tutorial.goto", { text: BOLA, step: 129 });
    expect((dispatch("tutorial.next", { text: BOLA }) as View).index).toBe(128);
  });

  test("goto por volta e por passo, com erros claros", () => {
    const v = dispatch("tutorial.goto", { text: BOLA, round: 2 }) as View;
    expect(v.step?.round).toBe(2);
    expect(v.step?.positionInRow).toBe(1);
    expect((dispatch("tutorial.goto", { text: BOLA, step: 7 }) as View).index).toBe(6);
    expect(refused(() => dispatch("tutorial.goto", { text: BOLA, round: 99 }))).toContain("não existe");
    expect(refused(() => dispatch("tutorial.goto", { text: BOLA, step: 0 }))).toContain("entre 1 e 129");
    expect(refused(() => dispatch("tutorial.goto", { text: BOLA }))).toContain("informe");
  });

  test("a posição fica por peça e volta ao mesmo ponto depois de editar a receita", () => {
    dispatch("tutorial.goto", { text: BOLA, round: 5 });
    const before = get();
    const edited = `${BOLA}\nV18: 6 pb (6)`; // acrescentar depois não muda onde o usuário estava
    const after = get(edited);
    expect(after.step?.round).toBe(before.step?.round);
    expect(after.index).toBe(before.index);
    // outra peça começa do zero
    expect(get(BOLA, { part: "p2" }).index).toBe(0);
  });

  test("uma volta inserida antes do passo atual desloca o índice, mas o uid leva ao mesmo ponto (com e sem confirmar)", () => {
    const antes = BOLA.split("\n").slice(0, 8).join("\n");
    const inserida = [
      "V1: 6 pb no anel mágico (6)",
      "V2: 6 aum (12)",
      "V3: 12 pb (12)",
      "V4: (1 pb, 1 aum) x6 (18)",
      "V5: (2 pb, 1 aum) x6 (24)",
      "V6: (3 pb, 1 aum) x6 (30)",
      "V7: (4 pb, 1 aum) x6 (36)",
      "V8-13: 1 pb em cada ponto (36)",
      "V14: (4 pb, 1 dim) x6 (30)",
    ].join("\n");
    dispatch("parts.setText", { id: "p1", text: antes });
    dispatch("parts.commitText", { id: "p1" });
    const a = dispatch("tutorial.goto", { text: antes, round: 5 }) as View;
    // sem confirmar o texto novo: uma volta de 12 pontos entrou antes, o índice anda e o ponto é o mesmo
    const b = get(inserida);
    expect(b.index).toBeGreaterThan(a.index);
    expect(b.currentUids).toEqual(a.currentUids);
    dispatch("parts.setText", { id: "p1", text: inserida });
    dispatch("parts.commitText", { id: "p1" });
    const c = get(inserida);
    expect(c.index).toBe(b.index);
    expect(c.currentUids).toEqual(a.currentUids);
  });

  test("script devolve só um trecho", () => {
    const r = dispatch("tutorial.script", { text: BOLA, from: 10, count: 5 }) as {
      total: number;
      steps: unknown[];
    };
    expect(r.total).toBe(129);
    expect(r.steps.length).toBe(5);
    const big = dispatch("tutorial.script", { text: BOLA, count: 5000 }) as { steps: unknown[] };
    expect(big.steps.length).toBe(129); // o limite de 200 por chamada não corta este roteiro
  });

  test("receita acima do limite dá a mensagem legível", () => {
    const text = "V1: 6 pb no anel mágico (6)\nV2-40: aum @each";
    expect(refused(() => dispatch("tutorial.get", { text }))).toContain("passa de");
  });

  test("a posição entra no projeto e sai dele; projetos antigos sem a posição abrem do começo", () => {
    resetParts(BOLA);
    dispatch("tutorial.goto", { text: BOLA, round: 4 });
    const file = JSON.parse(JSON.stringify(dispatch("project.export")));
    expect(Object.keys(file.tutorial)).toEqual(["p1"]);
    dispatch("tutorial.reset");
    dispatch("project.import", { project: file });
    expect(get().step?.round).toBe(4);
    delete file.tutorial;
    dispatch("project.import", { project: file });
    expect(get().index).toBe(0);
  });

  test("loadTutorial ignora entradas inválidas", () => {
    loadTutorial({ p1: { index: 3, uid: 5 }, p2: { index: -1 }, p3: "x", p4: { index: 1.5 } });
    expect(Object.keys(exportTutorial())).toEqual(["p1"]);
    loadTutorial(null);
    expect(exportTutorial()).toEqual({});
  });
});

describe("tutorial.*: modo de leitura (G2)", () => {
  test("rodadas: nextRound e prevRound pulam para o primeiro passo da volta", () => {
    expect(dispatch("tutorial.nextRound", { text: BOLA })).toMatchObject({
      step: { round: 2, positionInRow: 1 },
    });
    expect(dispatch("tutorial.nextRound", { text: BOLA })).toMatchObject({ step: { round: 3 } });
    // no meio da volta, "voltar volta" vai ao começo da mesma; já no começo, à anterior
    dispatch("tutorial.next", { text: BOLA });
    expect(dispatch("tutorial.prevRound", { text: BOLA })).toMatchObject({
      step: { round: 3, positionInRow: 1 },
    });
    expect(dispatch("tutorial.prevRound", { text: BOLA })).toMatchObject({
      step: { round: 2, positionInRow: 1 },
    });
  });

  test("marcos: nextMilestone vai ao começo do marco seguinte; prevMilestone volta ao começo do atual e depois ao anterior", () => {
    const m1 = dispatch("tutorial.nextMilestone", { text: BOLA }) as View;
    expect(m1.step).toMatchObject({ kind: "step", milestone: 1, round: 2 });
    dispatch("tutorial.nextMilestone", { text: BOLA });
    const start = dispatch("tutorial.nextMilestone", { text: BOLA }) as View;
    expect(start.step?.milestone).toBe(3);
    dispatch("tutorial.next", { text: BOLA });
    expect((dispatch("tutorial.prevMilestone", { text: BOLA }) as View).step?.milestone).toBe(3);
    expect((dispatch("tutorial.prevMilestone", { text: BOLA }) as View).step?.milestone).toBe(2);
  });

  test("slides e pontas: slide leva à revisão e ao estado do marco; first e last", () => {
    dispatch("tutorial.goto", { text: BOLA, round: 3 });
    const r = dispatch("tutorial.slide", { text: BOLA, kind: "review" }) as View;
    expect(r.step).toMatchObject({ kind: "review", milestone: 2 });
    expect((dispatch("tutorial.slide", { text: BOLA, kind: "state" }) as View).step?.kind).toBe("state");
    expect(refused(() => dispatch("tutorial.slide", { text: BOLA, kind: "x" }))).toContain("review ou state");
    expect((dispatch("tutorial.last", { text: BOLA }) as View).index).toBe(128);
    expect((dispatch("tutorial.first", { text: BOLA }) as View).index).toBe(0);
  });

  test("faixa de fio nas voltas 7 a 9 dá duas trocas de fio e quebra as cadeias por fio", () => {
    dispatch("paint.rows", { yarn: "B", from: 7, to: 9 });
    const r = dispatch("tutorial.script", { text: BOLA, count: 200 }) as {
      steps: { kind: string; yarnId: string; alerts: string[] }[];
    };
    const steps = r.steps.filter((s) => s.kind === "step");
    expect(steps.filter((s) => s.alerts.includes("yarnChange"))).toHaveLength(2);
    expect(steps.filter((s) => s.yarnId === "B")).toHaveLength(3); // uma cadeia de 36 pb por volta
  });

  test("tutorial.reading liga, desliga e alterna sem mexer na posição", () => {
    dispatch("tutorial.goto", { text: BOLA, round: 4 });
    expect(dispatch("tutorial.reading", { on: true })).toEqual({ reading: true });
    expect(get().reading).toBe(true);
    expect(dispatch("tutorial.reading", {})).toEqual({ reading: false });
    expect(refused(() => dispatch("tutorial.reading", { on: "sim" }))).toContain("verdadeiro");
    expect(get().step?.round).toBe(4);
  });
});

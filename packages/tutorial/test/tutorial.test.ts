// SPDX-License-Identifier: GPL-3.0-or-later
// Casos T1 a T3 e C1 de docs/13-plano-de-testes.md: o roteiro tem um passo por operação e confere com o grafo.
import { applyPaint, buildGraph } from "@novelo/core";
import { parsePattern } from "@novelo/notation";
import { describe, expect, test } from "vitest";
import { tutorialScript } from "../src/index.ts";

const P_BOLA = [
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

const build = (text: string) => {
  const { pattern } = parsePattern(text);
  return { pattern, graph: buildGraph(pattern) };
};

describe("tutorialScript", () => {
  test("T1: P-BOLA gera 402 passos, um por ponto baixo, aumento ou diminuição da receita expandida", () => {
    const { pattern, graph } = build(P_BOLA);
    expect(tutorialScript(pattern, graph).length).toBe(402);
  });

  test("T2: aumento tem 2 nós e 1 pai; diminuição tem 1 nó e 2 pais", () => {
    const { pattern, graph } = build(P_BOLA);
    const steps = tutorialScript(pattern, graph);
    const inc = steps.find((s) => s.round === 2);
    expect(inc?.nodeIds.length).toBe(2);
    expect(inc?.parentIds.length).toBe(1);
    const dec = steps.find((s) => s.round === 17);
    expect(dec?.nodeIds.length).toBe(1);
    expect(dec?.parentIds.length).toBe(2);
  });

  test("T3: rowStart no primeiro passo de cada volta e rowEnd no último", () => {
    const { pattern, graph } = build(P_BOLA);
    const steps = tutorialScript(pattern, graph);
    for (let round = 1; round <= 17; round++) {
      const of = steps.filter((s) => s.round === round);
      expect(of[0]?.alerts).toContain("rowStart");
      expect(of[of.length - 1]?.alerts).toContain("rowEnd");
      expect(of.filter((s) => s.alerts.includes("rowStart")).length).toBe(1);
    }
  });

  test("os rótulos das voltas repetidas contam uma por uma e as posições vão de 1 ao total", () => {
    const { pattern, graph } = build(P_BOLA);
    const steps = tutorialScript(pattern, graph);
    const labels = [...new Set(steps.filter((s) => s.round >= 7 && s.round <= 12).map((s) => s.rowLabel))];
    expect(labels).toEqual(["7", "8", "9", "10", "11", "12"]);
    const r9 = steps.filter((s) => s.rowLabel === "9");
    expect(r9.map((s) => s.positionInRow)).toEqual(Array.from({ length: r9.length }, (_, i) => i + 1));
    expect(r9.every((s) => s.rowTotal === r9.length)).toBe(true);
  });

  test("C1: faixa de fio B nas voltas 7 a 9 dá 108 passos em B e duas trocas de fio", () => {
    const { pattern, graph } = build(P_BOLA);
    const painted = applyPaint(graph, [{ kind: "rows", yarn: "B", from: 7, to: 9 }]);
    const steps = tutorialScript(pattern, painted);
    expect(steps.filter((s) => s.yarnId === "B").length).toBe(108);
    expect(steps.filter((s) => s.alerts.includes("yarnChange")).length).toBe(2);
  });

  test("o roteiro é determinístico", () => {
    const { pattern, graph } = build(P_BOLA);
    expect(tutorialScript(pattern, graph)).toEqual(tutorialScript(pattern, graph));
  });
});

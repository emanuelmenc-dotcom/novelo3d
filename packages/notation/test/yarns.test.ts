// SPDX-License-Identifier: GPL-3.0-or-later
// Receita com trocas de fio: pintar voltas gera as trocas nas linhas certas (aceite do P3).
import { applyPaint, buildGraph, type PaintRegion, paintedYarns } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { parsePattern, printPattern, printPatternWithYarns } from "../src/index.ts";

const P_BOLA = `V1: 6 pb no anel mágico (6)
V2: 6 aum (12)
V3: (1 pb, 1 aum) x6 (18)
V4: (2 pb, 1 aum) x6 (24)
V5: (3 pb, 1 aum) x6 (30)
V6: (4 pb, 1 aum) x6 (36)
V7–12: 1 pb em cada ponto (36)
V13: (4 pb, 1 dim) x6 (30)
V14: (3 pb, 1 dim) x6 (24)
V15: (2 pb, 1 dim) x6 (18)
V16: (1 pb, 1 dim) x6 (12)
V17: 6 dim (6)`;

const NAMES = { A: "verde musgo", B: "off white" };
const pattern = parsePattern(P_BOLA).pattern;
const graph = buildGraph(pattern);
const print = (regions: PaintRegion[], d: "pt-BR" | "en-US" = "pt-BR") =>
  printPatternWithYarns(pattern, paintedYarns(graph, regions), d, NAMES);
const lines = (t: string) => t.split("\n");

describe("receita com trocas de fio", () => {
  test("sem pintura a receita é idêntica à impressa normalmente, sem trocas", () => {
    const r = print([]);
    expect(r.text).toBe(printPattern(pattern, "pt-BR"));
    expect(r.changes).toEqual([]);
  });

  test("pintar as voltas 7 a 9 com o fio B gera duas trocas, nas linhas certas", () => {
    const r = print([{ kind: "rows", yarn: "B", from: 7, to: 9 }]);
    const l = lines(r.text);
    expect(l[6]).toBe("V7–9: trocar para o fio B (off white), 1 pb em cada ponto (36)");
    expect(l[7]).toBe("V10–12: trocar para o fio A (verde musgo), 1 pb em cada ponto (36)");
    // as demais linhas não mudam
    const plain = lines(printPattern(pattern, "pt-BR"));
    expect(l.slice(0, 6)).toEqual(plain.slice(0, 6));
    expect(l.slice(8)).toEqual(plain.slice(7));
    expect(r.changes.map((c) => [c.round, c.from, c.to, c.atStitch])).toEqual([
      [7, "A", "B", 1],
      [10, "B", "A", 1],
    ]);
  });

  test("a peça que começa em outro fio avisa já na primeira volta", () => {
    const r = print([{ kind: "rows", yarn: "B", from: 1, to: 2 }]);
    expect(lines(r.text)[0]).toBe("V1: começar com o fio B (off white), 6 pb no anel mágico (6)");
    expect(r.changes[0]).toMatchObject({ round: 1, from: null, to: "B" });
    expect(lines(r.text)[2]).toContain("trocar para o fio A");
  });

  test("troca no meio da volta: pontos soltos geram trechos com troca entre eles", () => {
    const at = [0, 1, 2, 3, 4, 5].map((index) => ({ row: 7, index }));
    const r = print([{ kind: "stitches", yarn: "B", at }]);
    const l = lines(r.text);
    expect(l[6]).toBe(
      "V7: trocar para o fio B (off white), 6 pb, trocar para o fio A (verde musgo), 30 pb (36)",
    );
    expect(l[7]).toBe("V8–12: 1 pb em cada ponto (36)");
    expect(r.changes.map((c) => [c.round, c.to, c.atStitch])).toEqual([
      [7, "B", 1],
      [7, "A", 7],
    ]);
  });

  test("aumento pintado: a troca acontece antes da operação certa", () => {
    // V3 = (1 pb, 1 aum) x6: os pontos 2 e 3 da volta (índices 1 e 2) são o primeiro aumento
    const r = print([
      {
        kind: "stitches",
        yarn: "B",
        at: [
          { row: 3, index: 1 },
          { row: 3, index: 2 },
        ],
      },
    ]);
    expect(lines(r.text)[2]).toBe(
      "V3: 1 pb, trocar para o fio B (off white), 1 aum, trocar para o fio A (verde musgo), (1 pb, 1 aum) x5 (18)",
    );
  });

  test("em inglês: marcas 'change to yarn' e 'start with yarn'", () => {
    const r = print([{ kind: "rows", yarn: "B", from: 7, to: 9 }], "en-US");
    expect(lines(r.text)[6]).toBe("Rnd 7–9: change to yarn B (off white), 1 sc in each st (36)");
  });

  test("o grafo pintado dá o mesmo resultado que as regiões", () => {
    const regions: PaintRegion[] = [{ kind: "rows", yarn: "B", from: 7, to: 9 }];
    const painted = applyPaint(graph, regions);
    const viaGraph = printPatternWithYarns(
      pattern,
      painted.nodes.map((n) => n.yarnId),
      "pt-BR",
      NAMES,
    );
    expect(viaGraph.text).toBe(print(regions).text);
  });
});

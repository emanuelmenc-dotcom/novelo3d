// SPDX-License-Identifier: GPL-3.0-or-later
// Fios e pintura no grafo: faixas de voltas, pontos soltos, prioridade, trocas, consumo e validações.
import { describe, expect, test } from "vitest";
import {
  applyPaint,
  buildGraph,
  countYarnChanges,
  DEFAULT_YARNS,
  expandRounds,
  type Op,
  type PaintRegion,
  type Pattern,
  paintedYarns,
  paintIssues,
  type Row,
  validateRegion,
  validateYarns,
  yarnUsage,
} from "../src/index.ts";

const sc = (count: number | "rest"): Op => ({ kind: "stitch", code: "SC", count });
const inc = (count: number): Op => ({ kind: "inc", k: 2, count });
const dec = (count: number): Op => ({ kind: "dec", k: 2, count });
const rep = (times: number, ...ops: Op[]): Op => ({ kind: "repeat", times, ops });
const row = (label: string, ops: Op[], extra: Partial<Row> = {}): Row => ({
  label,
  kind: "round",
  ops,
  ...extra,
});

const pBola = (declared = 18): Pattern => ({
  dialect: "pt-BR",
  rows: [
    row("1", [sc(6)], { start: "magicRing" }),
    row("2", [inc(6)]),
    row("3", [rep(6, sc(1), inc(1))], { declaredCount: declared }),
    row("4", [rep(6, sc(2), inc(1))]),
    row("5", [rep(6, sc(3), inc(1))]),
    row("6", [rep(6, sc(4), inc(1))]),
    row("7–12", [sc("rest")], { repeatRows: 6 }),
    row("13", [rep(6, sc(4), dec(1))]),
    row("14", [rep(6, sc(3), dec(1))]),
    row("15", [rep(6, sc(2), dec(1))]),
    row("16", [rep(6, sc(1), dec(1))]),
    row("17", [dec(6)]),
  ],
});

const countOf = (ys: string[], yarn: string) => ys.filter((y) => y === yarn).length;
const rowsB = (from: number, to: number): PaintRegion => ({ kind: "rows", yarn: "B", from, to });

describe("pintura por faixa de voltas", () => {
  const g = buildGraph(pBola());

  test("C1: fio B nas voltas 7 a 9 = 108 pontos no fio B e duas trocas de fio", () => {
    const painted = applyPaint(g, [rowsB(7, 9)]);
    const stitches = painted.nodes.filter((n) => n.rowIndex >= 0);
    expect(stitches.filter((n) => n.yarnId === "B")).toHaveLength(108);
    expect(stitches.filter((n) => n.yarnId === "A")).toHaveLength(432 - 108);
    expect(countYarnChanges(painted)).toBe(2);
    // exatamente as voltas 7, 8 e 9
    const bRounds = new Set(
      painted.nodes.filter((n) => n.yarnId === "B" && n.rowIndex >= 0).map((n) => n.rowIndex + 1),
    );
    expect([...bRounds].sort((a, b) => a - b)).toEqual([7, 8, 9]);
  });

  test("sem pintura tudo é do fio A e não há trocas", () => {
    const ys = paintedYarns(g, []);
    expect(new Set(ys)).toEqual(new Set(["A"]));
    expect(countYarnChanges(applyPaint(g, []))).toBe(0);
  });

  test("regiões mais abaixo na lista têm prioridade", () => {
    const regions: PaintRegion[] = [rowsB(7, 12), { kind: "rows", yarn: "A", from: 9, to: 10 }];
    const ys = paintedYarns(g, regions);
    expect(countOf(ys, "B")).toBe(4 * 36);
    expect(countYarnChanges(applyPaint(g, regions))).toBe(4); // A>B, B>A, A>B, B>A
  });

  test("o anel mágico acompanha o fio do primeiro ponto", () => {
    const painted = applyPaint(g, [rowsB(1, 1)]);
    expect(painted.nodes[0]?.code).toBe("RING");
    expect(painted.nodes[0]?.yarnId).toBe("B");
  });
});

describe("pintura por pontos", () => {
  const g = buildGraph(pBola());

  test("pontos soltos (volta, posição): 6 pontos da volta 7 no fio B = duas trocas", () => {
    const at = [0, 1, 2, 3, 4, 5].map((index) => ({ row: 7, index }));
    const painted = applyPaint(g, [{ kind: "stitches", yarn: "B", at }]);
    expect(painted.nodes.filter((n) => n.yarnId === "B")).toHaveLength(6);
    expect(countYarnChanges(painted)).toBe(2);
  });

  test("C2: a pintura é topológica e sobrevive a mudanças que não mexem nas voltas", () => {
    const regions = [rowsB(7, 9)];
    const a = paintedYarns(buildGraph(pBola(18)), regions);
    const b = paintedYarns(buildGraph(pBola(99)), regions); // total declarado diferente: mesma forma
    expect(b).toEqual(a);
  });

  test("pintura fora das voltas da receita gera aviso e é ignorada, sem apagar a região", () => {
    const regions: PaintRegion[] = [
      rowsB(15, 40),
      { kind: "stitches", yarn: "B", at: [{ row: 2, index: 99 }] },
    ];
    const issues = paintIssues(g, regions, DEFAULT_YARNS);
    expect(issues.map((i) => i.code)).toEqual(["PAINT_OUT_OF_RANGE", "PAINT_OUT_OF_RANGE"]);
    const ys = paintedYarns(g, [{ kind: "stitches", yarn: "B", at: [{ row: 2, index: 99 }] }]);
    expect(countOf(ys, "B")).toBe(0);
  });
});

describe("consumo por fio", () => {
  test("proporcional aos pontos: B nas voltas 7 a 9 gasta 25% do total (tudo ponto baixo)", () => {
    const u = yarnUsage(applyPaint(buildGraph(pBola()), [rowsB(7, 9)]), 5);
    expect(u.map((x) => x.yarn)).toEqual(["A", "B"]);
    expect(u[1]?.stitches).toBe(108);
    expect(u[1]?.share).toBeCloseTo(0.25, 5);
    expect((u[0]?.lengthMm ?? 0) + (u[1]?.lengthMm ?? 0)).toBeCloseTo(432 * 4.2 * 5, 3);
  });

  test("a largura do ponto escala o comprimento, não a divisão entre fios", () => {
    const g = applyPaint(buildGraph(pBola()), [rowsB(7, 9)]);
    const a = yarnUsage(g, 5);
    const b = yarnUsage(g, 10);
    expect(b[1]?.lengthMm).toBeCloseTo((a[1]?.lengthMm ?? 0) * 2, 3);
    expect(b[1]?.share).toBeCloseTo(a[1]?.share ?? 0, 6);
  });
});

describe("validações", () => {
  test("paleta: exige o fio A, letras únicas, nome e cor válidos", () => {
    expect(validateYarns(DEFAULT_YARNS)).toHaveLength(2);
    expect(() => validateYarns([{ id: "B", name: "x", colorHex: "#ffffff" }])).toThrow(/fio A/);
    expect(() => validateYarns([{ id: "A", name: "x", colorHex: "azul" }])).toThrow(/#rrggbb/);
    expect(() =>
      validateYarns([
        { id: "A", name: "x", colorHex: "#ffffff" },
        { id: "A", name: "y", colorHex: "#000000" },
      ]),
    ).toThrow(/repetido/);
    expect(() => validateYarns([])).toThrow(/1 a 8/);
  });

  test("região: fio existente, faixa e pontos válidos", () => {
    expect(validateRegion({ kind: "rows", yarn: "B", from: 7, to: 9 }, DEFAULT_YARNS)).toEqual(rowsB(7, 9));
    expect(() => validateRegion({ kind: "rows", yarn: "Z", from: 1, to: 2 }, DEFAULT_YARNS)).toThrow(
      /paleta/,
    );
    expect(() => validateRegion({ kind: "rows", yarn: "B", from: 9, to: 7 }, DEFAULT_YARNS)).toThrow(/faixa/);
    expect(() => validateRegion({ kind: "stitches", yarn: "B", at: [] }, DEFAULT_YARNS)).toThrow(/ao menos/);
    expect(() =>
      validateRegion({ kind: "stitches", yarn: "B", at: [{ row: 0, index: 0 }] }, DEFAULT_YARNS),
    ).toThrow(/inválido/);
    expect(() => validateRegion({ kind: "x", yarn: "B" }, DEFAULT_YARNS)).toThrow(/desconhecido/);
  });
});

describe("voltas expandidas", () => {
  test("cada operação aponta para o primeiro nó que produz (aumento produz 2)", () => {
    const rounds = expandRounds(pBola());
    expect(rounds).toHaveLength(17);
    const r2 = rounds[1];
    expect(r2?.atomNode).toEqual([7, 9, 11, 13, 15, 17]); // 6 aumentos de 2 nós, depois do anel e da volta 1
    expect(r2?.nodeCount).toBe(12);
    // cada volta do grafo começa onde a expansão diz
    const g = buildGraph(pBola());
    rounds.forEach((r, i) => {
      expect(g.rows[i]?.first).toBe(r.firstId);
    });
  });
});

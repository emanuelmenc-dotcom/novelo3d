// SPDX-License-Identifier: GPL-3.0-or-later
// Casos V1 a V8 de docs/13-plano-de-testes.md (valores são contrato).
import { describe, expect, test } from "vitest";
import { buildGraph, type Op, type Pattern, type Row, validate } from "../src/index.ts";

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
const ring = (n: number): Row => row("1", [sc(n)], { start: "magicRing", declaredCount: n });

function pBola(): Pattern {
  return {
    dialect: "pt-BR",
    rows: [
      ring(6),
      row("2", [inc(6)], { declaredCount: 12 }),
      row("3", [rep(6, sc(1), inc(1))], { declaredCount: 18 }),
      row("4", [rep(6, sc(2), inc(1))], { declaredCount: 24 }),
      row("5", [rep(6, sc(3), inc(1))], { declaredCount: 30 }),
      row("6", [rep(6, sc(4), inc(1))], { declaredCount: 36 }),
      row("7–12", [sc("rest")], { repeatRows: 6, declaredCount: 36 }),
      row("13", [rep(6, sc(4), dec(1))], { declaredCount: 30 }),
      row("14", [rep(6, sc(3), dec(1))], { declaredCount: 24 }),
      row("15", [rep(6, sc(2), dec(1))], { declaredCount: 18 }),
      row("16", [rep(6, sc(1), dec(1))], { declaredCount: 12 }),
      row("17", [dec(6)], { declaredCount: 6 }),
    ],
  };
}

describe("validação", () => {
  test("V1: P-BOLA válida, 432 pontos", () => {
    const v = validate(pBola());
    expect(v.issues).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.counts).toEqual([6, 12, 18, 24, 30, 36, 36, 36, 36, 36, 36, 36, 30, 24, 18, 12, 6]);
    expect(v.totalCounted).toBe(432);
    expect(v.rows.every((r) => r.status === "OK")).toBe(true);
  });

  test("V2: (2 pb, 1 aum) x6 sobre 18 consome 18 e produz 24", () => {
    const p: Pattern = {
      dialect: "pt-BR",
      rows: [
        ring(6),
        row("2", [inc(6)]),
        row("3", [rep(6, sc(1), inc(1))]),
        row("4", [rep(6, sc(2), inc(1))]),
      ],
    };
    const v = validate(p);
    expect(v.counts).toEqual([6, 12, 18, 24]);
    expect(v.ok).toBe(true);
  });

  test("V3: grafo de V1 e V2: 19 nós, cada nó da V1 é pai de 2", () => {
    const g = buildGraph({ dialect: "pt-BR", rows: [ring(6), row("2", [inc(6)])] });
    expect(g.nodes).toHaveLength(19);
    expect(g.nodes[0]?.code).toBe("RING");
    expect(g.nodes[0]?.counted).toBe(false);
    const v2 = g.nodes.filter((n) => n.rowIndex === 1);
    expect(v2).toHaveLength(12);
    expect(v2.every((n) => n.parents.length === 1)).toBe(true);
    for (const n of g.nodes.filter((x) => x.rowIndex === 0)) {
      expect(v2.filter((c) => c.parents[0] === n.id)).toHaveLength(2);
    }
  });

  test("V4: corrente não contada é pulada em silêncio; variante com pbx na corrente", () => {
    const a = row("A", [sc(4), { kind: "stitch", code: "CH", count: 1, counted: false }, sc(8)]);
    const base: Row = ring(12);
    const ok = validate({ dialect: "pt-BR", rows: [base, a, row("B", [sc(12)])] });
    expect(ok.counts).toEqual([12, 12, 12]);
    expect(ok.ok).toBe(true);
    const b2 = row("B", [sc(4), { kind: "slInto", count: 1 }, sc(8)]);
    expect(validate({ dialect: "pt-BR", rows: [base, a, b2] }).ok).toBe(true);
  });

  test("V5: total declarado errado", () => {
    const p = pBola();
    const r3 = p.rows[2];
    if (r3) r3.declaredCount = 19;
    const v = validate(p);
    expect(v.issues.map((i) => i.code)).toEqual(["COUNT_MISMATCH"]);
    expect(v.rows[2]).toMatchObject({ status: "Total declarado errado", expected: 19, found: 18 });
  });

  test("V6: consumir mais do que existe", () => {
    const p: Pattern = {
      dialect: "pt-BR",
      rows: [
        ring(6),
        row("2", [inc(6)]),
        row("3", [rep(6, sc(1), inc(1))]),
        row("4", [rep(7, sc(2), inc(1))]),
      ],
    };
    const v = validate(p);
    expect(v.issues.some((i) => i.code === "CONSUME_OVER")).toBe(true);
    expect(v.ok).toBe(false);
  });

  test("V7: 17 pb sobre 18 topos: sobra 1 ponto", () => {
    const p: Pattern = {
      dialect: "pt-BR",
      rows: [ring(6), row("2", [inc(6)]), row("3", [rep(6, sc(1), inc(1))]), row("4", [sc(17)])],
    };
    const v = validate(p);
    expect(v.issues.map((i) => i.code)).toContain("CONSUME_UNDER");
    expect(v.rows[3]?.status).toBe("Sobra 1 ponto");
  });

  test("V8: volta fechada com junção não consome nem produz", () => {
    const first = row(
      "1",
      [{ kind: "stitch", code: "CH", count: 1, counted: false }, sc(24), { kind: "join" }],
      {
        start: "chain",
      },
    );
    const v = validate({ dialect: "pt-BR", rows: [first] });
    expect(v.ok).toBe(true);
    expect(v.counts).toEqual([24]);
  });

  test("primeira linha sem início é erro", () => {
    const v = validate({ dialect: "pt-BR", rows: [row("1", [sc(6)])] });
    expect(v.issues.map((i) => i.code)).toContain("FIRST_ROW_NO_START");
  });
});

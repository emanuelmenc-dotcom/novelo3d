// SPDX-License-Identifier: GPL-3.0-or-later
// Receita gigante vira erro, não aba travada: números, pontos por volta e pontos no total têm limite.
import { expandPattern } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { MAX_TOTAL_STITCHES, parsePattern } from "../src/parse.ts";

const codes = (text: string): string[] => parsePattern(text).issues.map((i) => i.code);

describe("limites da receita", () => {
  test("número com mais de 5 dígitos é recusado e a volta fica vazia", () => {
    for (const t of ["V1: 999999999 pb", "V1: (1 pb) x 99999999999999999999"]) {
      const r = parsePattern(t);
      expect(r.issues.map((i) => i.code)).toContain("NUMBER_TOO_LARGE");
      expect(r.pattern.rows[0]?.ops).toEqual([]);
    }
  });

  test("repetições aninhadas que passam do limite por volta são recusadas", () => {
    expect(codes("V1: ((50000 pb) x 50) x 50")).toContain("ROW_TOO_LARGE");
  });

  test("faixa de voltas grande demais vira erro e uma volta só", () => {
    const r = parsePattern("V1-99999: 6 pb");
    expect(r.issues.map((i) => i.code)).toContain("NUMBER_TOO_LARGE");
    expect(r.pattern.rows[0]?.repeatRows).toBeUndefined();
  });

  test("o total de pontos tem teto: 200 voltas grandes não passam pelo teto aos poucos", () => {
    const text = Array.from({ length: 200 }, (_, i) => `V${i + 1}: 15000 pb`).join("\n");
    const r = parsePattern(text);
    expect(r.issues.map((i) => i.code)).toContain("PATTERN_TOO_LARGE");
    const kept = r.pattern.rows.reduce(
      (n, row) => n + row.ops.reduce((m, o) => m + (o.kind === "stitch" ? (o.count as number) : 0), 0),
      0,
    );
    expect(kept).toBeLessThanOrEqual(MAX_TOTAL_STITCHES);
  });

  test("'em cada ponto' repetido não dobra até esgotar a memória: o motor para com erro claro", () => {
    const r = parsePattern("V1: 6 pb no anel mágico (6)\nV2-40: aum @each");
    expect(() => expandPattern(r.pattern)).toThrow(/passa de/);
  });

  test("uma receita normal continua valendo", () => {
    const text = "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)";
    expect(codes(text).filter((c) => c.endsWith("TOO_LARGE"))).toEqual([]);
  });
});

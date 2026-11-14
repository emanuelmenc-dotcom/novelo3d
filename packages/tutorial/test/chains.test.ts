// SPDX-License-Identifier: GPL-3.0-or-later
// Cadeias do gráfico v3 (G12 a G14 do anexo) com as chaves que o parser realmente produz.
import { atomKey, chainsOf, expandRounds } from "@novelo/core";
import { parsePattern } from "@novelo/notation";
import { describe, expect, test } from "vitest";

const keysOf = (text: string, round: number): string[] => {
  const { pattern } = parsePattern(text);
  return (expandRounds(pattern)[round - 1]?.atoms ?? []).map(atomKey);
};
const show = (c: ReturnType<typeof chainsOf>): string => {
  const f = (r: { key: string; count: number }[]) => r.map((x) => `${x.count}${x.key}`).join(" ");
  return `${f(c.head)} | ${c.times > 1 ? `(${f(c.body)}) x${c.times}` : f(c.body)} | ${f(c.tail)}`;
};

describe("chainsOf com atomos reais", () => {
  test("G12: (1 pb, 1 aum) x6 vira bloco x6", () => {
    const k = keysOf("V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)\nV3: (1 pb, 1 aum) x6 (18)", 3);
    expect(show(chainsOf(k))).toBe(" | (1SC 1INC2) x6 | ");
  });
  test("(1 pb, 1 pbx) x3 não perde o último pbx", () => {
    const k = keysOf("V1: 6 pb no anel mágico (6)\nV2: (1 pb, 1 pbx) x3 (6)", 2);
    expect(show(chainsOf(k))).toBe(" | (1SC 1SL0) x3 | ");
  });
  test("G13: corr* inicial, bloco com pular e corr, e o fim", () => {
    const k = keysOf(
      "V1: 27 pb no anel mágico (27)\nV2: 1 corr (não conta), (2 pb, pular 1, 1 corr) x9, pbx, pbx",
      2,
    );
    expect(show(chainsOf(k))).toBe("1CH0 | (2SC 1SKIP 1CH) x9 | 2SL0");
  });
  test("G14: corrente inicial e fechamento", () => {
    const k = keysOf(
      "V1: 27 pb no anel mágico (27)\nV2: 1 corr (não conta), 4 pb, 3 pbx, 4 pb, 3 pbx, pbx na corr",
      2,
    );
    // o anexo espera "4x pb; 3x pbx; 4x pb; 3x pbx; 1x pbx"; o texto "pbx na corr" sai do parser como 6 pbx e uma corr:
    // diferença guardada em docs/12 (pergunta 6); o valor do anexo não foi alterado
    expect(show(chainsOf(k))).toBe("1CH0 | 4SC 3SL0 4SC 4SL0 1CH | ");
  });
});

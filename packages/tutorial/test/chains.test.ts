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
  test("G14: corrente inicial, pbx no meio e fechamento na corrente inicial", () => {
    const k = keysOf(
      "V1: 27 pb no anel mágico (27)\nV2: 1 corr (não conta), 4 pb, 3 pbx, 4 pb, 3 pbx, pbx na corrente inicial",
      2,
    );
    // a regra do v3.py dobra (4 pb; 3 pbx) x2 e o fechamento fica à parte; o anexo espera outra coisa para uma linha
    // parecida (pergunta 6 em docs/12). A linha deste teste foi escrita para o projeto.
    expect(show(chainsOf(k))).toBe("1CH0 | (4SC 3SL0) x2 | 1JOIN");
  });
  test("pbx na corr no fim de volta que começou com corrente que não conta é o fechamento (pergunta 6)", () => {
    const k = keysOf("V1: 27 pb no anel mágico (27)\nV2: 1 corr (não conta), 4 pb, pbx na corr", 2);
    expect(k.at(-1)).toBe("JOIN");
    // sem a corrente inicial que não conta, continua um pbx dentro de um espaço de corrente
    const m = keysOf("V1: 27 pb no anel mágico (27)\nV2: 4 pb, pbx na corr", 2);
    expect(m.at(-1)).not.toBe("JOIN");
  });
});

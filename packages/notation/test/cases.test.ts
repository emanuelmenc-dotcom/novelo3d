// SPDX-License-Identifier: GPL-3.0-or-later
// Casos N1 a N12 de docs/13-plano-de-testes.md (valores são contrato).
import { type Op, validate } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { parsePattern, printPattern } from "../src/index.ts";

export const P_BOLA = `V1: 6 pb no anel mágico (6)
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

const canonN5: Op[] = [
  {
    kind: "repeat",
    times: 6,
    ops: [
      { kind: "stitch", code: "SC", count: 1 },
      { kind: "inc", k: 2, count: 1 },
    ],
  },
];

const codes = (ops: Op[]): string[] => ops.map((o) => (o.kind === "stitch" ? o.code : o.kind));

describe("leitura", () => {
  test("N1: termos pt-BR", () => {
    const r = parsePattern("V1: pb, pbx, corr, mpa, pa, pad, aum, dim, am", { dialect: "pt-BR" });
    expect(r.issues).toEqual([]);
    expect(codes(r.pattern.rows[0]?.ops ?? [])).toEqual(["SC", "SL", "CH", "HDC", "DC", "TR", "inc", "dec"]);
    expect(r.pattern.rows[0]?.start).toBe("magicRing");
  });

  test("N2: termos en-US", () => {
    const r = parsePattern("Rnd 1: sc sl st ch hdc dc tr inc dec MR", { dialect: "en-US" });
    expect(r.issues).toEqual([]);
    expect(codes(r.pattern.rows[0]?.ops ?? [])).toEqual(["SC", "SL", "CH", "HDC", "DC", "TR", "inc", "dec"]);
  });

  test("N3: en-UK dc htr tr dtr -> SC HDC DC TR", () => {
    const r = parsePattern("Round 1: dc htr tr dtr", { dialect: "en-UK" });
    expect(codes(r.pattern.rows[0]?.ops ?? [])).toEqual(["SC", "HDC", "DC", "TR"]);
  });

  test("N4: dc sem dialeto definido é ambíguo", () => {
    const r = parsePattern("Rnd 2: 12 dc");
    expect(r.issues.map((i) => i.code)).toContain("AMBIGUOUS_DIALECT");
  });

  test("N5: repetição de 6 com total declarado 18", () => {
    const r = parsePattern("V3: (1 pb, 1 aum) x6 (18)");
    expect(r.issues).toEqual([]);
    expect(r.pattern.rows[0]?.ops).toEqual(canonN5);
    expect(r.pattern.rows[0]?.declaredCount).toBe(18);
  });

  test("N6: [sc, inc] 6 times - 18 sts", () => {
    const r = parsePattern("Rnd 3: [sc, inc] 6 times - 18 sts");
    expect(r.issues).toEqual([]);
    expect(r.pattern.rows[0]?.ops).toEqual(canonN5);
    expect(r.pattern.rows[0]?.declaredCount).toBe(18);
  });

  test("N7: *sc, inc* rep 6x [18]", () => {
    const r = parsePattern("R3. *sc, inc* rep 6x [18]");
    expect(r.issues).toEqual([]);
    expect(r.pattern.rows[0]?.ops).toEqual(canonN5);
  });

  test("N8: V7–12 vira uma linha com repeatRows = 6", () => {
    const r = parsePattern("V7–12: 1 pb em cada ponto (36)");
    expect(r.pattern.rows[0]).toMatchObject({ repeatRows: 6, declaredCount: 36 });
    expect(r.pattern.rows[0]?.ops).toEqual([{ kind: "stitch", code: "SC", count: "rest" }]);
  });

  test("N9: UK com número por extenso", () => {
    const r = parsePattern("Round 3: [DCinc2, 1DC in next dc] six times - 18sts", { dialect: "en-UK" });
    expect(r.issues).toEqual([]);
    // Discrepância do plano (N9 diz "mesma forma canônica de N5"): aqui a ordem é aumento, ponto baixo;
    // em N5 é ponto baixo, aumento. Total e itens coincidem, a ordem não. Ver relato do P1.
    const expected: Op[] = [
      {
        kind: "repeat",
        times: 6,
        ops: [
          { kind: "inc", k: 2, count: 1 },
          { kind: "stitch", code: "SC", count: 1 },
        ],
      },
    ];
    expect(r.pattern.rows[0]?.ops).toEqual(expected);
    expect(r.pattern.rows[0]?.declaredCount).toBe(18);
  });

  test("termo desconhecido gera erro específico", () => {
    const r = parsePattern("V1: 6 foo no anel mágico", { dialect: "pt-BR" });
    expect(r.issues.map((i) => i.code)).toContain("UNKNOWN_TERM");
  });

  test("P-BOLA lida e validada: 17 voltas, 432 pontos, sem avisos", () => {
    const r = parsePattern(P_BOLA);
    expect(r.detected).toBe("pt-BR");
    expect(r.issues).toEqual([]);
    const v = validate(r.pattern);
    expect(v.issues).toEqual([]);
    expect(v.counts).toHaveLength(17);
    expect(v.totalCounted).toBe(432);
  });

  test("V3 do P-BOLA com total 19 é apanhado", () => {
    const r = parsePattern(P_BOLA.replace("(18)", "(19)"));
    const v = validate(r.pattern);
    expect(v.rows[2]).toMatchObject({ status: "Total declarado errado", expected: 19, found: 18 });
  });

  test("corrente que não conta e pbx na corrente inicial (V4/V8)", () => {
    const a = parsePattern(
      "V1: 12 pb no anel mágico (12)\nV2: 4 pb, 1 corr (não conta), 8 pb (12)\nV3: 12 pb (12)",
    );
    expect(validate(a.pattern).ok).toBe(true);
    const b = parsePattern("V1: 1 corr (não conta), 24 pb, pbx na corrente inicial");
    expect(b.pattern.rows[0]?.ops.map((o) => o.kind)).toEqual(["stitch", "stitch", "join"]);
  });
});

describe("escrita", () => {
  test("N10 e N11: P-BOLA escrita igual ao texto de referência, com V7–12 dobrada", () => {
    const r = parsePattern(P_BOLA);
    expect(printPattern(r.pattern, "pt-BR")).toBe(P_BOLA);
  });

  test("N11: seis voltas iguais viram um intervalo", () => {
    const text = `V1: 6 pb no anel mágico (6)
V2: 6 aum (12)
V3: (1 pb, 1 aum) x6 (18)
V4: (2 pb, 1 aum) x6 (24)
V5: (3 pb, 1 aum) x6 (30)
V6: (4 pb, 1 aum) x6 (36)
${[7, 8, 9, 10, 11, 12].map((n) => `V${n}: 1 pb em cada ponto (36)`).join("\n")}`;
    const out = printPattern(parsePattern(text).pattern, "pt-BR");
    expect(out.split("\n").pop()).toBe("V7–12: 1 pb em cada ponto (36)");
  });

  test("N12: P-BOLA em UK, lida e escrita em pt-BR, idêntica", () => {
    const pt = parsePattern(P_BOLA).pattern;
    const uk = printPattern(pt, "en-UK");
    expect(uk.split("\n")[0]).toBe("Round 1: 6 dc in magic ring (6)");
    const back = parsePattern(uk, { dialect: "en-UK" });
    expect(back.issues).toEqual([]);
    expect(printPattern(back.pattern, "pt-BR")).toBe(P_BOLA);
  });

  test("N12 (US): ida e volta também preserva", () => {
    const pt = parsePattern(P_BOLA).pattern;
    const us = printPattern(pt, "en-US");
    const back = parsePattern(us, { dialect: "en-US" });
    expect(printPattern(back.pattern, "pt-BR")).toBe(P_BOLA);
  });

  test("dobra parcial: bloco repetido com resto no fim", () => {
    const text = [
      "V1: 6 pb no anel mágico (6)",
      "V2: 6 aum (12)",
      "V3: (1 pb, 1 aum) x6 (18)",
      "V4: (3 pb, 1 aum) x4, 2 pb (22)",
    ].join("\n");
    const out = printPattern(parsePattern(text).pattern, "pt-BR");
    expect(out.split("\n")[3]).toBe("V4: (3 pb, 1 aum) x4, 2 pb (22)");
  });

  test("regra do doc 07: cobertura total com maior k (equivalente à forma com prefixo)", () => {
    const text =
      "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)\nV3: (1 pb, 1 aum) x6 (18)\nV4: 1 pb, 1 aum, (2 pb, 1 aum) x5, 1 pb (24)";
    const out = printPattern(parsePattern(text).pattern, "pt-BR");
    expect(out.split("\n")[3]).toBe("V4: (1 pb, 1 aum, 1 pb) x6 (24)");
  });
});

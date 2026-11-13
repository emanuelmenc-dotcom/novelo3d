// SPDX-License-Identifier: GPL-3.0-or-later
// Dialeto XVA (X pb, V aumento, A diminuição, T mpa, F pa, E pad; R0: MR): leitura, escrita e detecção.
import { buildGraph, expandPattern } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { parsePattern, printPattern } from "../src/index.ts";

const BOLA_XVA = ["R0: MR", "R1: 6X", "R2: 6V", "R3: 6 (X, V)", "R4: 18X", "R5: 6 (X, A)", "R6: 6A"].join(
  "\n",
);
const BOLA_PT = [
  "V1: 6 pb no anel mágico (6)",
  "V2: 6 aum (12)",
  "V3: (1 pb, 1 aum) x6 (18)",
  "V4: 18 pb (18)",
  "V5: (1 pb, 1 dim) x6 (12)",
  "V6: 6 dim (6)",
].join("\n");

const produced = (text: string, dialect?: "pt-BR" | "xva") => {
  const r = parsePattern(text, dialect ? { dialect } : {});
  return { r, rows: expandPattern(r.pattern).map((e) => e.produced) };
};

describe("XVA", () => {
  test("bola em XVA = bola em pt-BR (contagens por volta e número de pontos do grafo)", () => {
    const x = produced(BOLA_XVA, "xva");
    const p = produced(BOLA_PT, "pt-BR");
    expect(x.r.issues).toEqual([]);
    expect(x.rows).toEqual([6, 12, 18, 18, 12, 6]);
    expect(x.rows).toEqual(p.rows);
    expect(buildGraph(x.r.pattern).nodes.length).toBe(buildGraph(p.r.pattern).nodes.length);
  });

  test("R0: MR vira o começo da R1 (sem linha vazia); sem R0 a primeira volta também nasce do anel", () => {
    const x = parsePattern(BOLA_XVA, { dialect: "xva" });
    expect(x.pattern.rows.length).toBe(6);
    expect(x.pattern.rows[0]?.start).toBe("magicRing");
    const sem = parsePattern("R1: 6X\nR2: 6V", { dialect: "xva" });
    expect(sem.pattern.rows[0]?.start).toBe("magicRing");
    // começando por corrente não é anel
    const corr = parsePattern("R1: 6CH\nR2: 6X", { dialect: "xva" });
    expect(corr.pattern.rows[0]?.start).toBeUndefined();
  });

  test("MR[N] que não bate com a primeira volta avisa; MR[6] com 6 pontos não avisa", () => {
    const ruim = parsePattern("R0: MR[8]\nR1: 6X", { dialect: "xva" });
    expect(ruim.issues.some((i) => i.code === "RING_COUNT_MISMATCH" && i.severity === "warning")).toBe(true);
    expect(parsePattern("R0: MR[6]\nR1: 6X", { dialect: "xva" }).issues).toEqual([]);
  });

  test("intervalo R2-R4 e repetição com o número na frente", () => {
    const r = parsePattern("R1: 6X\nR2-R4: 6X", { dialect: "xva" });
    expect(r.issues).toEqual([]);
    expect(r.pattern.rows[1]?.repeatRows).toBe(3);
    expect(expandPattern(r.pattern).reduce((n, e) => n + e.reps, 0)).toBe(4);
    expect(produced("R1: 6X\nR2: 6 (V)", "xva").rows).toEqual([6, 12]);
    // pt-BR também aceita o número na frente
    const pt = produced("V1: 6 pb no anel mágico (6)\nV2: 6 (1 aum) (12)", "pt-BR");
    expect(pt.r.issues).toEqual([]);
    expect(pt.rows).toEqual([6, 12]);
    // e o intervalo com a letra repetida nos dois lados
    const dois = parsePattern("V1: 6 pb no anel mágico\nV2-V3: 6 pb", { dialect: "pt-BR" });
    expect(dois.pattern.rows[1]?.repeatRows).toBe(2);
  });

  test("(X, V) 3X é um grupo mais 3 pb, não um grupo repetido 3 vezes; 6x = 6X", () => {
    const r = parsePattern("R1: 6X\nR2: (X, V) 3X", { dialect: "xva" });
    expect(r.issues).toEqual([]);
    expect(expandPattern(r.pattern).map((e) => e.produced)).toEqual([6, 6]);
    const ops = r.pattern.rows[1]?.ops ?? [];
    expect(ops[ops.length - 1]).toMatchObject({ kind: "stitch", code: "SC", count: 3 });
    expect(parsePattern("R1: 6x", { dialect: "xva" }).pattern.rows[0]?.ops).toEqual(
      parsePattern("R1: 6X", { dialect: "xva" }).pattern.rows[0]?.ops,
    );
  });

  test("W = aumento de 3; T, F, E = mpa, pa, pad; K = pular; 'a' e 'e' não viram palavras de ligação", () => {
    const r = parsePattern("R1: 6X\nR2: 2W, T, F, E, A, K", { dialect: "xva" });
    expect(r.issues).toEqual([]);
    const ops = r.pattern.rows[1]?.ops ?? [];
    expect(ops[0]).toMatchObject({ kind: "inc", k: 3, count: 2 });
    expect(ops.map((o) => (o.kind === "stitch" ? o.code : o.kind))).toEqual([
      "inc",
      "HDC",
      "DC",
      "TR",
      "dec",
      "skip",
    ]);
  });

  test("termos fora do escopo viram erro, não quebra", () => {
    for (const t of ["6Q", "2TV", "3FA", "P1"]) {
      const r = parsePattern(`R1: 6X\nR2: ${t}`, { dialect: "xva" });
      expect(r.issues.some((i) => i.severity === "error")).toBe(true);
    }
  });

  test("detecção automática: reconhece XVA e não muda a detecção dos outros dialetos", () => {
    expect(parsePattern(BOLA_XVA).detected).toBe("xva");
    expect(parsePattern("R1: 6X\nR2-R4: 6V, 3X").detected).toBe("xva");
    expect(parsePattern(BOLA_PT).detected).toBe("pt-BR");
    expect(parsePattern("Rnd 1: 6 sc in magic ring").detected).toBe("en-US");
  });

  test("ida e volta: pt-BR → XVA → leitura dá as mesmas contagens, e a saída tem R0: MR", () => {
    const pt = parsePattern(BOLA_PT, { dialect: "pt-BR" }).pattern;
    const txt = printPattern(pt, "xva");
    expect(txt.split("\n")[0]).toBe("R0: MR");
    const back = parsePattern(txt, { dialect: "xva" });
    expect(back.issues).toEqual([]);
    expect(expandPattern(back.pattern).map((e) => e.produced)).toEqual(
      expandPattern(pt).map((e) => e.produced),
    );
  });
});

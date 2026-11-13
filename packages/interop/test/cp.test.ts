// SPDX-License-Identifier: GPL-3.0-or-later
// Tradutor CrochetPARADE, conferido contra o export real da F0 (esfera de circunferência 20).
import { readFileSync } from "node:fs";
import { validate } from "@novelo/core";
import { parsePattern } from "@novelo/notation";
import { describe, expect, test } from "vitest";
import { fromCp, parseCpDot, toCp } from "../src/index.ts";

const dir = new URL("../../../referencia/cp-export-esfera20/", import.meta.url);

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

describe("texto CrochetPARADE", () => {
  test("P-BOLA vira texto CP legível", () => {
    const r = toCp(parsePattern(P_BOLA).pattern);
    expect(r.ok && r.value.split("\n").slice(0, 5)).toEqual([
      "ring",
      "sc6inc",
      "6sc2inc",
      "6*[sc,sc2inc]",
      "6*[2sc,sc2inc]",
    ]);
    expect(r.ok && r.value.split("\n")).toHaveLength(1 + 17);
  });

  test("ida e volta: P-BOLA -> CP -> receita mantém as 17 contagens", () => {
    const cp = toCp(parsePattern(P_BOLA).pattern);
    if (!cp.ok) throw new Error("toCp falhou");
    const back = fromCp(cp.value);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const v = validate(back.value);
    expect(v.issues).toEqual([]);
    expect(v.counts).toEqual([6, 12, 18, 24, 30, 36, 36, 36, 36, 36, 36, 36, 30, 24, 18, 12, 6]);
  });

  test("oráculo: a receita do export real do CP tem as mesmas contagens por volta que o .dot", () => {
    const debug = readFileSync(new URL("debug.txt", dir), "utf8");
    const original = /=======Original text:=======\n([\s\S]*?)\n=======/.exec(debug)?.[1] ?? "";
    expect(original.split("\n")[0]).toBe("ring");
    const r = fromCp(original);
    if (!r.ok) throw new Error("fromCp falhou");
    expect(r.issues).toEqual([]);
    const v = validate(r.value);
    expect(v.issues.filter((i) => i.severity === "error")).toEqual([]);

    const dot = parseCpDot(readFileSync(new URL("crochet.dot", dir), "utf8"));
    if (!dot.ok) throw new Error("dot inválido");
    const perRound = new Map<number, number>();
    for (const n of dot.value.nodes) {
      const round = Number(n.name.split(",")[0]);
      perRound.set(round, (perRound.get(round) ?? 0) + 1);
    }
    const dotCounts = [...perRound.keys()]
      .filter((k) => k >= 1)
      .sort((a, b) => a - b)
      .map((k) => perRound.get(k));
    expect(v.counts).toEqual(dotCounts);
  });

  test("corrente não contada gera aviso ao exportar", () => {
    const p = parsePattern("V1: 1 corr (não conta), 12 pb, pbx na corrente inicial", {
      dialect: "pt-BR",
    }).pattern;
    const r = toCp(p);
    expect(r.issues.map((i) => i.code)).toContain("UNSUPPORTED_CP_FEATURE");
  });
});

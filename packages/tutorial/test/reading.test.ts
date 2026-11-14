// SPDX-License-Identifier: GPL-3.0-or-later
// Roteiro do modo de leitura (G2): passo = cadeia de pontos iguais, marco = fim de cada linha da receita ou `#marco`.
import { applyPaint, buildGraph } from "@novelo/core";
import { parsePattern, printPattern, printPatternWithYarns } from "@novelo/notation";
import { describe, expect, test } from "vitest";
import { readingScript } from "../src/index.ts";

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

const read = (text: string) => {
  const { pattern } = parsePattern(text);
  return { pattern, ...readingScript(pattern, buildGraph(pattern)) };
};

describe("modo de leitura: roteiro", () => {
  test("P-BOLA: um marco por linha da receita e dois slides depois de cada um", () => {
    const { steps, milestones } = read(P_BOLA);
    expect(milestones).toHaveLength(12); // V7–12 é uma linha só
    expect(milestones[6]).toMatchObject({ fromRound: 7, toRound: 12, rowLabel: "12" });
    expect(steps.filter((s) => s.kind === "review")).toHaveLength(12);
    expect(steps.filter((s) => s.kind === "state")).toHaveLength(12);
    // os dois slides vêm logo depois do último passo do marco, revisão primeiro
    const at = steps.findIndex((s) => s.kind === "review");
    expect(steps[at + 1]?.kind).toBe("state");
    expect(steps[at - 1]?.kind).toBe("step");
  });

  test("passo = cadeia: 6 pb no anel é um passo; (1 pb, 1 aum) x6 são 12 passos com repetição i de 6", () => {
    const { steps } = read(P_BOLA);
    const v1 = steps.filter((s) => s.kind === "step" && s.round === 1);
    expect(v1).toHaveLength(1);
    expect(v1[0]).toMatchObject({ instruction: "6 pb", count: 6 });
    const v3 = steps.filter((s) => s.kind === "step" && s.round === 3);
    expect(v3).toHaveLength(12);
    expect(v3[0]?.line).toBe("(1 pb, 1 aum) x6");
    expect(v3[0]?.repetition).toEqual({ i: 1, k: 6 });
    expect(v3[11]?.repetition).toEqual({ i: 6, k: 6 });
    expect(v3[11]?.alerts).toContain("rowEnd");
  });

  test("slide de revisão traz o que foi feito no marco; o de estado traz tudo até ali", () => {
    const { steps, milestones } = read(P_BOLA);
    const reviews = steps.filter((s) => s.kind === "review");
    const states = steps.filter((s) => s.kind === "state");
    expect(reviews[0]?.nodeIds).toHaveLength(6);
    expect(reviews[1]?.nodeIds).toHaveLength(12);
    expect(reviews[6]?.nodeIds).toHaveLength(36 * 6); // V7–12: seis voltas de 36
    expect(states.every((s) => s.nodeIds.length === 0)).toBe(true); // o estado não destaca nada
    expect(milestones[6]?.title).toBe("Voltas 7–12 concluídas");
  });

  test("`#marco texto` marca o fim de uma volta, sobrevive a imprimir e ler de novo e não vira passo", () => {
    const text = `${P_BOLA.split("\n").slice(0, 2).join("\n")}\n#marco Fechar o anel\nV3: (1 pb, 1 aum) x6 (18)`;
    const { pattern, milestones } = read(text);
    expect(milestones[1]).toMatchObject({ title: "Fechar o anel", manual: true });
    expect(milestones[0]?.manual).toBe(false);
    const again = read(printPattern(pattern));
    expect(again.milestones.map((m) => m.title)).toEqual(milestones.map((m) => m.title));
  });

  test("#marco depois de uma linha V7-12 sai uma vez só, também com fios", () => {
    const { pattern } = parsePattern(
      "V1: 6 pb no anel mágico (6)\nV2-4: 1 pb em cada ponto (6)\n#marco Corpo\nV5: 6 dim (3)",
    );
    expect(printPattern(pattern).match(/#marco/g)).toHaveLength(1);
    const yarns = buildGraph(pattern).nodes.map(() => "A");
    expect(printPatternWithYarns(pattern, yarns).text.match(/#marco/g)).toHaveLength(1);
  });

  test("troca de fio vira aviso no passo e quebra a cadeia", () => {
    const { pattern } = parsePattern("V1: 6 pb no anel mágico (6)");
    const graph = applyPaint(buildGraph(pattern), [{ kind: "rows", yarn: "B", from: 1, to: 1 }]);
    const painted = readingScript(pattern, graph).steps[0];
    expect(painted?.alerts).toContain("rowStart");
    expect(painted?.yarnId).toBe("B");
  });
});

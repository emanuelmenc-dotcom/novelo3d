// SPDX-License-Identifier: GPL-3.0-or-later
// Roteiro do tutorial (docs/09 seção 5, P4): uma lista ordenada de passos, um por operação da receita expandida.
// Puro: mesma receita e mesmo grafo dão o mesmo roteiro. A tela cuida de câmera, destaque e botões.
import { type Atom, atomKey, type Dialect, expandRounds, type Pattern, type StitchGraph } from "@novelo/core";
import { foldKeys, segText } from "@novelo/notation";

export type TutorialAlert = "yarnChange" | "rowStart" | "rowEnd";

export interface TutorialStep {
  /** Posição no roteiro, a partir de 0. */
  index: number;
  /** Pontos feitos neste passo (2 para um aumento, nenhum para pular ou fechar). */
  nodeIds: number[];
  /** Onde a agulha entra: os pais dos pontos feitos. */
  parentIds: number[];
  /** Volta, contando cada repetição de "voltas 7–12" como uma volta, a partir de 1. */
  round: number;
  /** Rótulo da volta (7, 8, ... para "7–12"). */
  rowLabel: string;
  /** "ponto 13 de 33": posição entre os passos da volta, a partir de 1. */
  positionInRow: number;
  /** Quantos passos a volta tem (inclui pular e fechar; pode passar da contagem da tabela). */
  rowTotal: number;
  instruction: string;
  yarnId: string;
  alerts: TutorialAlert[];
}

const nodesOf = (a: Atom): number => {
  switch (a.kind) {
    case "stitch":
    case "dec":
    case "slInto":
      return 1;
    case "inc":
      return a.k;
    default:
      return 0;
  }
};

/** Texto do passo, no dialeto da receita; aumento e diminuição dizem o que fazem. */
function instructionOf(a: Atom, d: Dialect): string {
  const base = segText(foldKeys([atomKey(a)]), d);
  if (a.kind === "inc") return `${base} (${a.k} pontos no mesmo ponto)`;
  if (a.kind === "dec") return `${base} (${a.k} pontos juntos)`;
  return base;
}

/**
 * Passos do tutorial. `graph` é o grafo da receita já com o fio pintado (`applyPaint`): é dele que vêm os pais e o fio
 * de cada ponto, então o roteiro nunca refaz essas regras. Marcadores de texto não são passos.
 */
export function tutorialScript(pattern: Pattern, graph: StitchGraph): TutorialStep[] {
  const steps: TutorialStep[] = [];
  const seen = new Map<Pattern["rows"][number], number>();
  let lastYarn: string | undefined;
  for (const r of expandRounds(pattern)) {
    const rep = seen.get(r.row) ?? 0;
    seen.set(r.row, rep + 1);
    const first = /^\d+/.exec(r.row.label);
    const rowLabel = first && r.row.repeatRows ? String(Number(first[0]) + rep) : r.row.label;
    const own = r.atoms
      .map((a, i) => ({ a, at: r.atomNode[i] as number }))
      .filter(({ a }) => a.kind !== "marker");
    own.forEach(({ a, at }, k) => {
      const nodeIds = at >= 0 ? Array.from({ length: nodesOf(a) }, (_, j) => at + j) : [];
      const parents = new Set<number>();
      for (const id of nodeIds) for (const p of graph.nodes[id]?.parents ?? []) parents.add(p);
      const yarnId =
        (nodeIds[0] !== undefined ? graph.nodes[nodeIds[0]]?.yarnId : undefined) ?? lastYarn ?? "A";
      const alerts: TutorialAlert[] = [];
      if (k === 0) alerts.push("rowStart");
      if (lastYarn !== undefined && yarnId !== lastYarn) alerts.push("yarnChange");
      if (k === own.length - 1) alerts.push("rowEnd");
      lastYarn = yarnId;
      steps.push({
        index: steps.length,
        nodeIds,
        parentIds: [...parents],
        round: r.round,
        rowLabel,
        positionInRow: k + 1,
        rowTotal: own.length,
        instruction: instructionOf(a, pattern.dialect),
        yarnId,
        alerts,
      });
    });
  }
  return steps;
}

export * from "./reading.ts";

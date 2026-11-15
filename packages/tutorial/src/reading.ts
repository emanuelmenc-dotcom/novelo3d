// SPDX-License-Identifier: GPL-3.0-or-later
// Roteiro do modo de leitura (G2, D-66): um passo por cadeia de pontos iguais, marcos no fim de cada linha da receita (ou
// no `#marco texto`) e, depois de cada marco, dois slides de revisão: o que foi feito desde o marco anterior e o estado
// atual. Puro: mesma receita e mesmo grafo dão o mesmo roteiro.
import {
  atomKey,
  type ChainRun,
  chainsOf,
  expandRounds,
  nodesOf,
  type Pattern,
  runs,
  type Seg,
  type StitchGraph,
} from "@novelo/core";
import { segText } from "@novelo/notation";
import type { TutorialAlert } from "./index.ts";

export type ReadingKind = "step" | "review" | "state";

export interface ReadingMilestone {
  index: number;
  title: string;
  /** Escrito na receita com `#marco`, e não só o fim de uma linha. */
  manual: boolean;
  fromRound: number;
  toRound: number;
  rowLabel: string;
}

export interface ReadingStep {
  index: number;
  kind: ReadingKind;
  /** Marco a que o passo pertence (passos e slides do mesmo marco compartilham o número). */
  milestone: number;
  /** Pontos feitos neste passo; no slide de revisão, os do marco; no de estado, vazio (nada em destaque). */
  nodeIds: number[];
  parentIds: number[];
  round: number;
  rowLabel: string;
  /** "6 pb": a cadeia, no dialeto da receita. Vazio nos slides. */
  instruction: string;
  count: number;
  yarnId: string;
  alerts: TutorialAlert[];
  /** Posição da cadeia entre as cadeias da volta. */
  positionInRow: number;
  rowTotal: number;
  /** Repetição do bloco `(…) ×k` em que o passo está, quando a volta é dobrada. */
  repetition?: { i: number; k: number };
  /** A volta inteira, com os blocos dobrados: `(1 pb, 1 aum) x6`. */
  line: string;
}

export interface ReadingScript {
  steps: ReadingStep[];
  milestones: ReadingMilestone[];
}

const expandRun = (r: ChainRun): string[] => Array(r.count).fill(r.key);

/** A volta como uma linha de texto, no formato do gráfico v3. */
function lineText(keys: string[], pattern: Pattern): string {
  const c = chainsOf(keys);
  const segs: Seg[] = [...runs(c.head.flatMap(expandRun))];
  if (c.times > 1) segs.push({ t: "block", keys: c.body.flatMap(expandRun), times: c.times });
  else segs.push(...runs(c.body.flatMap(expandRun)));
  segs.push(...runs(c.tail.flatMap(expandRun)));
  return segText(segs, pattern.dialect);
}

export function readingScript(pattern: Pattern, graph: StitchGraph): ReadingScript {
  const out: ReadingStep[] = [];
  const milestones: ReadingMilestone[] = [];
  const rounds = expandRounds(pattern);
  let lastYarn: string | undefined;
  let sinceNodes: number[] = [];
  let sinceFromRound = 1;
  const seen = new Map<Pattern["rows"][number], number>();

  rounds.forEach((r, ri) => {
    const rep = seen.get(r.row) ?? 0;
    seen.set(r.row, rep + 1);
    const first = /^\d+/.exec(r.row.label);
    const rowLabel = first && r.row.repeatRows ? String(Number(first[0]) + rep) : r.row.label;
    const own = r.atoms
      .map((a, i) => ({ a, at: r.atomNode[i] as number }))
      .filter(({ a }) => a.kind !== "marker");
    const keys = own.map(({ a }) => atomKey(a));
    const line = lineText(keys, pattern);

    // cadeias: pontos iguais seguidos na mesma volta e com o mesmo fio
    type Chain = { key: string; atoms: typeof own; yarnId: string };
    const chains: Chain[] = [];
    for (const item of own) {
      const key = atomKey(item.a);
      const id = item.at >= 0 ? item.at : undefined;
      const yarnId = (id !== undefined ? graph.nodes[id]?.yarnId : undefined) ?? lastYarn ?? "A";
      const last = chains[chains.length - 1];
      if (last && last.key === key && last.yarnId === yarnId) last.atoms.push(item);
      else chains.push({ key, atoms: [item], yarnId });
      lastYarn = yarnId;
    }
    lastYarn = undefined;
    const c = chainsOf(keys);
    const foldable = c.times > 1 && chains.length === c.head.length + c.body.length * c.times + c.tail.length;
    const milestone = milestones.length;

    chains.forEach((ch, k) => {
      const nodeIds: number[] = [];
      for (const { a, at } of ch.atoms)
        for (let j = 0; j < nodesOf(a); j++) if (at >= 0) nodeIds.push(at + j);
      const parents = new Set<number>();
      for (const id of nodeIds) for (const p of graph.nodes[id]?.parents ?? []) parents.add(p);
      const alerts: TutorialAlert[] = [];
      if (k === 0) alerts.push("rowStart");
      const prevYarn = out.length > 0 ? out[out.length - 1]?.yarnId : undefined;
      if (prevYarn !== undefined && ch.yarnId !== prevYarn) alerts.push("yarnChange");
      if (k === chains.length - 1) alerts.push("rowEnd");
      const inBody = foldable && k >= c.head.length && k < c.head.length + c.body.length * c.times;
      out.push({
        index: out.length,
        kind: "step",
        milestone,
        nodeIds,
        parentIds: [...parents],
        round: r.round,
        rowLabel,
        instruction: segText([{ t: "run", key: ch.key, count: ch.atoms.length }], pattern.dialect),
        count: ch.atoms.length,
        yarnId: ch.yarnId,
        alerts,
        positionInRow: k + 1,
        rowTotal: chains.length,
        repetition: inBody
          ? { i: Math.floor((k - c.head.length) / c.body.length) + 1, k: c.times }
          : undefined,
        line,
      });
      for (const id of nodeIds) sinceNodes.push(id);
    });

    // fim de marco: só nas linhas com `#marco`, no fim de um grupo de voltas ("V7–12") e no fim da peça; voltas
    // soltas seguem sem parar (decisão do usuário em 2026-11-15, pergunta 8 em docs/12)
    const next = rounds[ri + 1];
    const rowEnds = !next || next.row !== r.row;
    if (rowEnds && (r.row.milestone !== undefined || (r.row.repeatRows ?? 1) > 1 || !next)) {
      milestones.push({
        index: milestone,
        title:
          r.row.milestone ??
          (sinceFromRound === r.round
            ? `Volta ${r.round} concluída`
            : `Voltas ${sinceFromRound}–${r.round} concluídas`),
        manual: r.row.milestone !== undefined,
        fromRound: sinceFromRound,
        toRound: r.round,
        rowLabel,
      });
      for (const kind of ["review", "state"] as const) {
        out.push({
          index: out.length,
          kind,
          milestone,
          // o slide de estado não destaca nada: a tela já sabe até onde a peça está pelos passos anteriores
          nodeIds: kind === "review" ? sinceNodes.slice() : [],
          parentIds: [],
          round: r.round,
          rowLabel,
          instruction: "",
          count: 0,
          yarnId: out[out.length - 1]?.yarnId ?? "A",
          alerts: [],
          positionInRow: 0,
          rowTotal: 0,
          line,
        });
      }
      sinceNodes = [];
      sinceFromRound = r.round + 1;
    }
  });
  return { steps: out, milestones };
}

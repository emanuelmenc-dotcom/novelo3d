// SPDX-License-Identifier: GPL-3.0-or-later
// Comandos do tutorial (P4), chamáveis pela janela e pela ponte MCP (D-21):
// tutorial.get | next | prev | goto | script | first | last | nextRound | prevRound | nextMilestone | prevMilestone | slide | reading | reset. O roteiro é calculado por `@novelo/tutorial` a partir da receita
// (`text`, `dialect`) e da pintura do projeto; aqui só se guarda a posição e se responde com o passo atual.
import type { ReadingMilestone, ReadingStep } from "@novelo/tutorial";
import { readingOn, resetTutorial, setReading, setTutorialPos, tutorialPositions } from "./tutorial-store.ts";

type Params = Record<string, unknown>;
type Cmd = (p: Params) => unknown;

export interface ScriptCtx {
  steps: ReadingStep[];
  milestones: ReadingMilestone[];
  /** uid permanente do ponto `id` (o mesmo que a seleção e a pintura usam). */
  uidOf: (id: number) => number;
}

const MAX_SLICE = 200;

const partOf = (p: Params): string => (typeof p.part === "string" && p.part !== "" ? p.part : "p1");
const int = (p: Params, k: string): number | undefined => {
  const v = p[k];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v))
    throw new Error(`parâmetro '${k}' deve ser um número inteiro`);
  return v;
};
const clamp = (i: number, n: number): number => Math.max(0, Math.min(Math.max(0, n - 1), i));

/** Passo em que o usuário está: pelo uid guardado, se ele ainda existir; senão pelo índice, dentro do roteiro. */
function currentIndex(part: string, c: ScriptCtx): number {
  const pos = tutorialPositions()[part];
  if (!pos) return 0;
  if (pos.uid !== null) {
    const i = c.steps.findIndex(
      // o passo que contém o ponto guardado (posições antigas guardam o primeiro ponto do passo por ponto)
      (s) => s.kind === "step" && s.nodeIds.some((id) => c.uidOf(id) === pos.uid),
    );
    if (i >= 0) return i;
  }
  return clamp(pos.index, c.steps.length);
}

function view(part: string, c: ScriptCtx) {
  const total = c.steps.length;
  const index = currentIndex(part, c);
  const step = c.steps[index] ?? null;
  // os pontos nascem na ordem do roteiro: tudo até o maior número de nó dos passos anteriores já está feito
  let doneThrough = (c.steps[0]?.nodeIds[0] ?? 0) - 1;
  for (let i = 0; i < index; i++)
    for (const id of c.steps[i]?.nodeIds ?? []) doneThrough = Math.max(doneThrough, id);
  return {
    part,
    total,
    rounds: c.steps[total - 1]?.round ?? 0,
    milestones: c.milestones.length,
    milestone: step ? c.milestones[step.milestone] : null,
    reading: readingOn(),
    index,
    step,
    doneThrough,
    currentUids: (step?.nodeIds ?? []).map(c.uidOf),
    parentUids: (step?.parentIds ?? []).map(c.uidOf),
  };
}

function moveTo(part: string, c: ScriptCtx, index: number) {
  const i = clamp(index, c.steps.length);
  // só um passo se ancora pelo uid: os slides repetem os pontos dos passos e ficam pelo índice
  const st = c.steps[i];
  const first = st?.kind === "step" ? st.nodeIds[0] : undefined;
  setTutorialPos(part, { index: i, uid: first === undefined ? null : c.uidOf(first) });
  return view(part, c);
}

export function tutorialCommands(scriptOf: (p: Params) => ScriptCtx): Record<string, Cmd> {
  return {
    /** Passo atual: step, index, total, rounds, doneThrough (último nó pronto) e uids do ponto e dos pais. */
    "tutorial.get": (p) => view(partOf(p), scriptOf(p)),
    "tutorial.next": (p) => {
      const c = scriptOf(p);
      return moveTo(partOf(p), c, currentIndex(partOf(p), c) + 1);
    },
    "tutorial.prev": (p) => {
      const c = scriptOf(p);
      return moveTo(partOf(p), c, currentIndex(partOf(p), c) - 1);
    },
    /** Vai ao passo `step` (1 a total) ou ao primeiro passo da volta `round` (1 a rounds). */
    "tutorial.goto": (p) => {
      const c = scriptOf(p);
      const step = int(p, "step");
      const round = int(p, "round");
      if (step === undefined && round === undefined) throw new Error("informe 'step' ou 'round'");
      if (step !== undefined) {
        if (step < 1 || step > c.steps.length)
          throw new Error(`o passo deve estar entre 1 e ${c.steps.length}`);
        return moveTo(partOf(p), c, step - 1);
      }
      const i = c.steps.findIndex((s) => s.round === round);
      if (i < 0) throw new Error(`a volta ${String(round)} não existe`);
      return moveTo(partOf(p), c, i);
    },
    /** Trecho do roteiro (from a partir de 0, count até 200), sem devolver a receita inteira. */
    "tutorial.script": (p) => {
      const c = scriptOf(p);
      const from = Math.max(0, int(p, "from") ?? 0);
      const count = Math.min(MAX_SLICE, Math.max(1, int(p, "count") ?? 50));
      return { total: c.steps.length, from, steps: c.steps.slice(from, from + count) };
    },
    /** Primeiro e último passo do roteiro. */
    "tutorial.first": (p) => moveTo(partOf(p), scriptOf(p), 0),
    "tutorial.last": (p) => {
      const c = scriptOf(p);
      return moveTo(partOf(p), c, c.steps.length - 1);
    },
    /** Primeiro passo da volta seguinte (ou anterior): o mesmo que as setas para cima e para baixo do modo de leitura. */
    "tutorial.nextRound": (p) => {
      const c = scriptOf(p);
      const cur = c.steps[currentIndex(partOf(p), c)];
      const i = c.steps.findIndex((s) => s.kind === "step" && s.round > (cur?.round ?? 0));
      return moveTo(partOf(p), c, i < 0 ? c.steps.length - 1 : i);
    },
    "tutorial.prevRound": (p) => {
      const c = scriptOf(p);
      const cur = c.steps[currentIndex(partOf(p), c)];
      const want = Math.max(1, (cur?.round ?? 1) - (cur?.kind === "step" && cur.positionInRow > 1 ? 0 : 1));
      return moveTo(
        partOf(p),
        c,
        Math.max(
          0,
          c.steps.findIndex((s) => s.kind === "step" && s.round === want),
        ),
      );
    },
    /** Começo do marco seguinte (ou do atual, se já houver passos andados nele; senão do anterior). */
    "tutorial.nextMilestone": (p) => {
      const c = scriptOf(p);
      const cur = c.steps[currentIndex(partOf(p), c)];
      const i = c.steps.findIndex((s) => s.kind === "step" && s.milestone > (cur?.milestone ?? 0));
      return moveTo(partOf(p), c, i < 0 ? c.steps.length - 1 : i);
    },
    "tutorial.prevMilestone": (p) => {
      const c = scriptOf(p);
      const idx = currentIndex(partOf(p), c);
      const cur = c.steps[idx];
      const startOf = (m: number) => c.steps.findIndex((s) => s.kind === "step" && s.milestone === m);
      const here = startOf(cur?.milestone ?? 0);
      return moveTo(partOf(p), c, idx > here ? here : startOf(Math.max(0, (cur?.milestone ?? 0) - 1)));
    },
    /** Vai ao slide `kind` ("review": o que foi feito no marco; "state": como a peça está) do marco atual. */
    "tutorial.slide": (p) => {
      const c = scriptOf(p);
      const kind = p.kind;
      if (kind !== "review" && kind !== "state") throw new Error("'kind' deve ser review ou state");
      const cur = c.steps[currentIndex(partOf(p), c)];
      const i = c.steps.findIndex((s) => s.kind === kind && s.milestone === (cur?.milestone ?? 0));
      return moveTo(partOf(p), c, Math.max(i, 0));
    },
    /** Liga ou desliga o modo de leitura (sem `on`, alterna). */
    "tutorial.reading": (p) => {
      if (p.on !== undefined && typeof p.on !== "boolean")
        throw new Error("'on' deve ser verdadeiro ou falso");
      setReading(p.on === undefined ? !readingOn() : p.on);
      return { reading: readingOn() };
    },
    "tutorial.reset": () => {
      resetTutorial();
      return { ok: true };
    },
  };
}

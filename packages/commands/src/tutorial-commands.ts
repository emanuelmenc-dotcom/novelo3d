// SPDX-License-Identifier: GPL-3.0-or-later
// Comandos do tutorial (P4), chamáveis pela janela e pela ponte MCP (D-21):
// tutorial.get | next | prev | goto | script | reset. O roteiro é calculado por `@novelo/tutorial` a partir da receita
// (`text`, `dialect`) e da pintura do projeto; aqui só se guarda a posição e se responde com o passo atual.
import type { TutorialStep } from "@novelo/tutorial";
import { resetTutorial, setTutorialPos, tutorialPositions } from "./tutorial-store.ts";

type Params = Record<string, unknown>;
type Cmd = (p: Params) => unknown;

export interface ScriptCtx {
  steps: TutorialStep[];
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
    const i = c.steps.findIndex((s) => s.nodeIds[0] !== undefined && c.uidOf(s.nodeIds[0]) === pos.uid);
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
    index,
    step,
    doneThrough,
    currentUids: (step?.nodeIds ?? []).map(c.uidOf),
    parentUids: (step?.parentIds ?? []).map(c.uidOf),
  };
}

function moveTo(part: string, c: ScriptCtx, index: number) {
  const i = clamp(index, c.steps.length);
  const first = c.steps[i]?.nodeIds[0];
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
    "tutorial.reset": () => {
      resetTutorial();
      return { ok: true };
    },
  };
}

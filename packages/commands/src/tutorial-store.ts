// SPDX-License-Identifier: GPL-3.0-or-later
// Posição do usuário no tutorial (P4, RF-53), uma por peça. Guarda o índice do passo e o uid do primeiro ponto do passo:
// o uid sobrevive a edições da receita, então depois de editar o tutorial volta ao mesmo ponto; sem ele vale o índice.
// Mesmo padrão dos outros stores (D-21): o estado vive aqui, o studio só exibe. Fica FORA do desfazer global.

export interface TutorialPos {
  index: number;
  uid: number | null;
}

let positions: Record<string, TutorialPos> = {};
let version = 0;
const listeners = new Set<() => void>();

export const tutorialPositions = (): Readonly<Record<string, TutorialPos>> => positions;
/** Muda a cada alteração: a janela usa para saber quando recalcular. */
export const tutorialVersion = (): number => version;

export function subscribeTutorial(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function commit(next: Record<string, TutorialPos>): void {
  positions = next;
  version++;
  for (const fn of listeners) fn();
}

export const setTutorialPos = (part: string, pos: TutorialPos): void => commit({ ...positions, [part]: pos });

export const resetTutorial = (): void => commit({});

/** Posições de todas as peças (ou só das de `keep`), prontas para gravar. */
export function exportTutorial(keep?: string[]): Record<string, TutorialPos> {
  const out: Record<string, TutorialPos> = {};
  for (const [id, p] of Object.entries(positions)) if (!keep || keep.includes(id)) out[id] = { ...p };
  return out;
}

/** Carrega o que foi gravado; entradas inválidas são ignoradas, sem lançar erro. */
export function loadTutorial(raw: unknown): void {
  const next: Record<string, TutorialPos> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      const o = (v ?? {}) as { index?: unknown; uid?: unknown };
      if (typeof o.index === "number" && Number.isInteger(o.index) && o.index >= 0) {
        next[id] = {
          index: o.index,
          uid: typeof o.uid === "number" && Number.isInteger(o.uid) ? o.uid : null,
        };
      }
    }
  }
  commit(next);
}

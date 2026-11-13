// SPDX-License-Identifier: GPL-3.0-or-later
// Estado da janela do criador de pontos (etapa D, docs/16): o ponto que está sendo montado (máquina de estados do core),
// a base escolhida para o próximo `insert`, a mão que segura a agulha e o tamanho mínimo do quadro do diagrama.
// Mesmo padrão de paint-store e render-store: o estado vive na camada de comandos (D-21), o studio só exibe.
// Fica FORA do histórico global (desfazer do projeto) e da persistência do projeto: o criador tem o próprio desfazer, e
// salvar um ponto no projeto é a etapa E.
import { stitchBuilder as B } from "@novelo/core";

export type Hand = "right" | "left";

export interface StitchEditorState {
  builder: B.BuilderState;
  selectedBase: number;
  hand: Hand;
  /** Quantas bases a carreira de baixo sintética mostra. */
  bases: number;
  /** Maior quadro já desenhado desde o último `reset`: o diagrama nunca encolhe, assim os quadros não pulam entre os passos. */
  minWidth: number;
  minHeight: number;
}

export const EDITOR_BASES = 5;

const initial = (): StitchEditorState => ({
  builder: B.start(),
  selectedBase: 0,
  hand: "right",
  bases: EDITOR_BASES,
  minWidth: 0,
  minHeight: 0,
});

let current: StitchEditorState = initial();
let version = 0;
const listeners = new Set<() => void>();

export const stitchEditorState = (): StitchEditorState => current;
/** Muda a cada alteração: a janela usa para saber quando redesenhar. */
export const stitchEditorVersion = (): number => version;

export function subscribeStitchEditor(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function commitStitchEditor(next: StitchEditorState): StitchEditorState {
  current = next;
  version++;
  for (const fn of listeners) fn();
  return current;
}

/** Recomeça o ponto; a mão é preferência de quem usa, não parte do ponto, então fica. */
export const resetStitchEditor = (): StitchEditorState =>
  commitStitchEditor({ ...initial(), hand: current.hand });

// SPDX-License-Identifier: GPL-3.0-or-later
// Relógio comum dos históricos de desfazer (edições por ponto e peças/costuras): o maior número é o mais recente.
let tick = 0;
export const nextTick = (): number => ++tick;

const clearers = new Map<string, () => void>();
/** Cada pilha registra como limpar o seu "refazer"; uma ação nova em qualquer pilha limpa o das outras. */
export function registerRedoClear(kind: string, fn: () => void): void {
  clearers.set(kind, fn);
}
export function clearRedoExcept(kind: string): void {
  for (const [k, fn] of clearers) if (k !== kind) fn();
}

const resets = new Set<() => void>();
/** Quem precisa saber quando o projeto inteiro é trocado (novo, importado, carregado do disco). */
export const onProjectReset = (fn: () => void): void => void resets.add(fn);
export const fireProjectReset = (): void => {
  for (const fn of resets) fn();
};

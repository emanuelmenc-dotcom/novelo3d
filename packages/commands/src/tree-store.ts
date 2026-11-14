// SPDX-License-Identifier: GPL-3.0-or-later
// Item selecionado na árvore do projeto (G4): uma peça, uma costura ou a raiz. Só a interface lê; o editor de propriedades
// mostra o que está aqui. Estado da sessão, fora do projeto e do desfazer (mesmo padrão dos outros stores, D-21).

let selected: string | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const treeSelected = (): string | null => selected;
export const treeVersion = (): number => version;

export function subscribeTree(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function setTreeSelected(id: string | null): void {
  if (selected === id) return;
  selected = id;
  version++;
  for (const fn of listeners) fn();
}

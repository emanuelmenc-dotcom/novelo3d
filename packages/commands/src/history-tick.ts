// SPDX-License-Identifier: GPL-3.0-or-later
// Aviso de "o projeto inteiro foi trocado" (novo, importado, carregado do disco): a linha do tempo recomeça vazia.
const resets = new Set<() => void>();
export const onProjectReset = (fn: () => void): void => void resets.add(fn);
export const fireProjectReset = (): void => {
  for (const fn of resets) fn();
};

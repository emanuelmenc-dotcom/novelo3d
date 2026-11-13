// SPDX-License-Identifier: GPL-3.0-or-later
// Quais painéis estão realmente à vista. Quem sabe é o `Workspace` (que decide, por exemplo, juntar tudo em abas
// numa janela estreita); o app só calcula o 3D e liga atalhos quando o painel correspondente está à vista.
import type { PanelId } from "@novelo/commands";

let current: ReadonlySet<PanelId> = new Set();
const listeners = new Set<() => void>();

export const visibleSnapshot = (): ReadonlySet<PanelId> => current;

export function subscribeVisible(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Atualiza o conjunto; só avisa quem assina se algo mudou (evita laços de renderização). */
export function setVisiblePanels(next: ReadonlySet<PanelId>): void {
  if (next.size === current.size && [...next].every((p) => current.has(p))) return;
  current = new Set(next);
  for (const fn of listeners) fn();
}

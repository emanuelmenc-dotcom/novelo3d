// SPDX-License-Identifier: GPL-3.0-or-later
// Corte (seção) do 3D (G7): estado só da vista, fora do projeto e da linha do tempo. O Viewer3D o aplica ao desenho e ao
// clique; o modo de leitura o ignora.
import type { SectionSpec } from "./view3d.ts";

export interface SectionState {
  axis: SectionSpec["axis"] | null;
  pos: number;
  flip: boolean;
}

let st: SectionState = { axis: null, pos: 50, flip: false };
const listeners = new Set<() => void>();
export const sectionSnapshot = (): SectionState => st;
export function subscribeSection(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function setSection(patch: Partial<SectionState>): void {
  st = { ...st, ...patch };
  for (const fn of listeners) fn();
}
/** O corte para o Viewer3D, ou null sem corte. */
export const sectionSpec = (s: SectionState): SectionSpec | null =>
  s.axis ? { axis: s.axis, pos: s.pos, flip: s.flip } : null;

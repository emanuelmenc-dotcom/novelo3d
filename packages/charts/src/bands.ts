// SPDX-License-Identifier: GPL-3.0-or-later
// Faixa translúcida atrás de cada sequência de 5 ou mais pb seguidos e a etiqueta "Nx" junto ao primeiro ponto
// (docs/17 seções 2 e 3; `find_runs`, `band_arc`, `place_labels` do v3.py). Aguarda aprovação visual (regra 7).
import { frame, type P, type Svg } from "./draw.ts";
import type { Item } from "./layout.ts";
import { countTag } from "./table.ts";

/** Menor sequência de pb que ganha faixa (MINRUN do v3.py). */
export const MINRUN = 5;

/** Sequências de pb seguidos na volta. Aumentos, diminuições, correntes e pbx interrompem; não atravessa o fim da volta. */
export function findRuns(items: Item[], minRun = MINRUN): Item[][] {
  const runs: Item[][] = [];
  let cur: Item[] = [];
  for (const it of items) {
    if (it.typ === "pb") cur.push(it);
    else {
      if (cur.length >= minRun) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length >= minRun) runs.push(cur);
  return runs;
}

/** Etiqueta à espera de posição: só é colocada depois de desenhar todas as voltas da página. */
export interface PendingTag {
  r: number;
  a: number;
  txt: string;
  col: string;
}

/** Desenha as faixas da volta (antes dos símbolos) e devolve as etiquetas a posicionar. */
export function drawRunBands(s: Svg, c: P, r: number, items: Item[], col: string): PendingTag[] {
  const tags: PendingTag[] = [];
  for (const run of findRuns(items)) {
    const a0 = (run[0] as Item).a - 1.2 / r;
    const a1 = (run[run.length - 1] as Item).a + 1.2 / r;
    const pts = Array.from({ length: 61 }, (_, i) => frame(c, r, a0 + ((a1 - a0) * i) / 60).o);
    s.add(
      `<path d="M ${pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ")}" fill="none" stroke="${col}" stroke-opacity="0.17" stroke-width="5.0" stroke-linecap="round"/>`,
    );
    tags.push({ r, a: (run[0] as Item).a, txt: `${run.length}x`, col });
  }
  return tags;
}

const OFFSETS = [3.1, -3.1, 2.6, -2.6];
const FAR_OFFSETS = [4.4, -4.4, 5.4, -5.4];

/** Posições das etiquetas (mm), a de maior folga entre os quatro deslocamentos radiais; desenha cada uma. */
export function placeTags(s: Svg, c: P, tags: PendingTag[], symbols: P[]): P[] {
  const taken: P[] = [...symbols];
  const placed: P[] = [];
  for (const t of tags) {
    let best: { d: number; m: P } | null = null;
    // os quatro deslocamentos do v3.py; se nenhum deixa folga, tenta outros mais afastados
    for (const set of [OFFSETS, FAR_OFFSETS]) {
      for (const dr of set) {
        const m = frame(c, t.r + dr, t.a).o;
        const d = taken.reduce((min, q) => Math.min(min, Math.hypot(m[0] - q[0], m[1] - q[1])), 9);
        if (best === null || d > best.d) best = { d, m };
      }
      if (best && best.d >= 3.4) break;
    }
    if (!best) continue;
    countTag(s, best.m, t.txt, t.col);
    placed.push(best.m);
    for (const dx of [-2.5, 0, 2.5]) taken.push([best.m[0] + dx, best.m[1]]);
  }
  return placed;
}

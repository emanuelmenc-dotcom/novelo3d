// SPDX-License-Identifier: GPL-3.0-or-later
// Posicionamento angular dos símbolos numa volta. Port de `layout()` de referencia/graficos-python/chart.py
// (modo não estrito: sem linhas de ligação; ver docs/14, D-15 suspensa).

export interface Item {
  typ: string;
  parents: Item[];
  counted: boolean;
  /** Ângulo (rad, anti-horário a partir da direita). */
  a: number;
  /** Raio do anel (mm). */
  r: number;
  /** Símbolo de referência (cinza), de outra página. */
  ref?: boolean;
  /** Fio do ponto (id da paleta), quando há pintura. */
  yarn?: string;
  /** Grupo de aumento do grafo (id do primeiro ponto do grupo): os pontos do mesmo grupo contam um item na tabela. */
  grp?: number;
}

/** Largura reservada por símbolo (mm). Doc 10 seção 2.5. */
export const WIDTH: Record<string, number> = {
  pb: 4.7,
  aum: 4.7,
  dim: 5.2,
  d3: 6.9,
  d4: 8.6,
  mpa: 4.7,
  dc: 4.7,
  tr: 4.7,
  ch: 5.4,
  ch0: 5.4,
  pbx: 3.2,
  unw: 5.0,
};

const TWO_PI = 2 * Math.PI;
const mod = (x: number, m: number): number => ((x % m) + m) % m;
const at = <T>(arr: T[], i: number): T => arr[i] as T;

interface Unit {
  idx: number[];
  target: number;
  width: number;
}

/**
 * Atribui ângulos a `items` num anel de raio `r`. `labelW` é a largura do rótulo da volta (mm).
 * `first`: volta sem pontos de base (distribuição uniforme). Devolve o ângulo do rótulo.
 */
export function layoutRing(items: Item[], r: number, labelW: number, first: boolean, rot = 0): number {
  const n = items.length;
  const seq: (Item | null)[] = [...items, null];
  const m = seq.length;
  let tg: (number | null)[] = [];

  const anyParent = items.some((it) => it.parents.length > 0);
  if (first || !anyParent) {
    tg = items.map((_, i) => rot + (TWO_PI * (i + 0.9)) / (n + 0.8));
    tg.push(null);
  } else {
    const seen = new Map<Item, number>();
    for (const it of seq) {
      if (!it || it.parents.length === 0) {
        tg.push(null);
        continue;
      }
      const p0 = at(it.parents, 0);
      const ref = p0.a;
      const vals = it.parents.map((p) => ref + (mod(p.a - ref + Math.PI, TWO_PI) - Math.PI));
      let a = vals.reduce((s, v) => s + v, 0) / vals.length;
      if (it.typ === "aum") {
        const k = seen.get(p0) ?? 0;
        seen.set(p0, k + 1);
        a += ((k === 0 ? -1 : 1) * 2.45) / r;
      }
      tg.push(a);
    }
  }

  const known: number[] = [];
  tg.forEach((t, i) => {
    if (t !== null) known.push(i);
  });
  let last: number | null = null;
  for (const i of known) {
    let v = tg[i] as number;
    if (last !== null) {
      while (v < last - Math.PI) v += TWO_PI;
      while (v > last + Math.PI) v -= TWO_PI;
    }
    tg[i] = v;
    last = v;
  }
  const tg0 = tg.slice();
  for (let i = 0; i < m; i++) {
    if (tg0[i] !== null) continue;
    const los = known.filter((k) => k < i);
    const his = known.filter((k) => k > i);
    let lo: number;
    let lv: number;
    if (los.length > 0) {
      lo = at(los, los.length - 1);
      lv = tg[lo] as number;
    } else {
      lo = at(known, known.length - 1) - m;
      lv = (tg[at(known, known.length - 1)] as number) - TWO_PI;
    }
    let hi: number;
    let hv: number;
    if (his.length > 0) {
      hi = at(his, 0);
      hv = tg[hi] as number;
    } else {
      hi = m + at(known, 0);
      hv = (tg[at(known, 0)] as number) + TWO_PI;
    }
    tg[i] = lv + ((hv - lv) * (i - lo)) / (hi - lo);
  }

  // unidades: o par de pontos de um aumento anda junto
  const units: Unit[] = [];
  for (let i = 0; i < m; ) {
    const it = seq[i];
    const nx = seq[i + 1];
    if (it && nx && it.typ === "aum" && nx.typ === "aum" && at(nx.parents, 0) === at(it.parents, 0)) {
      units.push({
        idx: [i, i + 1],
        target: ((tg[i] as number) + (tg[i + 1] as number)) / 2,
        width: 2 * (WIDTH.aum as number),
      });
      i += 2;
    } else {
      units.push({
        idx: [i],
        target: tg[i] as number,
        width: it === null || it === undefined ? labelW : (WIDTH[it.typ] ?? 4.7),
      });
      i += 1;
    }
  }
  const m2 = units.length;
  const ut = units.map((u) => u.target);
  let wd = units.map((u) => u.width / r);
  const tot = wd.reduce((s, w) => s + w, 0);
  if (tot > TWO_PI * 0.995) wd = wd.map((w) => (w * TWO_PI * 0.995) / tot);

  let x = ut.slice();
  for (let itn = 0; itn < 4000; itn++) {
    const pull = itn < 3600 ? 0.02 : 0;
    if (pull) {
      const nx2 = x.slice();
      for (let i = 0; i < m2; i++) {
        const pi = (i - 1 + m2) % m2;
        const ni = (i + 1) % m2;
        const a = at(x, pi) - (i === 0 ? TWO_PI : 0);
        const b = at(x, ni) + (i === m2 - 1 ? TWO_PI : 0);
        const mid = (a + at(wd, pi) / 2 + (b - at(wd, ni) / 2)) / 2;
        nx2[i] = at(x, i) + 0.35 * (mid - at(x, i));
      }
      x = nx2;
    }
    for (let i = 0; i < m2; i++) {
      const j = (i + 1) % m2;
      const off = j === 0 ? TWO_PI : 0;
      const need = (at(wd, i) + at(wd, j)) / 2;
      const gap = at(x, j) + off - at(x, i);
      if (gap < need) {
        const d = (need - gap) / 2;
        x[i] = at(x, i) - d;
        x[j] = at(x, j) + d;
      }
    }
    if (pull) x = x.map((xi, k) => xi + pull * (at(ut, k) - xi));
  }

  let lab = 0;
  for (const it of items) it.r = r;
  units.forEach((u, k) => {
    const xa = at(x, k);
    if (u.idx.length === 2) {
      (seq[at(u.idx, 0)] as Item).a = xa - 2.35 / r;
      (seq[at(u.idx, 1)] as Item).a = xa + 2.35 / r;
    } else {
      const it = seq[at(u.idx, 0)];
      if (!it) lab = xa;
      else it.a = xa;
    }
  });
  return lab;
}

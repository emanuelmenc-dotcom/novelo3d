// SPDX-License-Identifier: GPL-3.0-or-later
// Impressor de receitas com dobra de repetições (docs/07 seção 4).
import {
  type Atom,
  atomKey,
  type Dialect,
  type ExpandedRow,
  expandPattern,
  type Pattern,
} from "@novelo/core";
import { NAMES } from "./dictionary.ts";

export type Seg = { t: "run"; key: string; count: number } | { t: "block"; keys: string[]; times: number };

const distinct = (k: string[]): number => new Set(k).size;

export function runs(keys: string[]): Seg[] {
  const out: Seg[] = [];
  for (const key of keys) {
    const last = out[out.length - 1];
    if (last && last.t === "run" && last.key === key) last.count++;
    else out.push({ t: "run", key, count: 1 });
  }
  return out;
}

const same = (K: string[], a: number, b: number, len: number): boolean => {
  for (let i = 0; i < len; i++) if (K[a + i] !== K[b + i]) return false;
  return true;
};

/** Dobra a sequência: cobertura total por um bloco repetido (maior k), senão cobertura parcial. */
export function foldKeys(K: string[]): Seg[] {
  const n = K.length;
  for (let p = 2; p <= n / 2; p++) {
    if (n % p !== 0 || distinct(K.slice(0, p)) < 2) continue;
    let ok = true;
    for (let i = p; i < n && ok; i += p) ok = same(K, 0, i, p);
    if (ok) return [{ t: "block", keys: K.slice(0, p), times: n / p }];
  }
  let best: { s: number; p: number; k: number; cov: number } | undefined;
  for (let s = 0; s < n; s++) {
    for (let p = 2; p <= (n - s) / 2; p++) {
      if (distinct(K.slice(s, s + p)) < 2) continue;
      let k = 1;
      while (s + (k + 1) * p <= n && same(K, s, s + k * p, p)) k++;
      if (k >= 2 && (!best || p * k > best.cov)) best = { s, p, k, cov: p * k };
    }
  }
  if (best && best.cov >= Math.max(4, n / 2)) {
    return [
      ...runs(K.slice(0, best.s)),
      { t: "block", keys: K.slice(best.s, best.s + best.p), times: best.k },
      ...runs(K.slice(best.s + best.cov)),
    ];
  }
  return runs(K);
}

function names(key: string, d: Dialect): { name: string; plain: boolean } {
  const N = NAMES[d];
  const pt = d === "pt-BR";
  if (key.startsWith("M:")) return { name: key.slice(2), plain: true };
  if (key === "JOIN") return { name: pt ? "pbx na corrente inicial" : "ss in first ch", plain: true };
  if (key === "SLINTO") return { name: pt ? `${N.SL} na corrente` : `${N.SL} in ch`, plain: false };
  if (key === "SKIP") return { name: N.SKIP, plain: false };
  if (key === "CH0") return { name: pt ? "corr (não conta)" : "ch (does not count)", plain: false };
  if (key === "SL0" || key === "SL") return { name: N.SL, plain: false };
  const inc = /^INC(\d+)$/.exec(key);
  if (inc) return { name: inc[1] === "2" ? N.INC : `${N.INC}${inc[1]}`, plain: false };
  const dec = /^DEC(\d+)$/.exec(key);
  if (dec) {
    if (dec[1] === "2") return { name: N.DEC, plain: false };
    return { name: pt ? `pb${dec[1]}jun` : `${N.SC}${dec[1]}tog`, plain: false };
  }
  return { name: N[key as "SC"], plain: false };
}

function runText(key: string, count: number, d: Dialect): string {
  const { name, plain } = names(key, d);
  return plain ? name : `${count} ${name}`;
}

export function segText(segs: Seg[], d: Dialect): string {
  return segs
    .map((s) => (s.t === "run" ? runText(s.key, s.count, d) : `(${segText(runs(s.keys), d)}) x${s.times}`))
    .join(", ");
}

export function rowBody(e: ExpandedRow, d: Dialect): string {
  const pt = d === "pt-BR";
  const keys = e.atoms.map(atomKey);
  const allSc = keys.length > 0 && keys.every((k) => k === "SC");
  if (e.row.start === "magicRing") {
    const tail = pt ? "no anel mágico" : "in magic ring";
    return `${segText(foldKeys(keys), d)} ${tail}`;
  }
  if (allSc && keys.length === e.prevCounted && e.prevCounted > 0) {
    return `1 ${NAMES[d].SC} ${pt ? "em cada ponto" : "in each st"}`;
  }
  return segText(foldKeys(keys), d);
}

export const PREFIX: Record<Dialect, { round: string; row: string }> = {
  "pt-BR": { round: "V", row: "C" },
  "en-US": { round: "Rnd ", row: "Row " },
  "en-UK": { round: "Round ", row: "Row " },
};

/** Escreve a receita no dialeto pedido a partir da forma canônica. */
export function printPattern(pattern: Pattern, dialect: Dialect = pattern.dialect): string {
  const rows = expandPattern(pattern);
  type Merged = { e: ExpandedRow; reps: number; sig: string };
  const merged: Merged[] = [];
  for (const e of rows) {
    const sig = `${e.atoms.map(atomKey).join(",")}|${e.prevCounted}|${e.produced}|${e.row.start ?? ""}|${e.row.kind}`;
    const last = merged[merged.length - 1];
    if (last && last.sig === sig && e.row.start === undefined) last.reps += e.reps;
    else merged.push({ e, reps: e.reps, sig });
  }
  let n = 1;
  const lines: string[] = [];
  for (const m of merged) {
    const label = m.reps > 1 ? `${n}–${n + m.reps - 1}` : String(n);
    n += m.reps;
    const pre = PREFIX[dialect][m.e.row.kind];
    lines.push(`${pre}${label}: ${rowBody(m.e, dialect)} (${m.e.produced})`);
  }
  return lines.join("\n");
}

export type { Atom };

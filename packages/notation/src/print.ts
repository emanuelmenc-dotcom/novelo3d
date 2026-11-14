// SPDX-License-Identifier: GPL-3.0-or-later
// Impressor de receitas com dobra de repetições (docs/07 seção 4).
import {
  type Atom,
  atomKey,
  type Dialect,
  type ExpandedRow,
  expandPattern,
  foldKeys,
  type Pattern,
  runs,
  type Seg,
} from "@novelo/core";
import { NAMES } from "./dictionary.ts";

export { foldKeys, type Seg };

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
  if (inc && d === "xva") {
    const k = inc[1];
    return { name: k === "2" ? "v" : k === "3" ? "w" : `x${k}inc`, plain: false };
  }
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
  if (plain) return name;
  // XVA: contagem colada na letra (6x, 3v); termos em inglês ficam separados (2 ch)
  return d === "xva" && /^[a-z]$|^x\d/.test(name) ? `${count}${name}` : `${count} ${name}`;
}

export function segText(segs: Seg[], d: Dialect): string {
  return segs
    .map((s) =>
      s.t === "run"
        ? runText(s.key, s.count, d)
        : d === "xva"
          ? `${s.times} (${segText(runs(s.keys), d)})`
          : `(${segText(runs(s.keys), d)}) x${s.times}`,
    )
    .join(", ");
}

export function rowBody(e: ExpandedRow, d: Dialect): string {
  const pt = d === "pt-BR";
  const keys = e.atoms.map(atomKey);
  const allSc = keys.length > 0 && keys.every((k) => k === "SC");
  if (e.row.start === "magicRing" && d === "xva") return segText(foldKeys(keys), d);
  if (e.row.start === "magicRing") {
    const tail = pt ? "no anel mágico" : "in magic ring";
    return `${segText(foldKeys(keys), d)} ${tail}`;
  }
  if (d !== "xva" && allSc && keys.length === e.prevCounted && e.prevCounted > 0) {
    return `1 ${NAMES[d].SC} ${pt ? "em cada ponto" : "in each st"}`;
  }
  return segText(foldKeys(keys), d);
}

export const PREFIX: Record<Dialect, { round: string; row: string }> = {
  "pt-BR": { round: "V", row: "C" },
  "en-US": { round: "Rnd ", row: "Row " },
  "en-UK": { round: "Round ", row: "Row " },
  xva: { round: "R", row: "R" },
};

/** Escreve a receita no dialeto pedido a partir da forma canônica. */
export function printPattern(pattern: Pattern, dialect: Dialect = pattern.dialect): string {
  const rows = expandPattern(pattern);
  type Merged = { e: ExpandedRow; reps: number; sig: string };
  const merged: Merged[] = [];
  for (const e of rows) {
    const sig = `${e.atoms.map(atomKey).join(",")}|${e.prevCounted}|${e.produced}|${e.row.start ?? ""}|${e.row.kind}${e.row.milestone === undefined ? "" : `|M${merged.length}`}`;
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
    if (dialect === "xva" && m.e.row.start === "magicRing") lines.push("R0: MR");
    lines.push(`${pre}${label}: ${rowBody(m.e, dialect)} (${m.e.produced})`);
    if (m.e.row.milestone !== undefined) lines.push(`#marco ${m.e.row.milestone}`);
  }
  return lines.join("\n");
}

export type { Atom };

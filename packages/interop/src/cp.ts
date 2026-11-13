// SPDX-License-Identifier: GPL-3.0-or-later
// Tradutor de/para o texto de receita do CrochetPARADE (subconjunto de docs/07 seção 6).
// Convenção do CP confirmada no export real da F0: `sc5inc` = 5 pontos no mesmo ponto de base
// (na volta 1, 5 pontos no anel); `5sc2inc` = 5 vezes `sc2inc`; `2*[sc,sc2inc]` = bloco repetido 2 vezes.
import {
  atomKey,
  expandPattern,
  type Issue,
  type Op,
  type Pattern,
  type Result,
  type Row,
} from "@novelo/core";
import { foldKeys, type Seg } from "@novelo/notation";

const SIMPLE: Record<string, string> = {
  SC: "sc",
  HDC: "hdc",
  DC: "dc",
  TR: "tr",
  CH: "ch",
  CH0: "ch",
  SL: "ss",
  SL0: "ss",
  SLINTO: "ss",
  SKIP: "sk",
};

function token(key: string, count: number, issues: Issue[], row: string): string {
  let base = SIMPLE[key];
  if (base === undefined) {
    const inc = /^INC(\d+)$/.exec(key);
    const dec = /^DEC(\d+)$/.exec(key);
    if (inc) base = `sc${inc[1]}inc`;
    else if (dec) base = `sc${dec[1]}tog`;
  }
  if (base === undefined) {
    issues.push({
      code: "UNSUPPORTED_CP_FEATURE",
      severity: "warning",
      message: `Volta ${row}: '${key}' não tem equivalente no CrochetPARADE e foi omitido.`,
    });
    return "";
  }
  if (key === "CH0") {
    issues.push({
      code: "UNSUPPORTED_CP_FEATURE",
      severity: "warning",
      message: `Volta ${row}: o CrochetPARADE não tem corrente 'não contada'; ela virou 'ch'.`,
    });
  }
  return count > 1 ? `${count}${base}` : base;
}

function segs(list: Seg[], issues: Issue[], row: string): string {
  return list
    .map((s) => {
      if (s.t === "run") return token(s.key, s.count, issues, row);
      const inner: Seg[] = [];
      for (const k of s.keys) {
        const last = inner[inner.length - 1];
        if (last && last.t === "run" && last.key === k) last.count++;
        else inner.push({ t: "run", key: k, count: 1 });
      }
      return `${s.times}*[${segs(inner, issues, row)}]`;
    })
    .filter((x) => x !== "")
    .join(",");
}

/** Converte a receita em texto do CrochetPARADE (uma linha por volta; intervalos são desdobrados). */
export function toCp(pattern: Pattern): Result<string> {
  const issues: Issue[] = [];
  const lines: string[] = [];
  for (const e of expandPattern(pattern)) {
    const keys = e.atoms.map(atomKey).filter((k) => k !== "JOIN" && !k.startsWith("M:"));
    let body: string;
    if (e.row.start === "magicRing") {
      lines.push("ring");
      body =
        keys.length > 0 && keys.every((k) => k === "SC")
          ? `sc${keys.length}inc`
          : segs(foldKeys(keys), issues, e.row.label);
    } else {
      body = segs(foldKeys(keys), issues, e.row.label);
    }
    for (let i = 0; i < e.reps; i++) lines.push(body);
  }
  return { ok: true, value: lines.join("\n"), issues };
}

// ---------------------------------------------------------------- leitura

const ITEM = /^(\d+)?(sc|hdc|dc|tr|ch|ss|sk)(?:(\d+)(inc|tog))?$/;
const CODE: Record<string, Extract<Op, { kind: "stitch" }>["code"]> = {
  sc: "SC",
  hdc: "HDC",
  dc: "DC",
  tr: "TR",
  ch: "CH",
  ss: "SL",
};

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "[") depth++;
    if (c === "]") depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x !== "");
}

function items(s: string, issues: Issue[], label: string): Op[] {
  const ops: Op[] = [];
  for (const it of splitTop(s)) {
    const blk = /^(\d+)\*\[(.*)\]$/.exec(it);
    if (blk) {
      ops.push({ kind: "repeat", times: Number(blk[1]), ops: items(blk[2] ?? "", issues, label) });
      continue;
    }
    const m = ITEM.exec(it);
    if (!m) {
      issues.push({
        code: "UNSUPPORTED_CP_FEATURE",
        severity: "warning",
        message: `Volta ${label}: '${it}' fora do subconjunto do CrochetPARADE; ignorado.`,
      });
      continue;
    }
    const count = m[1] === undefined ? 1 : Number(m[1]);
    const word = m[2] as string;
    if (m[4] === "inc") ops.push({ kind: "inc", k: Number(m[3]), count });
    else if (m[4] === "tog") ops.push({ kind: "dec", k: Number(m[3]), count });
    else if (word === "sk") ops.push({ kind: "skip", count });
    else ops.push({ kind: "stitch", code: CODE[word] ?? "SC", count });
  }
  return ops;
}

/** Lê o texto do CrochetPARADE. A linha `ring` marca o anel mágico da volta seguinte. */
export function fromCp(text: string): Result<Pattern> {
  const issues: Issue[] = [];
  const rows: Row[] = [];
  let ring = false;
  let n = 1;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line === "ring") {
      ring = true;
      continue;
    }
    const label = String(n++);
    let ops = items(line, issues, label);
    const row: Row = { label, kind: "round", ops, sourceText: line };
    if (ring) {
      row.start = "magicRing";
      const only = ops.length === 1 ? ops[0] : undefined;
      if (only && only.kind === "inc" && only.count === 1)
        ops = [{ kind: "stitch", code: "SC", count: only.k }];
      row.ops = ops;
      ring = false;
    }
    rows.push(row);
  }
  return { ok: true, value: { dialect: "en-US", rows }, issues };
}

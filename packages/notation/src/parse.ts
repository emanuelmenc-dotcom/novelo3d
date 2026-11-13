// SPDX-License-Identifier: GPL-3.0-or-later
// Analisador tolerante de receitas (docs/07 seção 2): dicionário por dialeto + descida recursiva.
import type { Dialect, Issue, Op, Pattern, Row } from "@novelo/core";
import { FILLER, NUMBER_WORDS, PHRASES, WORDS } from "./dictionary.ts";

export interface ParseOptions {
  /** Dialeto confirmado pelo usuário. Sem ele, o analisador tenta detectar e nunca adivinha dc/tr. */
  dialect?: Dialect;
}

export interface ParseResult {
  pattern: Pattern;
  issues: Issue[];
  /** Dialeto detectado pela heurística (para o usuário confirmar). */
  detected: Dialect | undefined;
}

const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Heurística da seção 1 do doc 07. Sempre confirmada pelo usuário. */
export function detectDialect(text: string): Dialect | undefined {
  const t = norm(text);
  if (/\b(pb|pbx|aum|dim|corr|mpa|pad)\b|\bpb\d|ponto (baixo|alto)|anel magico/.test(t)) return "pt-BR";
  if (/\bsc\b|\bsc\d|\bslst\b|sl st|single crochet/.test(t)) return "en-US";
  if (/\b(htr|dtr|miss)\b|dcinc|dc\d*tog|half treble|double treble/.test(t)) return "en-UK";
  return undefined;
}

function prep(raw: string): string {
  let t = norm(raw);
  // "em/in next dc": o ponto citado é o alvo, não uma instrução.
  t = t.replace(/\b(?:in|into)\s+(?:the\s+)?next\s+[a-z]+/g, " ");
  t = t.replace(/\bno proximo\s+[a-z]+/g, " ");
  t = t.replace(
    /\(\s*(?:nao conta(?: como ponto)?|sem contar|does ?n[o']?t count(?: as a (?:stitch|st))?|do not count)\s*\)/g,
    " @nc ",
  );
  t = t.replace(/\bnao conta\b/g, " @nc ");
  t = t.replace(
    /\b(?:na|in|into)\s+(?:the\s+)?(?:corrente|ch)\s+(?:inicial|first|starting)\b|\b(?:in|into)\s+(?:the\s+)?(?:first|starting|beginning)\s+ch\b/g,
    " @joinch ",
  );
  t = t.replace(/\b(?:na|in|into)\s+(?:a\s+|the\s+)?(?:corrente|ch)\b/g, " @inch ");
  t = t.replace(
    /\b(?:no|in|into)\s+(?:the\s+)?(?:anel magico|magic ring|magic loop|mr|am)\b|\b(?:anel magico|magic ring|magic loop)\b/g,
    " @ring ",
  );
  t = t.replace(
    /\b(?:em cada (?:ponto|pt)|em volta|in each (?:st|stitch)|in every (?:st|stitch)|around)\b/g,
    " @each ",
  );
  t = t.replace(/\b(?:ate o fim|to end|until end)\b/g, " @each ");
  for (const [re, to] of PHRASES) t = t.replace(re, to);
  t = t.replace(/\b[a-z]+\b/g, (w) => {
    const n = NUMBER_WORDS[w];
    return n === undefined ? w : String(n);
  });
  return t;
}

const TOKEN = /\d*[a-z]+\d*[a-z]*\d*|\d+|@[a-z]+|[()[\]*,;×–—-]/g;

const LABEL =
  /^\s*(?:(v|volta|r|rnd|round|c|carr|carreira|row)\.?\s*)?(\d+)(?:\s*(?:-|–|—|a|to)\s*(\d+))?\s*[:.)]\s*/i;
const TOTAL_PAREN = /\s*[([]\s*(\d+)\s*(?:sts?|stitches|pts?|pontos?|pb|sc)?\s*[)\]]\s*\.?\s*$/i;
const TOTAL_DASH = /\s*[-–—=]\s*(\d+)\s*(?:sts?|stitches|pts?|pontos?)?\s*\.?\s*$/i;

interface LineCtx {
  toks: string[];
  i: number;
  dialect: Dialect;
  issues: Issue[];
  row: number;
  label: string;
  start?: "magicRing";
}

function interpret(chunk: string, dialect: Dialect) {
  const m = /^(\d+)?([a-z]+?)(\d+)?(inc|tog|jun)?(\d+)?$/.exec(chunk);
  if (!m) return null;
  const count = m[1] === undefined ? undefined : Number(m[1]);
  const word = m[2] ?? "";
  const d1 = m[3];
  const mod = m[4];
  const d2 = m[5];
  const term = WORDS[dialect][word];
  if (mod) {
    if (!(term && term.k === "stitch" && term.code === "SC")) return null;
    const k = Number(d1 ?? d2 ?? 2);
    return { count, term: (mod === "inc" ? { k: "inc" } : { k: "dec" }) as { k: "inc" | "dec" }, k };
  }
  if (d1 !== undefined || d2 !== undefined) return null;
  if (!term) return null;
  return { count, term, k: 2 };
}

function parseLine(body: string, dialect: Dialect, issues: Issue[], row: number, label: string) {
  const ctx: LineCtx = { toks: prep(body).match(TOKEN) ?? [], i: 0, dialect, issues, row, label };
  const bad = (code: string, message: string) => issues.push({ code, message, severity: "error", row });

  const parseTimes = (): number => {
    const save = ctx.i;
    let j = ctx.i;
    if (ctx.toks[j] === "rep" || ctx.toks[j] === "repeat" || ctx.toks[j] === "repetir") j++;
    const t = ctx.toks[j];
    const next = ctx.toks[j + 1];
    const m1 = t ? /^x(\d+)$/.exec(t) : null;
    if (m1) {
      ctx.i = j + 1;
      return Number(m1[1]);
    }
    const m2 = t ? /^(\d+)x$/.exec(t) : null;
    if (m2) {
      ctx.i = j + 1;
      return Number(m2[1]);
    }
    if ((t === "x" || t === "×") && next && /^\d+$/.test(next)) {
      ctx.i = j + 2;
      return Number(next);
    }
    if (
      t &&
      /^\d+$/.test(t) &&
      (next === "times" || next === "vezes" || next === "vez" || next === "x" || next === "×")
    ) {
      ctx.i = j + 2;
      return Number(t);
    }
    ctx.i = save;
    return 1;
  };

  const pushRepeat = (ops: Op[], inner: Op[], times: number) => {
    if (times === 1) ops.push(...inner);
    else ops.push({ kind: "repeat", times, ops: inner });
  };

  const modifier = (ops: Op[], tok: string) => {
    const last = ops[ops.length - 1];
    if (tok === "@ring") ctx.start = "magicRing";
    else if (tok === "@each" || tok === "@toend") {
      if (last && (last.kind === "stitch" || last.kind === "inc" || last.kind === "skip"))
        last.count = "rest";
    } else if (tok === "@nc") {
      if (last && last.kind === "stitch") last.counted = false;
    } else if (tok === "@inch") {
      if (last && last.kind === "stitch" && last.code === "SL" && typeof last.count === "number") {
        ops[ops.length - 1] = { kind: "slInto", count: last.count };
      }
    } else if (tok === "@joinch") {
      if (last && last.kind === "stitch" && last.code === "SL") ops[ops.length - 1] = { kind: "join" };
      else ops.push({ kind: "join" });
    }
  };

  const parseItem = (ops: Op[]) => {
    let t = ctx.toks[ctx.i];
    if (t === undefined) return;
    if (t.startsWith("@")) {
      modifier(ops, t);
      ctx.i++;
      return;
    }
    let count: number | undefined;
    if (/^\d+$/.test(t)) {
      count = Number(t);
      ctx.i++;
      t = ctx.toks[ctx.i];
      if (t === undefined || /^[()[\]*,;×–—-]$/.test(t) || t.startsWith("@")) {
        bad("UNPARSED_TEXT", `Volta ${label}: número ${count} sem ponto correspondente.`);
        return;
      }
    }
    if (FILLER.has(t)) {
      ctx.i++;
      return;
    }
    ctx.i++;
    const r = interpret(t, dialect);
    if (!r) {
      bad("UNKNOWN_TERM", `Volta ${label}: termo '${t}' não existe no dialeto ${dialect}.`);
      return;
    }
    const n = count ?? r.count;
    const term = r.term;
    if (term.k === "stitch") ops.push({ kind: "stitch", code: term.code, count: n ?? 1 });
    else if (term.k === "inc") ops.push({ kind: "inc", k: r.k, count: n ?? 1 });
    else if (term.k === "dec") ops.push({ kind: "dec", k: r.k, count: n ?? 1 });
    else if (term.k === "ring") ctx.start = "magicRing";
    else if (term.k === "skip") {
      let c = n;
      const nx = ctx.toks[ctx.i];
      if (c === undefined && nx && /^\d+$/.test(nx)) {
        c = Number(nx);
        ctx.i++;
      }
      ops.push({ kind: "skip", count: c ?? 1 });
    }
  };

  const parseOps = (close?: string): Op[] => {
    const ops: Op[] = [];
    while (ctx.i < ctx.toks.length) {
      const t = ctx.toks[ctx.i] as string;
      if (t === close) break;
      if (t === ")" || t === "]") {
        if (close !== undefined) break;
        bad("UNPARSED_TEXT", `Volta ${label}: '${t}' sem abertura.`);
        ctx.i++;
        continue;
      }
      if (t === "," || t === ";") {
        ctx.i++;
        continue;
      }
      if (t === "(" || t === "[") {
        ctx.i++;
        const want = t === "(" ? ")" : "]";
        const inner = parseOps(want);
        if (ctx.toks[ctx.i] === want) ctx.i++;
        else bad("UNPARSED_TEXT", `Volta ${label}: falta fechar '${t}'.`);
        pushRepeat(ops, inner, parseTimes());
        continue;
      }
      if (t === "*") {
        ctx.i++;
        const inner = parseOps("*");
        if (ctx.toks[ctx.i] === "*") ctx.i++;
        pushRepeat(ops, inner, parseTimes());
        continue;
      }
      parseItem(ops);
    }
    return ops;
  };

  const ops = parseOps();
  return { ops, start: ctx.start };
}

export function parsePattern(text: string, options: ParseOptions = {}): ParseResult {
  const detected = detectDialect(text);
  const issues: Issue[] = [];
  let dialect = options.dialect ?? detected;
  if (!dialect) {
    if (/\b(dc|tr)\b/i.test(text)) {
      issues.push({
        code: "AMBIGUOUS_DIALECT",
        severity: "error",
        message: "'dc' e 'tr' significam pontos diferentes em US e UK. Escolha o dialeto da receita.",
      });
    }
    dialect = "en-US";
  }

  const rows: Row[] = [];
  let nextNumber = 1;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("//")) continue;
    const lm = LABEL.exec(line);
    let label = String(nextNumber);
    let repeat = 1;
    let kind: Row["kind"] = "round";
    if (lm) {
      line = line.slice(lm[0].length);
      const a = Number(lm[2]);
      const b = lm[3] === undefined ? a : Number(lm[3]);
      repeat = Math.max(1, b - a + 1);
      label = repeat > 1 ? `${a}–${b}` : String(a);
      nextNumber = b + 1;
      if (lm[1] && /^(c|carr|carreira|row)$/i.test(lm[1])) kind = "row";
    } else {
      nextNumber += 1;
    }
    let declared: number | undefined;
    const tm = TOTAL_PAREN.exec(line) ?? TOTAL_DASH.exec(line);
    if (tm) {
      declared = Number(tm[1]);
      line = line.slice(0, tm.index);
    }
    const instruction = line.trim();
    const { ops, start } = parseLine(instruction, dialect, issues, rows.length, label);
    const row: Row = { label, kind, ops, sourceText: instruction };
    if (start) row.start = start;
    if (repeat > 1) row.repeatRows = repeat;
    if (declared !== undefined) row.declaredCount = declared;
    rows.push(row);
  }
  return { pattern: { dialect, rows }, issues, detected };
}

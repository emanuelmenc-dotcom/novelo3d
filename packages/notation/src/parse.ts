// SPDX-License-Identifier: GPL-3.0-or-later
// Analisador tolerante de receitas (docs/07 seção 2): dicionário por dialeto + descida recursiva.
import { type Dialect, expandPattern, type Issue, type Op, type Pattern, type Row } from "@novelo/core";
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
  // XVA por último: linhas "R3: 8 (X, V)" só com letras do XVA, números e parênteses
  const xvaLine =
    /^\s*r\d+(?:\s*[-–]\s*r?\d+)?\s*:\s*(?:[\d\s(),]|xv|xw|xa|mr(?:\[\d+\])?|ch|sl|[xvwatfek])+\s*$/;
  // e só conta a linha que tem pelo menos um termo exclusivo do XVA (letras, MR[N] ou R0): números, "ch" e "sl" não bastam,
  // senão uma receita UK "R2: 6 dc in 2nd ch" seria lida como XVA e o "dc" viraria US sem aviso
  const xvaOnly = /(?<![a-z])(?:xv|xw|xa|[xvwatfek])(?![a-z])|\bmr\[|^\s*r0\s*:/;
  if (t.split(/\r?\n/).some((l) => xvaLine.test(l) && xvaOnly.test(l))) return "xva";
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

/** Limites contra receita gigante (um erro, não a aba travada): número, pontos por volta e pontos no total. */
export const MAX_NUMBER = 99_999;
export const MAX_ROW_STITCHES = 20_000;
export const MAX_TOTAL_STITCHES = 50_000;

/** Pontos que uma lista de operações produz, no pior caso ("rest" conta como 0: depende da volta anterior). */
function sizeOf(ops: Op[]): number {
  let n = 0;
  for (const o of ops) {
    if (o.kind === "stitch" || o.kind === "skip" || o.kind === "slInto")
      n += typeof o.count === "number" ? o.count : 0;
    else if (o.kind === "inc") n += typeof o.count === "number" ? o.count * o.k : 0;
    else if (o.kind === "dec") n += o.count;
    else if (o.kind === "repeat") n += o.times * sizeOf(o.ops);
  }
  return n;
}

const TOKEN = /\d*[a-z]+\d*[a-z]*\d*|\d+|@[a-z]+|[()[\]*,;×–—-]/g;

const LABEL =
  /^\s*(?:(v|volta|r|rnd|round|c|carr|carreira|row)\.?\s*)?(\d+)(?:\s*(?:-|–|—|a|to)\s*(?:(?:v|volta|r|rnd|round|c|carr|carreira|row)\.?\s*)?(\d+))?\s*[:.)]\s*/i;
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
  return { count, term, k: term.k === "inc" || term.k === "dec" ? (term.n ?? 2) : 2 };
}

function parseLine(body: string, dialect: Dialect, issues: Issue[], row: number, label: string) {
  const bad = (code: string, message: string) => issues.push({ code, message, severity: "error", row });
  const found = prep(body).match(TOKEN) ?? [];
  if (found.some((t) => /\d{6,}/.test(t))) {
    bad("NUMBER_TOO_LARGE", `Volta ${label}: número maior que ${MAX_NUMBER}.`);
    return { ops: [] as Op[], start: undefined };
  }
  const ctx: LineCtx = { toks: found, i: 0, dialect, issues, row, label };

  const parseTimes = (): number => {
    const save = ctx.i;
    let j = ctx.i;
    if (ctx.toks[j] === "rep" || ctx.toks[j] === "repeat" || ctx.toks[j] === "repetir") j++;
    const t = ctx.toks[j];
    const next = ctx.toks[j + 1];
    // em XVA a letra "x" é o ponto baixo, não um sinal de vezes: "(X, V) 3X" é um grupo e 3 pb ("×" continua valendo)
    const xTimes = dialect !== "xva";
    const m1 = t && xTimes ? /^x(\d+)$/.exec(t) : null;
    if (m1) {
      ctx.i = j + 1;
      return Number(m1[1]);
    }
    const m2 = t && xTimes ? /^(\d+)x$/.exec(t) : null;
    if (m2) {
      ctx.i = j + 1;
      return Number(m2[1]);
    }
    if ((t === "×" || (xTimes && t === "x")) && next && /^\d+$/.test(next)) {
      ctx.i = j + 2;
      return Number(next);
    }
    if (
      t &&
      /^\d+$/.test(t) &&
      (next === "times" || next === "vezes" || next === "vez" || next === "×" || (xTimes && next === "x"))
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
    // em XVA "a" (diminuição) e "e" (pad) são pontos, não as palavras de ligação
    if (FILLER.has(t) && !(dialect === "xva" && (t === "a" || t === "e"))) {
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
      // repetição com o número na frente: "6 (3x, v)" (antes era sempre erro)
      const after = ctx.toks[ctx.i + 1];
      if (/^\d+$/.test(t) && (after === "(" || after === "[")) {
        const times = Number(t);
        ctx.i += 2;
        const want = after === "(" ? ")" : "]";
        const inner = parseOps(want);
        if (ctx.toks[ctx.i] === want) ctx.i++;
        else bad("UNPARSED_TEXT", `Volta ${label}: falta fechar '${after}'.`);
        pushRepeat(ops, inner, times);
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
  if (sizeOf(ops) > MAX_ROW_STITCHES) {
    bad("ROW_TOO_LARGE", `Volta ${label}: mais de ${MAX_ROW_STITCHES} pontos numa volta.`);
    return { ops: [] as Op[], start: ctx.start };
  }
  return { ops, start: ctx.start };
}

export function parsePattern(text: string, options: ParseOptions = {}): ParseResult {
  const detected = detectDialect(text);
  const issues: Issue[] = [];
  let dialect = options.dialect ?? detected;
  // XVA detectado sozinho herda os termos de en-US: dc e tr continuam ambíguos (escolher XVA na mão vale como decisão)
  if (!options.dialect && detected === "xva" && /\b(dc|tr)\b/i.test(text)) {
    issues.push({
      code: "AMBIGUOUS_DIALECT",
      severity: "error",
      message: "'dc' e 'tr' significam pontos diferentes em US e UK. Escolha o dialeto da receita.",
    });
  }
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
  let pendingRing: { n: number | undefined; at: number } | undefined;
  let total = 0;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    const mark = /^#\s*marco\b[\s:]*(.*)$/i.exec(line);
    if (mark) {
      const prev = rows[rows.length - 1];
      if (prev) prev.milestone = (mark[1] ?? "").trim() || "Marco";
      continue;
    }
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
      if (a > MAX_NUMBER || b > MAX_NUMBER || repeat > 1000) {
        issues.push({
          code: "NUMBER_TOO_LARGE",
          message: `Volta ${a}–${b}: faixa grande demais (máximo 1000 voltas, números até ${MAX_NUMBER}).`,
          severity: "error",
          row: rows.length,
        });
        repeat = 1;
      }
      label = repeat > 1 ? `${a}–${b}` : String(a);
      nextNumber = b + 1;
      if (lm[1] && /^(c|carr|carreira|row)$/i.test(lm[1])) kind = "row";
    } else {
      nextNumber += 1;
    }
    // XVA: "R0: MR" ou "R0: MR[N]" é só o anel mágico; vira o começo da linha seguinte (sem linha vazia)
    const ring =
      dialect === "xva" && label === "0" ? /^mr\s*(?:\[\s*(\d+)\s*\])?\s*$/i.exec(line.trim()) : null;
    if (ring) {
      pendingRing = { n: ring[1] === undefined ? undefined : Number(ring[1]), at: rows.length };
      nextNumber = 1;
      continue;
    }
    let declared: number | undefined;
    const tm = TOTAL_PAREN.exec(line) ?? TOTAL_DASH.exec(line);
    if (tm) {
      declared = Number(tm[1]);
      line = line.slice(0, tm.index);
    }
    const instruction = line.trim();
    const parsed = parseLine(instruction, dialect, issues, rows.length, label);
    const start = parsed.start;
    let ops = parsed.ops;
    const size = sizeOf(ops) * repeat;
    total += size;
    if (total > MAX_TOTAL_STITCHES) {
      issues.push({
        code: "PATTERN_TOO_LARGE",
        message: `A receita passa de ${MAX_TOTAL_STITCHES} pontos; a volta ${label} foi ignorada.`,
        severity: "error",
        row: rows.length,
      });
      ops = [];
      total -= size; // a volta ignorada não conta: as seguintes continuam sujeitas ao mesmo teto
    }
    const row: Row = { label, kind, ops, sourceText: instruction };
    if (start) row.start = start;
    else if (pendingRing && pendingRing.at === rows.length) row.start = "magicRing";
    if (repeat > 1) row.repeatRows = repeat;
    if (declared !== undefined) row.declaredCount = declared;
    rows.push(row);
  }
  // XVA sem "R0: MR": a primeira volta nasce de um anel mágico, a não ser que comece por corrente
  const first = rows[0];
  if (dialect === "xva" && first && !first.start) {
    const op0 = first.ops[0];
    if (!(op0 && op0.kind === "stitch" && op0.code === "CH")) first.start = "magicRing";
  }
  const pattern: Pattern = { dialect, rows };
  if (pendingRing?.n !== undefined && rows[pendingRing.at]) {
    const produced = expandPattern(pattern)[pendingRing.at]?.produced;
    if (produced !== undefined && produced !== pendingRing.n)
      issues.push({
        code: "RING_COUNT_MISMATCH",
        severity: "warning",
        message: `MR[${pendingRing.n}] não bate com os ${produced} pontos da primeira volta.`,
        row: pendingRing.at,
      });
  }
  return { pattern, issues, detected };
}

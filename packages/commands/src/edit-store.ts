// SPDX-License-Identifier: GPL-3.0-or-later
// Edição por ponto do projeto aberto (docs/15, D-36): uids permanentes, seleção, fio e tensão por ponto, histórico.
// Mesmo padrão de paint-store e settings: o estado vive na camada de comandos (D-21); o studio só persiste e exibe.
import {
  assignUidsByRounds,
  buildGraph,
  combine,
  type Dialect,
  type Mask,
  type PaintRegion,
  type Pattern,
  PointStore,
  paintedYarns,
  type StitchGraph,
  signatures,
  thicknessRatio,
  type UidState,
  type Yarn,
} from "@novelo/core";
import { type LayoutResult, layoutGraph } from "@novelo/layout";
import { parsePattern } from "@novelo/notation";
import { clearRedoExcept, fireProjectReset, nextTick, registerRedoClear } from "./history-tick.ts";
import { paintSnapshot } from "./paint-store.ts";

export const TENSION_MIN = -1;
export const TENSION_MAX = 1;
/** Tamanho relativo do ponto: tensão -1 (frouxo) = 1,4x maior; +1 (firme) = 1,4x menor. */
export const sizeOfTension = (t: number): number => 1.4 ** -t;

// ------------------------------------------------------------------ estado editável e histórico

interface Snap {
  /** Instante do passo no relógio comum (maior = mais recente). */
  t?: number;
  yarn: Map<number, number>;
  tension: Map<number, number>;
  defaultTension: number;
}

interface EditState extends Snap {
  selection: Set<number>;
  undo: Snap[];
  redo: Snap[];
  /** Muda a cada edição de tensão (invalida o layout em cache). */
  tver: number;
  /** Muda a cada edição de fio/tensão (não na seleção): invalida cálculos que dependem das propriedades. */
  pver: number;
  version: number;
}

const HISTORY_MAX = 100;

const fresh = (): EditState => ({
  yarn: new Map(),
  tension: new Map(),
  defaultTension: 0,
  selection: new Set(),
  undo: [],
  redo: [],
  tver: 0,
  pver: 0,
  version: 0,
});

let pverTick = 0;
let st: EditState = fresh();
/** Uids guardados no disco, esperando a primeira receita para serem realinhados. */
type Pending = { text: string; dialect?: Dialect; uids: number[]; next: number } | null;
type LayoutCache = { key: string; geo: string; result: LayoutResult } | null;
let pending: Pending = null;

export interface EditView {
  version: number;
  /** Versão das propriedades dos pontos (fio e tensão). */
  pver: number;
  selected: number;
  defaultTension: number;
  canUndo: boolean;
  canRedo: boolean;
  yarnOverrides: number;
  tensionOverrides: number;
}

const view = (): EditView => ({
  version: st.version,
  pver: st.pver,
  selected: st.selection.size,
  defaultTension: st.defaultTension,
  canUndo: st.undo.length > 0,
  canRedo: st.redo.length > 0,
  yarnOverrides: st.yarn.size,
  tensionOverrides: st.tension.size,
});

let current: EditView = view();
const listeners = new Set<(v: EditView) => void>();
export const editSnapshot = (): EditView => current;
export function subscribeEdit(fn: (v: EditView) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(): EditView {
  st.version++;
  current = view();
  for (const fn of listeners) fn(current);
  return current;
}

const snap = (): Snap => ({
  t: nextTick(),
  yarn: new Map(st.yarn),
  tension: new Map(st.tension),
  defaultTension: st.defaultTension,
});
function restore(s: Snap): void {
  st.yarn = new Map(s.yarn);
  st.tension = new Map(s.tension);
  st.defaultTension = s.defaultTension;
  st.tver++;
  st.pver = ++pverTick;
}

registerRedoClear("edit", () => {
  st.redo = [];
});

/** Dentro de um traço (begin...end) só a primeira edição cria passo no histórico. */
let grouping = false;
let groupPushed = false;
export function beginGroup(): void {
  grouping = true;
  groupPushed = false;
}
export function endGroup(): void {
  grouping = false;
  groupPushed = false;
}

/** Instante do passo mais recente que dá para desfazer / refazer (0 = nenhum). */
export const undoTick = (): number => st.undo[st.undo.length - 1]?.t ?? 0;
export const redoTick = (): number => st.redo[st.redo.length - 1]?.t ?? 0;

/** Executa uma edição como um único passo do histórico. */
function edit(fn: () => void): EditView {
  if (!(grouping && groupPushed)) {
    st.undo.push(snap());
    if (st.undo.length > HISTORY_MAX) st.undo.shift();
    st.redo = [];
    clearRedoExcept("edit");
    groupPushed = grouping;
  }
  fn();
  st.pver = ++pverTick;
  return emit();
}

export function undo(): EditView {
  endGroup();
  const s = st.undo.pop();
  if (!s) throw new Error("nada para desfazer");
  st.redo.push(snap());
  restore(s);
  return emit();
}
export function redo(): EditView {
  endGroup();
  const s = st.redo.pop();
  if (!s) throw new Error("nada para refazer");
  st.undo.push(snap());
  restore(s);
  return emit();
}

// ------------------------------------------------------------------ motor da receita atual

export interface Engine {
  key: string;
  pattern: Pattern;
  graph: StitchGraph;
  store: PointStore;
  uid: UidState;
  /** Receita utilizável (tem voltas e nenhum erro de leitura). */
  ok: boolean;
}

/** Uids da receita CONFIRMADA (base de todo realinhamento); textos digitados no meio do caminho não a alteram. */
let uidState: UidState | null = null;
let committedKey: string | null = null;
/** Estados de uids por texto já visto (os 20 mais recentes): voltar a um texto anterior devolve os mesmos uids. */
let hist = new Map<string, UidState>();
let last: Engine | null = null;
let layoutCache: LayoutCache = null;

function parse(text: string, dialect?: Dialect): { pattern: Pattern; graph: StitchGraph; ok: boolean } {
  const r = parsePattern(text, dialect ? { dialect } : {});
  // receita utilizável: tem voltas e nenhum erro de leitura (digitação pela metade não é confirmada)
  const ok = r.pattern.rows.length > 0 && !r.issues.some((i) => i.severity === "error");
  return { pattern: r.pattern, graph: buildGraph(r.pattern), ok };
}

const HIST_MAX = 20;

function remember(key: string, u: UidState): void {
  hist.delete(key);
  hist.set(key, u);
  if (hist.size > HIST_MAX) hist.delete(hist.keys().next().value as string);
}

/** Torna o motor a receita confirmada: os próximos realinhamentos partem dele. */
function confirm(e: Engine): void {
  uidState = e.uid;
  committedKey = e.key;
  remember(e.key, e.uid);
}

/**
 * Armazém de pontos da receita. Os uids são realinhados contra a receita CONFIRMADA (por voltas e depois por pontos),
 * sem alterá-la: digitar uma receita aos poucos não perde a identidade dos pontos. Com `commit` (ou na primeira
 * montagem da peça) o resultado vira a receita confirmada.
 */
export function engineFor(text: string, dialect?: Dialect, commit = false): Engine {
  const key = `${dialect ?? "auto"}|${text}`;
  if (last && last.key === key) {
    if (commit && committedKey !== key && last.ok) confirm(last);
    return last;
  }
  const { pattern, graph, ok } = parse(text, dialect);
  const store = PointStore.fromGraph(graph);
  if (!uidState && pending) {
    try {
      const old = parse(pending.text, pending.dialect);
      const oldStore = PointStore.fromGraph(old.graph);
      const oldSigs = signatures(oldStore);
      if (oldSigs.length === pending.uids.length) {
        // com as chaves de volta, o casamento em dois níveis também vale depois de recarregar
        uidState = {
          sigs: oldSigs,
          uids: Int32Array.from(pending.uids),
          next: pending.next,
          group: oldStore.group,
          keys: oldStore.roundKey,
          lkeys: oldStore.roundLabelKey,
        };
        committedKey = `${pending.dialect ?? "auto"}|${pending.text}`;
      }
    } catch {
      // gravação inválida: recomeça a numeração
    }
  }
  const first = uidState === null;
  pending = null;
  let state =
    hist.get(key) ??
    assignUidsByRounds(uidState, signatures(store), store.group, store.roundKey, store.roundLabelKey);
  // o contador de uids nunca regride (voltar a um texto antigo não pode reutilizar números já dados)
  if (uidState && state.next < uidState.next) state = { ...state, next: uidState.next };
  store.uid.set(state.uids);
  last = { key, pattern, graph, store, uid: state, ok };
  layoutCache = null;
  if ((commit || first) && ok) confirm(last);
  return last;
}

/** Confirma a receita (texto estável): realinha contra a anterior e passa a valer como base. Ignora receita com erro. */
export function commitText(text: string, dialect?: Dialect): boolean {
  const eng = engineFor(text, dialect, true);
  return eng.ok;
}

/** Avisa os assinantes (interface, gravação) com o estado da peça ATIVA, depois de mexer em outra peça. */
export const notifyEdit = (): EditView => emit();

// ------------------------------------------------------------------ colunas, posições, regiões

/** Preenche as colunas `yarn` (regras de pintura + fio por ponto) e `tension` (padrão + por ponto). */
export function refreshColumns(eng: Engine, rules: PaintRegion[]): void {
  const s = eng.store;
  const yarnCol = s.col("yarn") as Uint8Array;
  const ids = paintedYarns(eng.graph, rules);
  for (let i = 0; i < s.n; i++) yarnCol[i] = Math.max(0, (ids[i] ?? "A").charCodeAt(0) - 65);
  for (const [uid, v] of st.yarn) {
    const i = s.indexOf(uid);
    if (i >= 0) yarnCol[i] = v;
  }
  const t = s.col("tension") as Float32Array;
  t.fill(st.defaultTension);
  for (const [uid, v] of st.tension) {
    const i = s.indexOf(uid);
    if (i >= 0) t[i] = v;
  }
}

/** Tamanho relativo de cada ponto: tensão (já preenchida) x espessura do fio do ponto em relação ao fio A. */
export function sizesOf(eng: Engine): Float32Array {
  const t = eng.store.col("tension");
  const yarnCol = eng.store.col("yarn");
  const yarns = paintSnapshot().yarns;
  const ref = yarns.find((y) => y.id === "A");
  const ratio = new Float32Array(256).fill(1);
  for (const y of yarns) ratio[y.id.charCodeAt(0) - 65] = thicknessRatio(y, ref);
  const out = new Float32Array(eng.store.n);
  for (let i = 0; i < out.length; i++) {
    out[i] = sizeOfTension(t[i] as number) * (ratio[yarnCol[i] as number] as number);
  }
  return out;
}

/** Posições 3D (cache por receita e versão da tensão), copiadas para `store.pos` relativas ao primeiro ponto. */
/** Layout com os tamanhos da tensão, guardado até a receita, a tensão ou as opções mudarem. */
export function layoutCached(
  eng: Engine,
  rules: PaintRegion[],
  opts: { seed?: number; epochs?: number } = {},
): LayoutResult {
  refreshColumns(eng, rules);
  const sizes = sizesOf(eng);
  let sum = 0;
  for (let i = 0; i < sizes.length; i++) sum += (sizes[i] as number) * ((i % 97) + 1);
  const geo = `${eng.key}|${opts.seed ?? ""}|${opts.epochs ?? ""}`;
  const key = `${geo}|${sum.toFixed(5)}`;
  if (!layoutCache || layoutCache.key !== key) {
    // só os tamanhos mudaram (tensão, fio): parte do layout anterior em vez de recomeçar do zero
    const warm =
      layoutCache && layoutCache.geo === geo && opts.seed === undefined && opts.epochs === undefined;
    layoutCache = {
      key,
      geo,
      result: layoutGraph(eng.graph, {
        ...opts,
        sizes,
        ...(warm && layoutCache ? { initial: layoutCache.result.positions } : {}),
      }),
    };
  }
  return layoutCache.result;
}

/** Chave do último layout calculado (receita, tamanhos, opções): igual = mesma geometria. */
export const lastLayoutKey = (): string => layoutCache?.key ?? "";

export function ensurePositions(eng: Engine, rules: PaintRegion[]): void {
  const p = layoutCached(eng, rules).positions;
  const pos = eng.store.pos;
  const ox = p[0] ?? 0;
  const oy = p[1] ?? 0;
  const oz = p[2] ?? 0;
  for (let i = 0; i < eng.store.n; i++) {
    pos[i * 3] = (p[i * 3] as number) - ox;
    pos[i * 3 + 1] = (p[i * 3 + 1] as number) - oy;
    pos[i * 3 + 2] = (p[i * 3 + 2] as number) - oz;
  }
}

/** Pontos pintados individualmente viram regiões de pontos (as consumidoras de pintura não mudam). */
export function overrideRegions(eng: Engine, yarns: Yarn[]): PaintRegion[] {
  if (st.yarn.size === 0) return [];
  const known = new Set(yarns.map((y) => y.id));
  const s = eng.store;
  const byYarn = new Map<string, { row: number; index: number }[]>();
  for (const [uid, v] of st.yarn) {
    const i = s.indexOf(uid);
    if (i < 0 || (s.group[i] as number) <= 0) continue;
    const id = String.fromCharCode(65 + v);
    if (!known.has(id)) continue;
    const list = byYarn.get(id) ?? [];
    list.push({ row: s.group[i] as number, index: s.gIndex[i] as number });
    byYarn.set(id, list);
  }
  return [...byYarn].map(([yarn, at]) => ({ kind: "stitches", yarn, at }));
}

// ------------------------------------------------------------------ seleção

export function selectionMask(eng: Engine): Mask {
  const m = new Uint8Array(eng.store.n);
  for (const uid of st.selection) {
    const i = eng.store.indexOf(uid);
    if (i >= 0) m[i] = 1;
  }
  return m;
}

export function setSelection(
  eng: Engine,
  mask: Mask,
  op: "replace" | "add" | "remove" | "intersect",
): EditView {
  const next = combine(selectionMask(eng), mask, op);
  const out = new Set<number>();
  for (let i = 0; i < next.length; i++) if (next[i]) out.add(eng.store.uid[i] as number);
  st.selection = out;
  return emit();
}

export function clearSelection(): EditView {
  st.selection = new Set();
  return emit();
}

export const selectedUids = (): number[] => [...st.selection].sort((a, b) => a - b);

// ------------------------------------------------------------------ escrita de propriedades

/** Grava `value` (índice do fio ou tensão) nos pontos da máscara; `null` remove a sobreposição (volta à regra). */
export function writeProp(eng: Engine, prop: "yarn" | "tension", mask: Mask, value: number | null): EditView {
  if (prop === "tension" && value !== null && (value < TENSION_MIN || value > TENSION_MAX)) {
    throw new Error(`tensão deve estar entre ${TENSION_MIN} e ${TENSION_MAX}`);
  }
  return edit(() => {
    const m = prop === "yarn" ? st.yarn : st.tension;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const uid = eng.store.uid[i] as number;
      if (value === null || (prop === "tension" && value === st.defaultTension)) m.delete(uid);
      else m.set(uid, value);
    }
    if (prop === "tension") st.tver++;
  });
}

/** Grava um valor diferente por ponto (listras, gradiente, suavização). Valores < 0 em `yarn` são ignorados. */
export function writeEach(
  eng: Engine,
  prop: "yarn" | "tension",
  values: ArrayLike<number>,
  mask: Mask,
): EditView {
  return edit(() => {
    const m = prop === "yarn" ? st.yarn : st.tension;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const v = values[i] as number;
      const uid = eng.store.uid[i] as number;
      if (prop === "yarn") {
        if (v >= 0) m.set(uid, v);
      } else if (Math.abs(v - st.defaultTension) < 1e-6) m.delete(uid);
      else m.set(uid, Math.max(TENSION_MIN, Math.min(TENSION_MAX, v)));
    }
    if (prop === "tension") st.tver++;
  });
}

export function setDefaultTension(value: number): EditView {
  if (!(value >= TENSION_MIN && value <= TENSION_MAX)) {
    throw new Error(`tensão deve estar entre ${TENSION_MIN} e ${TENSION_MAX}`);
  }
  return edit(() => {
    st.defaultTension = value;
    st.tver++;
  });
}

export function clearEdits(): EditView {
  return edit(() => {
    st.yarn = new Map();
    st.tension = new Map();
    st.tver++;
  });
}

// ------------------------------------------------------------------ peças: um conjunto de edições por peça

interface Slot {
  st: EditState;
  pending: Pending;
  uidState: UidState | null;
  committedKey: string | null;
  hist: Map<string, UidState>;
  last: Engine | null;
  layoutCache: LayoutCache;
}
const slots = new Map<string, Slot>();
let slotId = "p1";
export const currentSlot = (): string => slotId;

const capture = (): Slot => ({ st, pending, uidState, committedKey, hist, last, layoutCache });
function restoreSlot(x: Slot): void {
  st = x.st;
  pending = x.pending;
  uidState = x.uidState;
  committedKey = x.committedKey;
  hist = x.hist;
  last = x.last;
  layoutCache = x.layoutCache;
}
const blank = (): Slot => ({
  st: fresh(),
  pending: null,
  uidState: null,
  committedKey: null,
  hist: new Map(),
  last: null,
  layoutCache: null,
});

/** Passa a editar o conjunto de edições (uids, fio, tensão, seleção, histórico) da peça `id`. */
export function switchSlot(id: string, quiet = false): void {
  if (id === slotId) return;
  if (!quiet) endGroup();
  slots.set(slotId, capture());
  restoreSlot(slots.get(id) ?? blank());
  slotId = id;
  if (quiet) return;
  st.pver = ++pverTick;
  emit();
}

export function removeSlot(id: string): void {
  if (id === slotId) throw new Error("não dá para remover a peça ativa");
  slots.delete(id);
}

// ------------------------------------------------------------------ persistência (localStorage no studio)

export interface EditJson {
  yarn: [number, number][];
  tension: [number, number][];
  defaultTension: number;
  selection: number[];
  uids?: { text: string; dialect?: Dialect; uids: number[]; next: number };
}

function jsonOf(x: Slot): EditJson {
  const out: EditJson = {
    yarn: [...x.st.yarn],
    tension: [...x.st.tension],
    defaultTension: x.st.defaultTension,
    selection: [...x.st.selection],
  };
  if (x.committedKey && x.uidState) {
    const cut = x.committedKey.indexOf("|");
    const d = x.committedKey.slice(0, cut);
    out.uids = {
      text: x.committedKey.slice(cut + 1),
      ...(d === "auto" ? {} : { dialect: d as Dialect }),
      uids: Array.from(x.uidState.uids),
      next: x.uidState.next,
    };
  } else if (x.pending) {
    // peça ainda não aberta nesta sessão: mantém os uids gravados (senão recomeçariam em 1 na próxima carga)
    out.uids = {
      text: x.pending.text,
      ...(x.pending.dialect ? { dialect: x.pending.dialect } : {}),
      uids: [...x.pending.uids],
      next: x.pending.next,
    };
  }
  return out;
}

const pairs = (v: unknown): [number, number][] =>
  Array.isArray(v)
    ? v.filter(
        (e): e is [number, number] =>
          Array.isArray(e) && Number.isInteger(e[0]) && typeof e[1] === "number" && Number.isFinite(e[1]),
      )
    : [];

function slotFromJson(raw: unknown): Slot {
  const o = (raw ?? {}) as Partial<EditJson>;
  const x = blank();
  x.st.yarn = new Map(pairs(o.yarn));
  x.st.tension = new Map(pairs(o.tension));
  const dt = o.defaultTension;
  x.st.defaultTension = typeof dt === "number" && dt >= TENSION_MIN && dt <= TENSION_MAX ? dt : 0;
  if (Array.isArray(o.selection)) x.st.selection = new Set(o.selection.filter((u) => Number.isInteger(u)));
  const u = o.uids;
  x.pending =
    u && typeof u.text === "string" && Array.isArray(u.uids) && Number.isInteger(u.next)
      ? { text: u.text, ...(u.dialect ? { dialect: u.dialect } : {}), uids: u.uids, next: u.next }
      : null;
  x.st.pver = ++pverTick;
  return x;
}

/** Edições da peça ativa. */
export const exportEdit = (): EditJson => jsonOf(capture());

/** Carrega o que foi gravado na peça ativa; valores inválidos são ignorados, sem lançar erro. */
export function loadEdit(raw: unknown): EditView {
  fireProjectReset(); // a linha do tempo só vale para o estado que ela mesma construiu
  const prev = st;
  restoreSlot(slotFromJson(raw));
  st.version = prev.version;
  return emit();
}

/** Edições de todas as peças, por id. */
export function exportEditAll(keep?: string[]): Record<string, EditJson> {
  const out: Record<string, EditJson> = {};
  for (const [id, x] of slots) if (id !== slotId && (!keep || keep.includes(id))) out[id] = jsonOf(x);
  out[slotId] = jsonOf(capture());
  return out;
}

/** Carrega as edições de todas as peças; o formato antigo (uma peça só) vira a peça `p1`. */
export function loadEditAll(raw: unknown, active: string): EditView {
  fireProjectReset();
  const map: Record<string, unknown> =
    raw && typeof raw === "object" && Array.isArray((raw as { yarn?: unknown }).yarn)
      ? { p1: raw }
      : ((raw ?? {}) as Record<string, unknown>);
  slots.clear();
  for (const [id, v] of Object.entries(map)) slots.set(id, slotFromJson(v));
  slotId = active;
  const prev = st;
  restoreSlot(slots.get(active) ?? blank());
  st.version = prev.version;
  return emit();
}

/** Copia as edições da peça `from` para a peça `to` (nova), com os mesmos uids. */
export function cloneSlot(from: string, to: string): void {
  const src = from === slotId ? capture() : slots.get(from);
  slots.set(to, slotFromJson(src ? jsonOf(src) : {}));
}

/** Troca o fio (índice na paleta) `from` por `to` nas edições por ponto de todas as peças. */
export function remapYarnOverrides(from: number, to: number): number {
  let n = 0;
  const fix = (m: Map<number, number>) => {
    for (const [uid, v] of m) {
      if (v === from) {
        m.set(uid, to);
        n++;
      }
    }
  };
  for (const [id, x] of slots) if (id !== slotId) fix(x.st.yarn);
  if ([...st.yarn.values()].includes(from)) edit(() => fix(st.yarn));
  return n;
}

/** Novo projeto: descarta as edições de todas as peças e volta à peça p1. */
export function resetSlots(): void {
  slots.clear();
  slotId = "p1";
  const prev = st;
  restoreSlot(blank());
  st.version = prev.version;
  st.pver = ++pverTick;
  emit();
}

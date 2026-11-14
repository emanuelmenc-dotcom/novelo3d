// SPDX-License-Identifier: GPL-3.0-or-later
// Linha do tempo de features (G6, D-68): um diário dos comandos que mudam o projeto, gravado no `dispatch`, que sabe se
// reexecutar a partir de um projeto-base. Cada feature guarda os parâmetros com as entradas "ambientes" já resolvidas
// (seleção em uids, peça ativa, texto da receita), para que reexecutar nunca dependa do que está selecionado agora.
// Só `dispatch` de nível mais alto grava: chamadas de um comando para outro e a própria reexecução não gravam.
import { exportEditAll, selectedUids, setSlotSelection } from "./edit-store.ts";
import { onProjectReset } from "./history-tick.ts";
import { paintSnapshot } from "./paint-store.ts";
import {
  getIdCounters,
  partsSnapshot,
  rootOf,
  setActive,
  setAssemblyHidden,
  setDraft,
  setIdCounters,
  setPartsHidden,
  useRoot,
  withPart,
} from "./parts-store.ts";
import { exportProject, importProject } from "./project-commands.ts";
import { getSettings } from "./settings.ts";
import { setTreeSelected, treeSelected } from "./tree-store.ts";
import { exportTutorial, loadTutorial } from "./tutorial-store.ts";

type Params = Record<string, unknown>;

export type Class = "feature" | "session" | "query" | "project";

const group = (kind: Class, keys: string[]): [string, Class][] => keys.map((k) => [k, kind]);

/** Todos os comandos: o que muda o projeto (feature), o que é só da sessão, o que só consulta. Um teste confere. */
export const CLASS: Record<string, Class> = Object.fromEntries([
  ...group("feature", [
    "parts.add",
    "parts.fromShape",
    "parts.instance",
    "parts.mirror",
    "parts.copy",
    "parts.detach",
    "parts.remove",
    "parts.set",
    "parts.commitText",
    "assembly.add",
    "assembly.set",
    "assembly.remove",
    "assembly.close",
    "assembly.undoClose",
    "seam.add",
    "seam.set",
    "seam.remove",
    "paint.clear",
    "paint.remove",
    "paint.reset",
    "paint.rows",
    "paint.stitches",
    "yarns.add",
    "yarns.set",
    "points.set",
    "tool.brush",
    "tool.bucket",
    "tool.stripes",
    "tool.gradient",
    "tool.smooth",
    "edit.clear",
    "edit.setDefaultTension",
    "materials.replace",
  ]),
  ...group("session", [
    "assembly.setVisible",
    "parts.setActive",
    "parts.setText",
    "parts.setVisible",
    "parts.isolate",
    "parts.showAll",
    "seam.draft",
    "seam.clearDraft",
    "selection.select",
    "selection.clear",
    "selection.invert",
    "selection.screen",
    "tree.select",
    "tutorial.first",
    "tutorial.goto",
    "tutorial.last",
    "tutorial.next",
    "tutorial.nextMilestone",
    "tutorial.nextRound",
    "tutorial.prev",
    "tutorial.prevMilestone",
    "tutorial.prevRound",
    "tutorial.reading",
    "tutorial.reset",
    "tutorial.slide",
    "history.begin",
    "history.end",
    "history.undo",
    "history.redo",
    "settings.set",
    "settings.reset",
    "stitchEditor.apply",
    "stitchEditor.reset",
    "stitchEditor.selectBase",
    "stitchEditor.setHand",
    "stitchEditor.undo",
    "render.complete",
    "render.fail",
    "render.pause",
    "render.pngServed",
    "render.progress",
    "render.reset",
    "render.resume",
    "render.savePng",
    "render.set",
    "render.stale",
    "render.start",
    "render.stop",
    "workspace.applyPreset",
    "workspace.collapse",
    "workspace.deleteCustom",
    "workspace.hidePanel",
    "workspace.movePanel",
    "workspace.renameCustom",
    "workspace.reset",
    "workspace.resize",
    "workspace.saveCustom",
    "workspace.setActive",
    "workspace.setPanelVisible",
    "workspace.setSizes",
    "workspace.showPanel",
  ]),
  ["project.import", "project"],
  ["timeline.verify", "session"],
  ["timeline.load", "session"],
  ["timeline.save", "query"],
  ...group("session", ["timeline.rollTo", "timeline.suppress", "timeline.edit", "timeline.remove"]),
  ...group("query", [
    "assembly.contents",
    "assembly.layout",
    "chart.render",
    "edit.get",
    "graph.layout",
    "history.get",
    "interop.parseDot",
    "materials.list",
    "math.round",
    "forward.revolve",
    "measure.bounds",
    "measure.distance",
    "notation.splitLines",
    "paint.report",
    "parts.get",
    "pattern.fromCp",
    "pattern.parse",
    "pattern.print",
    "pattern.toCp",
    "pattern.verify",
    "points.get",
    "points.info",
    "project.export",
    "render.info",
    "render.status",
    "seam.list",
    "seam.validate",
    "selection.chain",
    "selection.get",
    "settings.get",
    "stitchEditor.state",
    "stitches.list",
    "system.list",
    "system.ping",
    "tool.eyedropper",
    "timeline.get",
    "tree.get",
    "tutorial.get",
    "tutorial.script",
    "workspace.get",
    "yarns.get",
    "yarns.library",
    "yarns.preview",
  ]),
]);

/** Features que agem na peça ativa (seu armazém de pontos e sua paleta): gravam a peça; a reexecução a ativa. */
const SLOT = new Set([
  "points.set",
  "tool.brush",
  "tool.bucket",
  "tool.stripes",
  "tool.gradient",
  "tool.smooth",
  "edit.clear",
  "edit.setDefaultTension",
  "paint.clear",
  "paint.remove",
  "paint.reset",
  "paint.rows",
  "paint.stitches",
  "yarns.add",
  "yarns.set",
]);
/** Comandos que, sem `target`, agem na seleção atual. */
const SELECTION_TARGET = new Set(["points.set", "tool.stripes", "tool.gradient", "tool.smooth"]);

export interface Feature {
  id: number;
  method: string;
  params: Params;
  /** Contadores de ids (peças, costuras, montagens) antes da feature: reexecutar gera os mesmos ids. */
  counters: { part: number; seam: number; asm: number };
  suppressed: boolean;
  status: "ok" | "failed";
  error?: string;
  /** Para "group": as features de um traço de pincel, executadas em sequência. */
  items?: Feature[];
}

export interface TimelineView {
  features: Feature[];
  /** Quantas features da lista estão em vigor: o marcador. */
  marker: number;
  /** Há projeto-base guardado (a linha do tempo começou). */
  hasBase: boolean;
}

let features: Feature[] = [];
let marker = 0;
let base: ReturnType<typeof exportProject> | null = null;
let nextId = 1;
let replaying = false;
let depth = 0;
let openGroup: Feature[] | null = null;
/** Último texto gravado por peça: `parts.commitText` com o mesmo texto não vira feature. */
const lastText = new Map<string, string>();
const lastRaw = new Map<string, { text: string; dialect?: string }>();
const setCommitted = (id: string, t: { text: string; dialect?: string }): void => {
  lastRaw.set(id, { text: t.text, ...(t.dialect ? { dialect: t.dialect } : {}) });
  lastText.set(id, textKey(t));
};
const clearCommitted = (): void => {
  lastText.clear();
  lastRaw.clear();
};
/** Maiores contadores de ids já usados: ids novos nunca repetem um que uma feature de depois do marcador vai gerar. */
let highWater = { part: 0, seam: 0, asm: 0 };
let rawRun: ((m: string, p: Params) => unknown) | null = null;
/** Quem monta o mapa de comandos entrega aqui o executor sem gravação. */
export const setRawRunner = (fn: (m: string, p: Params) => unknown): void => {
  rawRun = fn;
};
const maxC = (a: typeof highWater, b: typeof highWater): typeof highWater => ({
  part: Math.max(a.part, b.part),
  seam: Math.max(a.seam, b.seam),
  asm: Math.max(a.asm, b.asm),
});
let version = 0;
const listeners = new Set<() => void>();

const emit = (): void => {
  version++;
  for (const fn of listeners) fn();
};
export const timelineVersion = (): number => version;
export function subscribeTimeline(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const timelineView = (): TimelineView => ({ features, marker, hasBase: base !== null });
export const isReplaying = (): boolean => replaying;

/** O texto de cada receita no momento: só um texto diferente dele vira feature de receita. */
const textKey = (p: { text: string; dialect?: string }): string => `${p.dialect ?? ""}|${p.text}`;
function seedTexts(): void {
  const all = exportEditAll(partsSnapshot().parts.map((q) => q.id)) as Record<
    string,
    { uids?: { text?: string } }
  >;
  for (const p of partsSnapshot().parts) {
    const committed = all[p.id]?.uids?.text;
    // sem motor de pontos ainda não houve confirmação: a primeira vira feature
    if (p.kind === "own" && !lastText.has(p.id) && typeof committed === "string")
      setCommitted(p.id, { text: committed, ...(p.dialect ? { dialect: p.dialect } : {}) });
  }
}

const FILE_VERSION = 1;

/** A linha do tempo para o arquivo do projeto e o navegador: base, features em ordem e o marcador. */
export function exportTimeline(): unknown {
  if (base === null || features.length === 0) return null;
  return { version: FILE_VERSION, base, features: clone(features), marker, nextId };
}

/** Carrega a do arquivo; inválida ou ausente (arquivo antigo) vira linha do tempo vazia, sem erro. */
export function importTimeline(raw: unknown): void {
  if (replaying) return;
  resetTimeline(true);
  const o = raw as {
    version?: unknown;
    base?: unknown;
    features?: unknown;
    marker?: unknown;
    nextId?: unknown;
  } | null;
  if (!o || typeof o !== "object" || o.version !== FILE_VERSION) return;
  const b = o.base as { app?: unknown; parts?: unknown } | null;
  if (!b || typeof b !== "object" || b.app !== "novelo3d" || !Array.isArray(o.features)) return;
  const fs = (o.features as Feature[]).filter(
    (f) =>
      f &&
      typeof f.id === "number" &&
      typeof f.method === "string" &&
      f.params &&
      typeof f.params === "object",
  );
  if (fs.length !== o.features.length) return;
  base = clone(b) as ReturnType<typeof exportProject>;
  features = fs.map((f) => ({ ...f, status: "ok" as const, error: undefined }));
  marker = Number.isInteger(o.marker) ? Math.max(0, Math.min(fs.length, o.marker as number)) : fs.length;
  nextId = Math.max(typeof o.nextId === "number" ? o.nextId : 1, ...fs.map((f) => f.id + 1));
  for (const f of fs) highWater = maxC(highWater, f.counters);
  seedTexts();
  emit();
}

/** Novo projeto ou projeto importado: a linha do tempo recomeça vazia. */
export function resetTimeline(force = false): void {
  // dentro de um comando (paint.reset chama resetPaint) a linha do tempo continua; fora dele, quem carrega estado a zera
  if (replaying || (depth > 0 && !force)) return;
  features = [];
  marker = 0;
  base = null;
  openGroup = null;
  clearCommitted();
  seedTexts();
  highWater = getIdCounters();
  emit();
}
onProjectReset(() => resetTimeline());

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Uids em ordem viram faixas [de, até]: uma seleção grande ocupa poucas linhas no arquivo. */
const toRanges = (uids: number[]): [number, number][] => {
  const out: [number, number][] = [];
  for (const u of uids) {
    const last = out[out.length - 1];
    if (last && u === last[1] + 1) last[1] = u;
    else out.push([u, u]);
  }
  return out;
};
const fromRanges = (ranges: [number, number][]): number[] =>
  ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));

/** Parâmetros de reexecução: o que era "o que está selecionado agora" vira explícito. Null = não grava (nada mudou). */
function normalize(method: string, params: Params): Params | null {
  const out: Params = { ...params };
  const active = partsSnapshot().active;
  if (SLOT.has(method)) {
    const root = rootOf(active);
    out.part = root.id;
    // o texto da peça é lido na hora de reexecutar; um texto avulso (por exemplo vindo do MCP) fica como foi passado
    if (params.text === root.text) {
      out.text = undefined;
      out.dialect = undefined;
    }
    if (SELECTION_TARGET.has(method) && (out.target === undefined || out.target === "selection")) {
      out.target = { kind: "uidRanges", ranges: toRanges(selectedUids()) };
    }
  } else if (method === "parts.commitText") {
    const id = typeof params.id === "string" ? params.id : active;
    const root = rootOf(id);
    if (root.id !== id) return null;
    if (lastText.get(id) === textKey(root)) return null; // o foco saiu sem o texto nem o dialeto mudar
    const was = lastRaw.get(id) ?? base?.parts.parts.find((q) => q.id === id);
    return {
      id,
      text: root.text,
      ...(root.dialect ? { dialect: root.dialect } : {}),
      ...(was ? { prev: { text: was.text, ...(was.dialect ? { dialect: was.dialect } : {}) } } : {}),
    };
  } else if (method === "assembly.add" && params.fromSelection === true) {
    const sel = treeSelected();
    const s = partsSnapshot();
    out.fromSelection = undefined;
    if (out.parts === undefined && sel && s.parts.some((q) => q.id === sel)) out.parts = [sel];
    if (out.parent === undefined && sel && s.assemblies.some((q) => q.id === sel)) out.parent = sel;
  } else if (method === "parts.fromShape") {
    // a amostra vem das configurações: fixa a de agora, para mudar a configuração depois não mudar a peça
    const y = getSettings().yarns;
    const g = (params.gauge ?? {}) as { w?: number; h?: number };
    const w = typeof g.w === "number" ? g.w : y.stitchWidthMm;
    out.gauge = { w, h: typeof g.h === "number" ? g.h : (y.rowHeightMm ?? w) };
    out.beginner = params.beginner === true;
  } else if (method === "seam.add") {
    const d = partsSnapshot().draft;
    if (out.a === undefined && d.a) out.a = d.a;
    if (out.b === undefined && d.b) out.b = d.b;
    // o tipo de costura padrão vem das configurações: fixa o de agora, para mudar a configuração depois não mudar a costura
    if (out.type === undefined) out.type = getSettings().yarns.seam.type;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return clone(out);
}

/** Garante o motor de pontos da peça com o texto anterior: o app sempre o tem (o 3D calcula), e os uids dependem dele. */
function ensureEngine(id: string, prev: unknown, run: (m: string, p: Params) => unknown): void {
  const t = prev as { text?: string; dialect?: string } | undefined;
  if (!t || typeof t.text !== "string" || t.text.trim() === "") return;
  try {
    withPart(id, () => run("points.info", { text: t.text, ...(t.dialect ? { dialect: t.dialect } : {}) }));
  } catch {
    // receita anterior inválida: sem motor
  }
}

/** Roda uma feature com as entradas resolvidas (sem gravar). */
function runFeature(f: Feature, run: (m: string, p: Params) => unknown): void {
  if (f.items) {
    for (const it of f.items) runFeature(it, run);
    return;
  }
  setIdCounters(f.counters);
  const { part, ...rest } = f.params as Params & { part?: string };
  const tg = rest.target as { kind?: string; ranges?: [number, number][] } | undefined;
  if (tg?.kind === "uidRanges" && Array.isArray(tg.ranges))
    rest.target = { kind: "uids", uids: fromRanges(tg.ranges) };
  if (f.method === "parts.commitText") {
    ensureEngine(String(rest.id), rest.prev, run);
    run("parts.setText", {
      id: rest.id,
      text: rest.text,
      ...(rest.dialect ? { dialect: rest.dialect } : {}),
    });
    run("parts.commitText", { id: rest.id });
  } else if (typeof part === "string") {
    // escreve no armazém da peça: ativa-o e fica nele (a peça ativa da sessão volta no fim da reexecução)
    useRoot(part, true);
    const root = rootOf(part);
    run(f.method, {
      text: root.text,
      ...(root.dialect ? { dialect: root.dialect } : {}),
      ...rest, // um texto avulso gravado na feature vale mais que o da peça
    });
  } else run(f.method, rest);
}

/** Comandos de valor absoluto: dois seguidos no mesmo alvo se juntam (o último vale). */
const COALESCE = new Set(["parts.set", "assembly.set", "seam.set", "edit.setDefaultTension", "yarns.set"]);

const isRecipe = (f: Feature | undefined): boolean =>
  !!f &&
  (f.method === "parts.commitText" ||
    (f.method === "group" && !!f.items?.every((i) => i.method === "parts.commitText")));
const recipePart = (f: Feature): unknown => (f.items ? f.items[0]?.params.id : f.params.id);

function push(f: Feature): void {
  // confirmações seguidas da mesma peça formam uma feature só, que reexecuta cada uma em ordem (juntar A→B→C em A→C
  // mudaria os uids permanentes dos pontos); digitar uma receita não enche a faixa de ícones
  const prev = features[marker - 1];
  if (
    f.method === "parts.commitText" &&
    isRecipe(prev) &&
    prev &&
    !prev.suppressed &&
    recipePart(prev) === f.params.id
  ) {
    const items = prev.items ? [...prev.items, f] : [prev, f];
    features[marker - 1] = { ...prev, method: "group", params: {}, items, counters: prev.counters };
    emit();
    return;
  }
  // ajustes de valor absoluto (digitar um nome, arrastar um controle) seguidos no mesmo alvo viram um só: vale o último
  if (prev && !prev.suppressed && !prev.items && COALESCE.has(f.method) && prev.method === f.method) {
    const same =
      f.method === "edit.setDefaultTension" ||
      f.method === "yarns.set" ||
      (f.params.id !== undefined && prev.params.id === f.params.id);
    if (same && prev.params.part === f.params.part) {
      features[marker - 1] = { ...prev, params: { ...prev.params, ...f.params } };
      emit();
      return;
    }
  }
  f.id = nextId++;
  // uma feature nova entra no marcador: as de depois dele continuam (D-68)
  features = [...features.slice(0, marker), f, ...features.slice(marker)];
  marker++;
  emit();
}

export type FeatureKind = "recipe" | "part" | "assembly" | "seam" | "paint" | "stitches" | "material";
/** Grupo da feature (o ícone da faixa). */
export function kindOf(f: Feature): FeatureKind {
  const m = f.items?.[0]?.method ?? f.method;
  if (m === "parts.commitText") return "recipe";
  if (m.startsWith("parts.")) return "part";
  if (m.startsWith("assembly.")) return "assembly";
  if (m.startsWith("seam.")) return "seam";
  if (m.startsWith("paint.") || m.startsWith("yarns.")) return "paint";
  if (m === "materials.replace") return "material";
  return "stitches";
}

/** Operações da linha do tempo: cada uma muda a lista e reexecuta a partir do projeto-base. */
function need(id: number): number {
  const i = features.findIndex((f) => f.id === id);
  if (i < 0) throw new Error(`feature ${id} não existe`);
  return i;
}
export function rollTo(i: number, run: (m: string, p: Params) => unknown): void {
  if (!Number.isInteger(i) || i < 0 || i > features.length)
    throw new Error(`o marcador deve estar entre 0 e ${features.length}`);
  replay(run, i);
}
export function setSuppressed(
  id: number,
  on: boolean | undefined,
  run: (m: string, p: Params) => unknown,
): void {
  const i = need(id);
  const f = features[i] as Feature;
  features = features.map((x, k) => (k === i ? { ...x, suppressed: on ?? !f.suppressed } : x));
  replay(run);
}
/** Troca parâmetros (mescla chaves; `null` apaga a chave) de uma feature simples. */
export function editFeature(id: number, patch: Params, run: (m: string, p: Params) => unknown): void {
  const i = need(id);
  const f = features[i] as Feature;
  if (f.items) throw new Error("um traço de pincel não tem parâmetros para editar");
  const params: Params = { ...f.params };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete params[k];
    else params[k] = v;
  }
  features = features.map((x, k) => (k === i ? { ...x, params: clone(params) } : x));
  replay(run);
}
export function removeFeature(id: number, run: (m: string, p: Params) => unknown): void {
  const i = need(id);
  features = features.filter((_, k) => k !== i);
  marker = i < marker ? marker - 1 : marker;
  replay(run);
}
/** Nome legível dos comandos que não têm parâmetros que mudem o texto. Um teste confere que toda feature tem nome. */
const PLAIN: Record<string, string> = {
  "parts.add": "nova peça",
  "parts.fromShape": "peça por forma",
  "parts.mirror": "peça espelhada",
  "parts.copy": "cópia da peça",
  "parts.detach": "soltar a peça da original",
  "parts.remove": "remover a peça",
  "assembly.remove": "remover a montagem",
  "assembly.close": "fechar a montagem",
  "assembly.undoClose": "desfazer o fechamento da montagem",
  "seam.add": "nova costura",
  "seam.set": "ajustar a costura",
  "seam.remove": "remover a costura",
  "paint.clear": "limpar a pintura",
  "paint.remove": "tirar a pintura",
  "paint.reset": "zerar a pintura",
  "paint.stitches": "pintar pontos",
  "yarns.add": "novo fio",
  "yarns.set": "paleta de fios",
  "tool.brush": "pincel",
  "tool.bucket": "balde",
  "tool.stripes": "listras",
  "tool.gradient": "gradiente",
  "tool.smooth": "suavizar tensão",
  "edit.clear": "limpar as edições",
  "edit.setDefaultTension": "tensão padrão",
  "materials.replace": "trocar o fio em todo o projeto",
};
/** Texto curto de uma feature para a faixa e para o MCP. */
export function labelOf(f: Feature): string {
  if (f.items) {
    if (f.items.every((i) => i.method === "parts.commitText"))
      return `receita de ${String(f.items[0]?.params.id)} (${f.items.length} edições)`;
    return `traço de pincel (${f.items.length} pontos)`;
  }
  const p = f.params;
  switch (f.method) {
    case "parts.commitText":
      return `receita de ${String(p.id)}`;
    case "paint.rows":
      return `pintar voltas ${String(p.from)} a ${String(p.to ?? p.from)} com o fio ${String(p.yarn)}`;
    case "points.set":
      return `${p.prop === "tension" ? "tensão" : "fio"} dos pontos escolhidos`;
    case "parts.set":
      return `ajustar a peça ${String(p.id)}`;
    case "parts.instance":
      return `instância da peça ${String(p.id)}`;
    case "assembly.add":
      return "nova montagem";
    case "assembly.set":
      return `ajustar a montagem ${String(p.id)}`;
    default:
      return PLAIN[f.method] ?? f.method;
  }
}

/** Peças cujo texto foi digitado e ainda não confirmado: viram feature de receita antes de qualquer operação da linha do tempo. */
export const pendingTexts = (): string[] => {
  if (base === null) return [];
  const b = base.parts.parts;
  return partsSnapshot()
    .parts.filter((p) => {
      if (p.kind !== "own") return false;
      const was =
        lastText.get(p.id) ??
        (b.find((q) => q.id === p.id) ? textKey(b.find((q) => q.id === p.id) as typeof p) : undefined);
      return was !== undefined && was !== textKey(p);
    })
    .map((p) => p.id);
};

/** Confirma os textos pendentes como features de receita (as operações da linha do tempo chamam isto antes de agir). */
export function commitPending(run: (m: string, p: Params) => unknown): void {
  for (const id of pendingTexts()) {
    const norm = normalize("parts.commitText", { id });
    const counters = getIdCounters();
    if (norm) ensureEngine(id, norm.prev, run);
    const out = run("parts.commitText", { id }) as { committed?: boolean } | null;
    if (norm && out?.committed !== false) {
      setCommitted(String(norm.id), rootOf(String(norm.id)));
      push({ id: 0, method: "parts.commitText", params: norm, counters, suppressed: false, status: "ok" });
    }
  }
}

/**
 * Projeto-base: o projeto agora, mas com a receita de cada peça no texto que o motor de pontos já confirmou (digitado e
 * não confirmado é pendente, vira feature de receita e não faz parte da base).
 */
function captureBase(): void {
  const b = clone(exportProject()) as ReturnType<typeof exportProject> & {
    edit: Record<string, { uids?: { text?: string } } | undefined>;
  };
  for (const p of b.parts.parts) {
    const committed = b.edit[p.id]?.uids?.text;
    if (p.kind === "own" && typeof committed === "string" && committed !== p.text) p.text = committed;
  }
  base = b;
  clearCommitted();
  seedTexts();
}

function closeGroup(): void {
  const items = openGroup;
  openGroup = null;
  if (items && items.length > 0) {
    push({
      id: 0,
      method: "group",
      params: {},
      counters: (items[0] as Feature).counters,
      suppressed: false,
      status: "ok",
      items,
    });
  }
}

const MAX_FEATURES = 200;
const KEEP_FEATURES = 150;

/**
 * O arquivo da linha do tempo não cresce sem fim: passado o limite, as features mais antigas viram parte da base
 * (o que era desfazível lá atrás deixa de ser). Só dobra o que está antes do marcador.
 */
function compactIfNeeded(): void {
  if (!rawRun || features.length <= MAX_FEATURES) return;
  const k = Math.min(features.length - KEEP_FEATURES, marker);
  if (k <= 0) return;
  const keepMarker = marker;
  const run = rawRun;
  replay(run, k);
  captureBase();
  features = features.slice(k);
  marker = keepMarker - k;
  replay(run);
}

/** `dispatch` de nível mais alto: executa e, se for feature e der certo, grava. */
export function recordAndRun(method: string, params: Params, run: (p: Params) => unknown): unknown {
  const cls = CLASS[method];
  if (!replaying && depth === 0) {
    if (method === "history.begin") {
      closeGroup(); // um traço que ficou aberto não engole os seguintes
      openGroup = [];
    }
    if (method === "history.end") closeGroup();
    // só o pincel e as ferramentas de pontos entram num traço; qualquer outra feature fecha o grupo
    if (cls === "feature" && !method.startsWith("tool.")) closeGroup();
  }
  if (replaying || depth > 0 || cls !== "feature") {
    depth++;
    try {
      return run(params);
    } finally {
      depth--;
      // abrir outro projeto recomeça a linha do tempo
      // (importProject recomeça a linha do tempo com a do arquivo, se houver)
    }
  }
  // receita digitada e ainda não confirmada entra antes: o que se grava a seguir pode depender dela
  if (base === null) captureBase();
  if (rawRun && method !== "parts.commitText") commitPending(rawRun);
  const norm = normalize(method, params);
  // ids novos saem de um contador que está acima de tudo que já foi usado, mesmo com o marcador voltado
  setIdCounters(maxC(getIdCounters(), highWater));
  const counters = getIdCounters();
  if (method === "parts.commitText" && norm && rawRun) ensureEngine(String(norm.id), norm.prev, rawRun);
  depth++;
  let result: unknown;
  try {
    result = run(params);
  } finally {
    depth--;
  }
  // receita que o motor recusou (meio digitada) volta `committed: false` sem lançar: não vira feature
  const refused =
    method === "parts.commitText" && (result as { committed?: boolean } | null)?.committed === false;
  if (norm !== null && !refused) {
    if (method === "parts.commitText") setCommitted(String(norm.id), rootOf(String(norm.id)));
    seedTexts(); // peça nova: o texto dela já é o ponto de partida
    highWater = maxC(highWater, getIdCounters());
    // fio novo: grava a paleta que ele deixou (o padrão e a cor livre vieram das configurações de agora)
    const f: Feature =
      method === "yarns.add"
        ? {
            id: 0,
            method: "yarns.set",
            params: { part: norm.part, yarns: clone(paintSnapshot().yarns) },
            counters,
            suppressed: false,
            status: "ok",
          }
        : { id: 0, method, params: norm, counters, suppressed: false, status: "ok" };
    if (openGroup) openGroup.push(f);
    else {
      push(f);
      compactIfNeeded();
    }
  }
  return result;
}

/**
 * Reexecuta: carrega o projeto-base e roda as features ligadas até o marcador. Quem lança fica `failed` e as outras
 * seguem. O que é da sessão (peça ativa, o que está escondido, seleção da árvore) volta no fim.
 */
export function replay(run: (m: string, p: Params) => unknown, upTo = marker): void {
  if (base === null) return;
  const s = partsSnapshot();
  const hiddenParts = Object.fromEntries(s.parts.map((p) => [p.id, !!p.hidden]));
  const hiddenAsm = Object.fromEntries(s.assemblies.map((a) => [a.id, !!a.hidden]));
  const active = s.active;
  const sel = treeSelected();
  const keepEdit = exportEditAll(s.parts.map((p) => p.id));
  const keepTutorial = exportTutorial();
  const keepDraft = s.draft;
  replaying = true;
  try {
    importProject(clone(base), false);
    clearCommitted();
    seedTexts();
    features = features.map((f, i) => {
      if (i >= upTo || f.suppressed) return { ...f, status: "ok" as const, error: undefined };
      try {
        runFeature(f, run);
        if (f.method === "parts.commitText") setCommitted(String(f.params.id), rootOf(String(f.params.id)));
        return { ...f, status: "ok" as const, error: undefined };
      } catch (e) {
        return { ...f, status: "failed" as const, error: (e as Error).message };
      }
    });
    marker = Math.min(upTo, features.length);
    const now = partsSnapshot();
    const ph: Record<string, boolean> = {};
    for (const p of now.parts) if (p.id in hiddenParts) ph[p.id] = hiddenParts[p.id] as boolean;
    setPartsHidden(ph);
    for (const a of now.assemblies)
      if (a.id in hiddenAsm) setAssemblyHidden(a.id, hiddenAsm[a.id] as boolean);
    // a peça ativa que deixou de existir passa a ser a primeira: o armazém de pontos e a paleta acompanham
    setActive(now.parts.some((p) => p.id === active) ? active : (now.parts[0] as { id: string }).id);
    for (const side of ["a", "b"] as const) {
      const d = keepDraft[side];
      if (d && now.parts.some((p) => p.id === d.part)) setDraft(side, d);
    }
    setTreeSelected(sel);
    // a seleção de pontos e o ponto do tutorial são da sessão: voltam como estavam
    for (const [id, old] of Object.entries(keepEdit as Record<string, { selection?: number[] }>))
      setSlotSelection(id, old.selection ?? []);
    loadTutorial(keepTutorial);
  } finally {
    replaying = false;
  }
  emit();
}

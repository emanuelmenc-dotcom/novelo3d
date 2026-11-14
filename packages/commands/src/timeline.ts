// SPDX-License-Identifier: GPL-3.0-or-later
// Linha do tempo de features (G6, D-68): um diário dos comandos que mudam o projeto, gravado no `dispatch`, que sabe se
// reexecutar a partir de um projeto-base. Cada feature guarda os parâmetros com as entradas "ambientes" já resolvidas
// (seleção em uids, peça ativa, texto da receita), para que reexecutar nunca dependa do que está selecionado agora.
// Só `dispatch` de nível mais alto grava: chamadas de um comando para outro e a própria reexecução não gravam.
import { selectedUids } from "./edit-store.ts";
import { onProjectReset } from "./history-tick.ts";
import {
  getIdCounters,
  partsSnapshot,
  rootOf,
  setActive,
  setAssemblyHidden,
  setIdCounters,
  setPartsHidden,
  useRoot,
} from "./parts-store.ts";
import { exportProject, importProject } from "./project-commands.ts";
import { setTreeSelected, treeSelected } from "./tree-store.ts";

type Params = Record<string, unknown>;

export type Class = "feature" | "session" | "query" | "project";

const group = (kind: Class, keys: string[]): [string, Class][] => keys.map((k) => [k, kind]);

/** Todos os comandos: o que muda o projeto (feature), o que é só da sessão, o que só consulta. Um teste confere. */
export const CLASS: Record<string, Class> = Object.fromEntries([
  ...group("feature", [
    "parts.add",
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
function seedTexts(): void {
  for (const p of partsSnapshot().parts)
    if (p.kind === "own" && !lastText.has(p.id)) lastText.set(p.id, p.text);
}

/** Novo projeto ou projeto importado: a linha do tempo recomeça vazia. */
export function resetTimeline(force = false): void {
  // dentro de um comando (paint.reset chama resetPaint) a linha do tempo continua; fora dele, quem carrega estado a zera
  if (replaying || (depth > 0 && !force)) return;
  features = [];
  marker = 0;
  base = null;
  openGroup = null;
  lastText.clear();
  seedTexts();
  emit();
}
onProjectReset(() => resetTimeline());

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

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
      out.target = { kind: "uids", uids: selectedUids() };
    }
  } else if (method === "parts.commitText") {
    const id = typeof params.id === "string" ? params.id : active;
    const root = rootOf(id);
    if (root.id !== id) return null;
    if (lastText.get(id) === root.text) return null; // o foco saiu sem o texto mudar
    return { id, text: root.text, ...(root.dialect ? { dialect: root.dialect } : {}) };
  } else if (method === "assembly.add" && params.fromSelection === true) {
    const sel = treeSelected();
    const s = partsSnapshot();
    out.fromSelection = undefined;
    if (out.parts === undefined && sel && s.parts.some((q) => q.id === sel)) out.parts = [sel];
    if (out.parent === undefined && sel && s.assemblies.some((q) => q.id === sel)) out.parent = sel;
  } else if (method === "seam.add") {
    const d = partsSnapshot().draft;
    if (out.a === undefined && d.a) out.a = d.a;
    if (out.b === undefined && d.b) out.b = d.b;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return clone(out);
}

/** Roda uma feature com as entradas resolvidas (sem gravar). */
function runFeature(f: Feature, run: (m: string, p: Params) => unknown): void {
  if (f.items) {
    for (const it of f.items) runFeature(it, run);
    return;
  }
  setIdCounters(f.counters);
  const { part, ...rest } = f.params as Params & { part?: string };
  if (f.method === "parts.commitText") {
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

function push(f: Feature): void {
  const prev = features[marker - 1];
  // receitas seguidas da mesma peça viram uma feature só
  if (
    f.method === "parts.commitText" &&
    prev?.method === "parts.commitText" &&
    prev.params.id === f.params.id &&
    !prev.suppressed &&
    marker === features.length
  ) {
    features[marker - 1] = { ...prev, params: f.params };
    emit();
    return;
  }
  f.id = nextId++;
  // uma feature nova entra no marcador: as de depois dele continuam (D-68)
  features = [...features.slice(0, marker), f, ...features.slice(marker)];
  marker++;
  emit();
}

/** Peças cujo texto foi digitado e ainda não confirmado: viram feature de receita antes de qualquer operação da linha do tempo. */
export const pendingTexts = (): string[] =>
  base === null
    ? []
    : partsSnapshot()
        .parts.filter((p) => p.kind === "own" && lastText.has(p.id) && lastText.get(p.id) !== p.text)
        .map((p) => p.id);

/** `dispatch` de nível mais alto: executa e, se for feature e der certo, grava. */
export function recordAndRun(method: string, params: Params, run: (p: Params) => unknown): unknown {
  const cls = CLASS[method];
  if (!replaying && depth === 0) {
    if (method === "history.begin") openGroup = [];
    if (method === "history.end" && openGroup) {
      const items = openGroup;
      openGroup = null;
      if (items.length > 0) {
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
  }
  if (replaying || depth > 0 || cls !== "feature") {
    depth++;
    try {
      return run(params);
    } finally {
      depth--;
      // abrir outro projeto recomeça a linha do tempo
      if (cls === "project" && !replaying && depth === 0) resetTimeline(true);
    }
  }
  const norm = normalize(method, params);
  if (base === null) {
    base = clone(exportProject());
    seedTexts();
  }
  const counters = getIdCounters();
  depth++;
  let result: unknown;
  try {
    result = run(params);
  } finally {
    depth--;
  }
  if (norm !== null) {
    if (method === "parts.commitText") lastText.set(String(norm.id), String(norm.text));
    seedTexts(); // peça nova: o texto dela já é o ponto de partida
    const f: Feature = { id: 0, method, params: norm, counters, suppressed: false, status: "ok" };
    if (openGroup) openGroup.push(f);
    else push(f);
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
  replaying = true;
  try {
    importProject(clone(base), false);
    lastText.clear();
    seedTexts();
    features = features.map((f, i) => {
      if (i >= upTo || f.suppressed) return { ...f, status: "ok" as const, error: undefined };
      try {
        runFeature(f, run);
        if (f.method === "parts.commitText") lastText.set(String(f.params.id), String(f.params.text));
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
    if (now.parts.some((p) => p.id === active)) setActive(active);
    setTreeSelected(sel);
  } finally {
    replaying = false;
  }
  emit();
}

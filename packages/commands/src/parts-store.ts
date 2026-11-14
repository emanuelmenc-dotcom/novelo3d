// SPDX-License-Identifier: GPL-3.0-or-later
// Peças e montagem (P3.5, D-38): cada peça tem a sua receita, uids, fio/tensão por ponto e pintura. Uma peça pode ser
// original, instância (acompanha a original), espelhada (instância espelhada) ou cópia (peça nova e independente).
// Costuras ligam duas linhas contínuas de pontos, na mesma peça ou entre peças. Estado na camada de comandos (D-21).
import type { Dialect } from "@novelo/core";
import { cloneSlot, currentSlot, resetSlots, switchSlot } from "./edit-store.ts";
import { clearRedoExcept, nextTick, registerRedoClear } from "./history-tick.ts";
import {
  clonePaintSlot,
  paintToken,
  resetPaintSlots,
  restorePaintToken,
  switchPaintSlot,
} from "./paint-store.ts";

export type PartKind = "own" | "instance" | "mirror";
export type MirrorPlane = "x" | "y" | "z";

import { SEAM_TYPES, type SeamType } from "./settings.ts";

export { SEAM_TYPES, type SeamType };
export const SEAM_TYPE_NAMES: Record<SeamType, string> = {
  mattress: "Ponto invisível (colchão)",
  whip: "Chuleio (ponto de arremate)",
  slip: "Ponto baixíssimo",
  sc: "Ponto baixo",
};

export interface Part {
  id: string;
  name: string;
  kind: PartKind;
  /** Receita (só nas peças originais; instâncias leem a da origem). */
  text: string;
  dialect?: Dialect;
  /** Peça de origem (instância e espelhada). */
  source?: string;
  mirror?: MirrorPlane;
  /** Posição e rotação (graus, ordem X-Y-Z) na montagem, em larguras de ponto. */
  pos: [number, number, number];
  rot: [number, number, number];
  /** Troca de fios só nesta instância: fio da origem -> fio daqui. */
  yarnMap?: Record<string, string>;
  /** Escondida na vista 3D (não desenha nem é clicável); continua contando na lista de materiais e nas costuras. */
  hidden?: boolean;
  /** Montagem em que a peça está (ausente = na raiz). */
  assembly?: string;
}

export interface SeamSide {
  part: string;
  /** Pontos (uids da peça de origem) da seleção linear, em ordem. */
  uids: number[];
}

export interface Seam {
  id: string;
  name: string;
  a: SeamSide;
  b: SeamSide;
  /** Percorre o lado B no sentido contrário ao do lado A. */
  reverse: boolean;
  /** Pontos do lado A para pontos do lado B (1:1, 2:1, 1:2...). */
  ratio: [number, number];
  type: SeamType;
}

/** Montagem: agrupa peças (e outras montagens) e move/gira o grupo todo; a posição de cada peça passa a valer dentro dela. */
export interface Assembly {
  id: string;
  name: string;
  pos: [number, number, number];
  rot: [number, number, number];
  /** Montagem que contém esta (ausente = fica na raiz do projeto). */
  parent?: string;
  /** Escondida: tudo o que há dentro some do 3D. */
  hidden?: boolean;
}

export interface PartsState {
  parts: Part[];
  assemblies: Assembly[];
  seams: Seam[];
  /** Peça em edição (a receita, a seleção e as ferramentas valem para ela). */
  active: string;
  draft: { a?: SeamSide; b?: SeamSide };
  version: number;
}

export const EXEMPLO_PADRAO = "";

const first = (text: string, dialect?: Dialect): Part => ({
  id: "p1",
  name: "Peça 1",
  kind: "own",
  text,
  ...(dialect ? { dialect } : {}),
  pos: [0, 0, 0],
  rot: [0, 0, 0],
});

let state: PartsState = {
  parts: [first("")],
  assemblies: [],
  seams: [],
  active: "p1",
  draft: {},
  version: 0,
};
let partNo = 1;
let seamNo = 0;
let asmNo = 0;
const listeners = new Set<(s: PartsState) => void>();

export const partsSnapshot = (): PartsState => state;
export function subscribeParts(fn: (s: PartsState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
// ---- desfazer de peças e costuras (um passo por ação; o fechamento da montagem é um passo só, via transact)
interface PartsStep {
  t: number;
  state: PartsState;
}
const ustack: PartsStep[] = [];
let rstack: PartsStep[] = [];
registerRedoClear("parts", () => {
  rstack = [];
});
let tx = 0;
let txRecorded = false;
export const partsUndoTick = (): number => ustack[ustack.length - 1]?.t ?? 0;
export const partsRedoTick = (): number => rstack[rstack.length - 1]?.t ?? 0;

/** Agrupa várias alterações de peças/costuras num único passo do histórico. */
export function transact<T>(fn: () => T): T {
  if (tx === 0) txRecorded = false;
  tx++;
  try {
    return fn();
  } finally {
    tx--;
  }
}

function publish(next: PartsState): PartsState {
  state = next;
  for (const fn of listeners) fn(state);
  return state;
}

/** `record: false` para o que não é uma edição do projeto (peça ativa, rascunho, texto da receita). */
function commit(next: Omit<PartsState, "version">, record = true): PartsState {
  if (record && !(tx > 0 && txRecorded)) {
    ustack.push({ t: nextTick(), state });
    if (ustack.length > 100) ustack.shift();
    rstack = [];
    clearRedoExcept("parts");
    if (tx > 0) txRecorded = true;
  }
  return publish({ ...next, version: state.version + 1 });
}

function restoreStep(step: PartsStep): void {
  // a receita e o dialeto não são passos do histórico: valem sempre os atuais (senão desfazer um movimento reverteria texto)
  const now = new Map(state.parts.map((p) => [p.id, p]));
  const s: PartsState = {
    ...step.state,
    parts: step.state.parts.map((p) => {
      const cur = now.get(p.id);
      if (!cur) return p;
      // esconder não é passo do histórico: vale sempre o estado atual
      const { hidden: _h, ...base } = p;
      const keep = cur.hidden ? { ...base, hidden: true } : base;
      if (p.kind !== "own" || cur.kind !== "own") return keep;
      const { dialect: _d, ...rest } = keep;
      return { ...rest, text: cur.text, ...(cur.dialect ? { dialect: cur.dialect } : {}) };
    }),
  };
  const active = s.parts.some((p) => p.id === state.active) ? state.active : (s.parts[0] as Part).id;
  // esconder montagem também não é passo do histórico
  const nowAsm = new Map(state.assemblies.map((a) => [a.id, a]));
  s.assemblies = s.assemblies.map((a) => {
    const { hidden: _h, ...rest } = a;
    return nowAsm.get(a.id)?.hidden ? { ...rest, hidden: true } : rest;
  });
  publish({ ...s, active, draft: {}, version: state.version + 1 });
  useRoot(active);
}

export function undoParts(): PartsState {
  const step = ustack.pop();
  if (!step) throw new Error("nada para desfazer");
  rstack.push({ t: nextTick(), state });
  restoreStep(step);
  return state;
}

export function redoParts(): PartsState {
  const step = rstack.pop();
  if (!step) throw new Error("nada para refazer");
  ustack.push({ t: nextTick(), state });
  restoreStep(step);
  return state;
}

export const partById = (id: string, s: PartsState = state): Part => {
  const p = s.parts.find((x) => x.id === id);
  if (!p) throw new Error(`peça '${id}' não existe`);
  return p;
};

/** Peça original que fornece a receita e os pontos (segue instâncias e espelhadas até a origem). */
export function rootOf(id: string, s: PartsState = state): Part {
  let p = partById(id, s);
  for (let i = 0; i < 20 && p.source; i++) p = partById(p.source, s);
  return p;
}

/** Troca a peça cujas edições e pintura as outras partes do app enxergam (sem avisar a interface). */
export function useRoot(id: string, quiet = false): void {
  const root = rootOf(id).id;
  switchSlot(root, quiet);
  switchPaintSlot(root, quiet);
}

/**
 * Executa `fn` com as edições da peça `id` ativas e volta ao conjunto que estava ativo antes (sem avisar a interface).
 * Pode ser aninhada; `fn` tem de ser síncrona (o estado ativo é global; contexto por peça fica para o render assíncrono).
 */
export function withPart<T>(id: string, fn: (root: Part) => T): T {
  const back = currentSlot();
  const token = paintToken();
  const root = rootOf(id);
  useRoot(root.id, true);
  try {
    const out = fn(root);
    if (out instanceof Promise) throw new Error("withPart não aceita função assíncrona");
    return out;
  } finally {
    switchSlot(back, true);
    restorePaintToken(token);
  }
}

const num3 = (v: unknown, what: string): [number, number, number] => {
  if (!Array.isArray(v) || v.length !== 3 || v.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
    throw new Error(`${what} deve ser [x, y, z] com números`);
  }
  return [v[0] as number, v[1] as number, v[2] as number];
};

function nameFor(prefix: string): string {
  const n = state.parts.filter((p) => p.name.startsWith(prefix)).length + 1;
  return `${prefix} ${n}`;
}

export function addPart(input: { name?: string; text?: string; dialect?: Dialect }): PartsState {
  partNo++;
  const id = `p${partNo}`;
  const last = state.parts[state.parts.length - 1] as Part;
  const part: Part = {
    id,
    name: input.name?.trim() || `Peça ${partNo}`,
    kind: "own",
    text: input.text ?? "",
    ...(input.dialect ? { dialect: input.dialect } : {}),
    pos: [last.pos[0] + 14, last.pos[1], last.pos[2]],
    rot: [0, 0, 0],
  };
  return commit({ ...state, parts: [...state.parts, part] });
}

/** Instância (acompanha a original) ou espelhada (instância espelhada no plano `mirror`). */
export function addInstance(
  sourceId: string,
  kind: "instance" | "mirror",
  mirror: MirrorPlane = "x",
): PartsState {
  const root = rootOf(sourceId);
  partNo++;
  const id = `p${partNo}`;
  const last = state.parts[state.parts.length - 1] as Part;
  const part: Part = {
    id,
    name: `${root.name} ${kind === "mirror" ? "(espelhada)" : "(instância)"}`,
    kind,
    text: "",
    source: root.id,
    ...(kind === "mirror" ? { mirror } : {}),
    pos: [last.pos[0] + 14, last.pos[1], last.pos[2]],
    rot: [0, 0, 0],
  };
  return commit({ ...state, parts: [...state.parts, part] });
}

/** Cópia independente: nova peça com a mesma receita, fios, tensão e pintura (e os mesmos uids). */
export function copyPart(id: string): PartsState {
  const src = partById(id);
  const root = rootOf(id);
  partNo++;
  const nid = `p${partNo}`;
  cloneSlot(root.id, nid);
  clonePaintSlot(root.id, nid);
  const copy: Part = {
    id: nid,
    name: `${src.name} (cópia)`,
    kind: "own",
    text: root.text,
    ...(root.dialect ? { dialect: root.dialect } : {}),
    pos: [src.pos[0] + 14, src.pos[1], src.pos[2]],
    rot: [...src.rot],
  };
  return commit({ ...state, parts: [...state.parts, copy] });
}

/** Instância ou espelhada vira peça independente (mantém a posição e, se espelhada, fica espelhada na receita? não: vira cópia comum). */
export function detachPart(id: string): PartsState {
  const p = partById(id);
  if (p.kind === "own") throw new Error(`'${p.name}' já é uma peça original`);
  const root = rootOf(id);
  cloneSlot(root.id, id);
  clonePaintSlot(root.id, id);
  const { source: _s, mirror: _m, yarnMap: _y, ...rest } = p;
  const own: Part = {
    ...rest,
    kind: "own",
    text: root.text,
    ...(root.dialect ? { dialect: root.dialect } : {}),
  };
  return commit({ ...state, parts: state.parts.map((x) => (x.id === id ? own : x)) });
}

export function removePart(id: string): PartsState {
  const p = partById(id);
  if (state.parts.length === 1) throw new Error("o projeto precisa de pelo menos uma peça");
  const dep = state.parts.find((x) => x.source === id);
  if (dep) throw new Error(`'${dep.name}' usa '${p.name}' como origem; remova-a ou torne-a cópia antes`);
  const seam = state.seams.find((s) => s.a.part === id || s.b.part === id);
  if (seam) throw new Error(`a costura '${seam.name}' usa '${p.name}'; remova a costura antes`);
  const parts = state.parts.filter((x) => x.id !== id);
  let active = state.active;
  if (active === id) {
    active = (parts[0] as Part).id;
    useRoot(active);
  }
  // as edições e a pintura da peça ficam guardadas (desfazer a traz de volta); só não são gravadas no disco
  const draft = { ...state.draft };
  if (draft.a?.part === id) draft.a = undefined;
  if (draft.b?.part === id) draft.b = undefined;
  return commit({ ...state, parts, active, draft });
}

/**
 * Mostra ou esconde peças (`hidden[id]`). Não é uma edição do projeto: fica fora do histórico (esconder para olhar outra
 * coisa não pode apagar o "refazer") e desfazer não mexe nela. Vai no arquivo do projeto.
 */
export function setPartsHidden(hidden: Record<string, boolean>): PartsState {
  for (const id of Object.keys(hidden)) partById(id);
  const parts = state.parts.map((p) => {
    if (!(p.id in hidden)) return p;
    const { hidden: _h, ...rest } = p;
    return hidden[p.id] ? { ...rest, hidden: true } : rest;
  });
  return commit({ ...state, parts }, false);
}

export const asmById = (id: string, s: PartsState = state): Assembly => {
  const a = s.assemblies.find((x) => x.id === id);
  if (!a) throw new Error(`montagem '${id}' não existe`);
  return a;
};

/** Montagens do item até a raiz (a mais próxima primeiro). Para se houver um ciclo (arquivo estragado). */
export function assemblyChain(assemblyId: string | undefined, s: PartsState = state): Assembly[] {
  const out: Assembly[] = [];
  let cur = assemblyId;
  while (cur && out.length < 50) {
    const a = s.assemblies.find((x) => x.id === cur);
    if (!a) break;
    out.push(a);
    cur = a.parent;
  }
  return out;
}

const subtree = (id: string): { asm: Set<string>; parts: Set<string> } => {
  const asm = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const a of state.assemblies)
      if (a.parent && asm.has(a.parent) && !asm.has(a.id)) {
        asm.add(a.id);
        grew = true;
      }
  }
  return {
    asm,
    parts: new Set(state.parts.filter((p) => p.assembly && asm.has(p.assembly)).map((p) => p.id)),
  };
};

/** Montagem nova; `parts` já existentes entram nela (vazia se não vier nenhuma). */
export function addAssembly(input: { name?: string; parts?: string[]; parent?: string }): PartsState {
  const members = (input.parts ?? []).map((id) => partById(id).id);
  if (input.parent) asmById(input.parent);
  asmNo++;
  const asm: Assembly = {
    id: `a${asmNo}`,
    name: input.name?.trim() || `Montagem ${asmNo}`,
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    ...(input.parent ? { parent: input.parent } : {}),
  };
  if (asm.name.length > 40) throw new Error("o nome deve ter de 1 a 40 caracteres");
  return commit({
    ...state,
    assemblies: [...state.assemblies, asm],
    parts: state.parts.map((p) => (members.includes(p.id) ? { ...p, assembly: asm.id } : p)),
  });
}

export function patchAssembly(id: string, patch: Record<string, unknown>): PartsState {
  const a = asmById(id);
  const next: Assembly = { ...a };
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string" || patch.name.trim() === "" || patch.name.length > 40)
      throw new Error("o nome deve ter de 1 a 40 caracteres");
    next.name = patch.name.trim();
  }
  if (patch.pos !== undefined) next.pos = num3(patch.pos, "pos");
  if (patch.rot !== undefined) next.rot = num3(patch.rot, "rot");
  if (patch.parent !== undefined) {
    if (patch.parent === null) next.parent = undefined;
    else {
      const pid = asmById(String(patch.parent)).id;
      if (subtree(id).asm.has(pid)) throw new Error("uma montagem não pode ficar dentro dela mesma");
      next.parent = pid;
    }
  }
  return commit({ ...state, assemblies: state.assemblies.map((x) => (x.id === id ? next : x)) });
}

/** Esconde ou mostra uma montagem (e tudo o que há nela). Fora do histórico, como esconder uma peça. */
export function setAssemblyHidden(id: string, hidden: boolean): PartsState {
  asmById(id);
  return commit(
    {
      ...state,
      assemblies: state.assemblies.map((a) => {
        if (a.id !== id) return a;
        const { hidden: _h, ...rest } = a;
        return hidden ? { ...rest, hidden: true } : rest;
      }),
    },
    false,
  );
}

/** O que sairia junto com a montagem: as montagens de dentro, as peças e as costuras delas. */
export function assemblyContents(id: string): { assemblies: string[]; parts: string[]; seams: string[] } {
  asmById(id);
  const { asm, parts } = subtree(id);
  const seams = state.seams.filter((s) => parts.has(s.a.part) || parts.has(s.b.part)).map((s) => s.id);
  return { assemblies: [...asm], parts: [...parts], seams };
}

/** Remove a montagem com tudo o que há dentro (peças, montagens aninhadas e as costuras delas). */
export function removeAssembly(id: string): PartsState {
  const { assemblies, parts, seams } = assemblyContents(id);
  const gone = new Set(parts);
  const left = state.parts.filter((p) => !gone.has(p.id));
  if (left.length === 0) throw new Error("o projeto precisa de pelo menos uma peça");
  const dep = left.find((p) => p.source && gone.has(p.source));
  if (dep)
    throw new Error(`'${dep.name}' usa uma peça desta montagem como origem; mova-a ou torne-a cópia antes`);
  let active = state.active;
  if (gone.has(active)) {
    active = (left[0] as Part).id;
    useRoot(active);
  }
  const draft = { ...state.draft };
  if (draft.a && gone.has(draft.a.part)) draft.a = undefined;
  if (draft.b && gone.has(draft.b.part)) draft.b = undefined;
  return commit({
    ...state,
    assemblies: state.assemblies.filter((a) => !assemblies.includes(a.id)),
    parts: left,
    seams: state.seams.filter((s) => !seams.includes(s.id)),
    active,
    draft,
  });
}

export function patchPart(id: string, patch: Record<string, unknown>): PartsState {
  const p = partById(id);
  const next: Part = { ...p };
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string" || patch.name.trim() === "" || patch.name.length > 40) {
      throw new Error("o nome deve ter de 1 a 40 caracteres");
    }
    next.name = patch.name.trim();
  }
  if (patch.assembly !== undefined)
    next.assembly = patch.assembly === null ? undefined : asmById(String(patch.assembly)).id;
  if (patch.pos !== undefined) next.pos = num3(patch.pos, "pos");
  if (patch.rot !== undefined) next.rot = num3(patch.rot, "rot");
  if (patch.mirror !== undefined) {
    if (p.kind !== "mirror") throw new Error("só peças espelhadas têm plano de espelho");
    if (patch.mirror !== "x" && patch.mirror !== "y" && patch.mirror !== "z")
      throw new Error("plano deve ser x, y ou z");
    next.mirror = patch.mirror;
  }
  if (patch.yarnMap !== undefined) {
    if (p.kind === "own") throw new Error("a troca de fios vale só para instâncias e espelhadas");
    const m = patch.yarnMap as Record<string, unknown> | null;
    if (m === null) next.yarnMap = undefined;
    else {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(m)) {
        if (!/^[A-Z]$/.test(k) || typeof v !== "string" || !/^[A-Z]$/.test(v)) {
          throw new Error('yarnMap deve ligar letras de fios, ex.: {"A": "B"}');
        }
        out[k] = v;
      }
      next.yarnMap = out;
    }
  }
  return commit({ ...state, parts: state.parts.map((x) => (x.id === id ? next : x)) });
}

export function setPartText(id: string, text: string, dialect?: Dialect): PartsState {
  const root = rootOf(id);
  return commit(
    {
      ...state,
      parts: state.parts.map((x) =>
        x.id === root.id ? { ...x, text, ...(dialect ? { dialect } : { dialect: undefined }) } : x,
      ),
    },
    false,
  );
}

export function setActive(id: string): PartsState {
  partById(id);
  useRoot(id);
  return commit({ ...state, active: id }, false);
}

// ------------------------------------------------------------------ costuras

const seamId = (): string => `s${++seamNo}`;

export function addSeam(input: Omit<Seam, "id">): PartsState {
  const seam: Seam = { id: seamId(), ...input };
  return commit({ ...state, seams: [...state.seams, seam], draft: {} });
}

export function removeSeam(id: string): PartsState {
  if (!state.seams.some((s) => s.id === id)) throw new Error(`costura '${id}' não existe`);
  return commit({ ...state, seams: state.seams.filter((s) => s.id !== id) });
}

export function patchSeam(
  id: string,
  patch: Partial<Pick<Seam, "name" | "reverse" | "ratio" | "type">>,
): PartsState {
  const s = state.seams.find((x) => x.id === id);
  if (!s) throw new Error(`costura '${id}' não existe`);
  return commit({ ...state, seams: state.seams.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
}

export function setDraft(side: "a" | "b", value: SeamSide | undefined): PartsState {
  return commit({ ...state, draft: { ...state.draft, [side]: value } }, false);
}

export const clearDraft = (): PartsState => commit({ ...state, draft: {} }, false);

export const nameForNewSeam = (): string => nameFor("Costura");

// ------------------------------------------------------------------ persistência

export interface PartsJson {
  parts: Part[];
  seams: Seam[];
  active: string;
  partNo: number;
  seamNo: number;
  assemblies?: Assembly[];
  asmNo?: number;
}

export const exportParts = (): PartsJson => ({
  parts: state.parts,
  seams: state.seams,
  active: state.active,
  partNo,
  seamNo,
  assemblies: state.assemblies,
  asmNo,
});

const isPart = (p: unknown): p is Part => {
  const o = p as Partial<Part> | null;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    (o.kind === "own" || o.kind === "instance" || o.kind === "mirror") &&
    typeof o.text === "string" &&
    Array.isArray(o.pos) &&
    Array.isArray(o.rot)
  );
};

/** Quantas peças válidas há em `raw` (0 se nenhuma ou se as ligações entre peças não fecham). */
export function validPartCount(raw: unknown): number {
  const list = (raw as Partial<PartsJson> | undefined)?.parts;
  const parts = Array.isArray(list) ? list.filter(isPart) : [];
  return parts.every((p) => !p.source || parts.some((q) => q.id === p.source)) ? parts.length : 0;
}

/** Carrega as peças gravadas; sem nada válido, começa com uma peça só usando `fallback` como receita. */
export function loadParts(raw: unknown, fallback: { text: string; dialect?: Dialect }): PartsState {
  const o = (raw ?? {}) as Partial<PartsJson>;
  const parts = Array.isArray(o.parts) ? o.parts.filter(isPart) : [];
  const ok = parts.length > 0 && parts.every((p) => !p.source || parts.some((q) => q.id === p.source));
  if (!ok) {
    partNo = 1;
    seamNo = 0;
    state = {
      parts: [first(fallback.text, fallback.dialect)],
      seams: [],
      active: "p1",
      draft: {},
      assemblies: [],
      version: state.version,
    };
    asmNo = 0;
    return reload();
  }
  const seams = Array.isArray(o.seams) ? o.seams.filter((s) => s && typeof (s as Seam).id === "string") : [];
  partNo = Math.max(
    typeof o.partNo === "number" ? o.partNo : 1,
    ...parts.map((p) => Number(p.id.slice(1)) || 1),
  );
  seamNo = Math.max(
    typeof o.seamNo === "number" ? o.seamNo : 0,
    ...seams.map((s) => Number(s.id.slice(1)) || 0),
  );
  const active = parts.some((p) => p.id === o.active) ? (o.active as string) : (parts[0] as Part).id;
  // montagens gravadas: só entram as válidas; pai ou montagem que não existe manda o item para a raiz
  const rawAsm = Array.isArray(o.assemblies) ? o.assemblies : [];
  const assemblies = rawAsm.filter(
    (a): a is Assembly =>
      !!a &&
      typeof a.id === "string" &&
      typeof a.name === "string" &&
      Array.isArray(a.pos) &&
      Array.isArray(a.rot),
  );
  const asmIds = new Set(assemblies.map((a) => a.id));
  const fixedAsm = assemblies.map((a) =>
    a.parent && !asmIds.has(a.parent) ? { ...a, parent: undefined } : a,
  );
  const fixedParts = parts.map((p) =>
    p.assembly && !asmIds.has(p.assembly) ? { ...p, assembly: undefined } : p,
  );
  asmNo = Math.max(
    typeof o.asmNo === "number" ? o.asmNo : 0,
    ...fixedAsm.map((a) => Number(a.id.slice(1)) || 0),
  );
  state = { parts: fixedParts, assemblies: fixedAsm, seams, active, draft: {}, version: state.version };
  return reload();
}

/** Depois de carregar um projeto o histórico recomeça. */
function reload(): PartsState {
  ustack.length = 0;
  rstack = [];
  return publish({ ...state, version: state.version + 1 });
}

/** Volta ao projeto de uma peça só (usado em testes e ao "novo projeto"). */
export function resetParts(text = "", dialect?: Dialect): PartsState {
  resetSlots();
  resetPaintSlots();
  return loadParts({}, { text, ...(dialect ? { dialect } : {}) });
}

/** Troca o fio `from` por `to` nas trocas de fio das instâncias (chaves e valores). */
export function remapPartYarns(from: string, to: string): number {
  let n = 0;
  const parts = state.parts.map((p) => {
    if (!p.yarnMap) return p;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.yarnMap)) {
      const nk = k === from ? to : k;
      const nv = v === from ? to : v;
      if (nk !== k || nv !== v) n++;
      if (nk !== nv) next[nk] = nv;
    }
    return { ...p, yarnMap: Object.keys(next).length ? next : undefined };
  });
  if (n > 0) commit({ ...state, parts }, false);
  return n;
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Fios e pintura do projeto aberto: paleta e regiões de pintura. Mesmo padrão das configurações e do espaço de
// trabalho: estado na camada de comandos (D-21), persistência no studio. A interface e o MCP veem o mesmo estado.
import {
  DEFAULT_YARNS,
  MAX_YARNS,
  type PaintRegion,
  validateRegion,
  validateYarns,
  type Yarn,
} from "@novelo/core";

export interface PaintState {
  yarns: Yarn[];
  paint: PaintRegion[];
}

const initial = (): PaintState => ({ yarns: DEFAULT_YARNS.map((y) => ({ ...y })), paint: [] });

let current: PaintState = initial();
const listeners = new Set<(s: PaintState) => void>();

export const paintSnapshot = (): PaintState => current;

export function subscribePaint(fn: (s: PaintState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit(next: PaintState): PaintState {
  current = next;
  for (const fn of listeners) fn(current);
  return current;
}

/** Troca a paleta. Não deixa tirar um fio que a pintura ainda usa (evita regiões órfãs sem aviso). */
export function setYarns(input: unknown): PaintState {
  const yarns = validateYarns(input);
  const ids = new Set(yarns.map((y) => y.id));
  const others = [...slotPaint].filter(([id]) => id !== paintSlot).flatMap(([, list]) => list);
  const orphan = [...current.paint, ...others].find((r) => !ids.has(r.yarn));
  if (orphan)
    throw new Error(`o fio ${orphan.yarn} ainda é usado pela pintura; limpe-a ou pinte com outro fio antes`);
  return commit({ ...current, yarns });
}

export function addRegion(input: unknown): PaintState {
  const region = validateRegion(input, current.yarns);
  return commit({ ...current, paint: [...current.paint, region] });
}

export function removeRegion(index: number): PaintState {
  if (!Number.isInteger(index) || index < 0 || index >= current.paint.length) {
    throw new Error(`pintura ${index + 1} não existe`);
  }
  return commit({ ...current, paint: current.paint.filter((_, i) => i !== index) });
}

export function clearPaint(): PaintState {
  return commit({ ...current, paint: [] });
}

export function resetPaint(): PaintState {
  slotPaint.clear();
  return commit(initial());
}

/** Letra livre para um novo fio, ou undefined se a paleta está cheia. */
export function nextYarnId(yarns: Yarn[] = current.yarns): string | undefined {
  if (yarns.length >= MAX_YARNS) return undefined;
  for (let c = 65; c <= 90; c++) {
    const id = String.fromCharCode(c);
    if (!yarns.some((y) => y.id === id)) return id;
  }
  return undefined;
}

/** Carrega o que foi gravado (localStorage). Valores inválidos são ignorados, sem lançar erro. */
export function loadPaint(raw: unknown): PaintState {
  const o = (raw ?? {}) as { yarns?: unknown; paint?: unknown };
  let yarns = initial().yarns;
  try {
    yarns = validateYarns(o.yarns);
  } catch {
    // paleta inválida: volta ao padrão
  }
  const paint: PaintRegion[] = [];
  if (Array.isArray(o.paint)) {
    for (const r of o.paint) {
      try {
        paint.push(validateRegion(r, yarns));
      } catch {
        // região inválida: descartada
      }
    }
  }
  return commit({ yarns, paint });
}

// ------------------------------------------------------------------ pintura por peça (P3.5, multipartes)
// A paleta é do projeto (todas as peças); as regras de pintura por volta pertencem a cada peça.

const slotPaint = new Map<string, PaintRegion[]>();
let paintSlot = "p1";

/** Passa a usar as regras de pintura da peça `id`. */
export function switchPaintSlot(id: string, quiet = false): void {
  if (id === paintSlot) return;
  slotPaint.set(paintSlot, current.paint);
  paintSlot = id;
  const next = { ...current, paint: slotPaint.get(id) ?? [] };
  if (quiet) current = next;
  else commit(next);
}

export const removePaintSlot = (id: string): void => {
  if (id !== paintSlot) slotPaint.delete(id);
};

/** Copia as regras da peça `from` para a nova peça `to`. */
export function clonePaintSlot(from: string, to: string): void {
  const src = from === paintSlot ? current.paint : (slotPaint.get(from) ?? []);
  slotPaint.set(
    to,
    src.map((r) => (r.kind === "rows" ? { ...r } : { ...r, at: r.at.map((a) => ({ ...a })) })),
  );
}

export interface PaintAll {
  yarns: Yarn[];
  slots: Record<string, PaintRegion[]>;
}

export function exportPaintAll(keep?: string[]): PaintAll {
  const slots: Record<string, PaintRegion[]> = {};
  for (const [id, regions] of slotPaint)
    if (id !== paintSlot && (!keep || keep.includes(id))) slots[id] = regions;
  slots[paintSlot] = current.paint;
  return { yarns: current.yarns, slots };
}

/** Carrega paleta e regras de todas as peças; o formato antigo ({yarns, paint}) vira a peça `p1`. */
export function loadPaintAll(raw: unknown, active: string): PaintState {
  const o = (raw ?? {}) as { yarns?: unknown; paint?: unknown; slots?: Record<string, unknown> };
  let yarns = initial().yarns;
  try {
    yarns = validateYarns(o.yarns);
  } catch {
    // paleta inválida: volta ao padrão
  }
  const clean = (list: unknown): PaintRegion[] => {
    const out: PaintRegion[] = [];
    if (Array.isArray(list)) {
      for (const r of list) {
        try {
          out.push(validateRegion(r, yarns));
        } catch {
          // região inválida: descartada
        }
      }
    }
    return out;
  };
  slotPaint.clear();
  const src = o.slots ?? (o.paint !== undefined ? { p1: o.paint } : {});
  for (const [id, list] of Object.entries(src)) slotPaint.set(id, clean(list));
  paintSlot = active;
  return commit({ yarns, paint: slotPaint.get(active) ?? [] });
}

/** Ficha da peça de pintura atual: devolvida a `restorePaintToken`, volta ao mesmo estado e ao mesmo objeto. */
export const paintToken = (): { id: string; state: PaintState } => ({ id: paintSlot, state: current });
export function restorePaintToken(t: { id: string; state: PaintState }): void {
  if (t.id !== paintSlot) slotPaint.set(paintSlot, current.paint);
  paintSlot = t.id;
  current = t.state;
}

/** Troca o fio `from` por `to` em todas as regras de pintura de todas as peças. Devolve quantas regiões mudaram. */
export function remapYarnAll(from: string, to: string): number {
  let n = 0;
  const map = (list: PaintRegion[]) =>
    list.map((r) => {
      if (r.yarn !== from) return r;
      n++;
      return { ...r, yarn: to };
    });
  for (const [id, list] of slotPaint) if (id !== paintSlot) slotPaint.set(id, map(list));
  const paint = map(current.paint);
  if (n > 0) commit({ ...current, paint });
  return n;
}

/** Novo projeto: descarta a pintura de todas as peças (a paleta fica). */
export function resetPaintSlots(): void {
  slotPaint.clear();
  paintSlot = "p1";
  commit({ ...current, paint: [] });
}

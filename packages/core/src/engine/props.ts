// SPDX-License-Identifier: GPL-3.0-or-later
// Propriedades por ponto guardadas de forma esparsa (só o que difere do padrão), por uid (docs/15).
import { type PointStore, PROPS } from "./store.ts";

/** propriedade -> (uid -> valor). */
export type Overrides = Record<string, Map<number, number>>;
/** Forma serializável: propriedade -> lista de [uid, valor]. */
export type OverridesJson = Record<string, [number, number][]>;

export const emptyOverrides = (): Overrides => ({});

export function cloneOverrides(o: Overrides): Overrides {
  const out: Overrides = {};
  for (const [k, m] of Object.entries(o)) out[k] = new Map(m);
  return out;
}

export function toJson(o: Overrides): OverridesJson {
  const out: OverridesJson = {};
  for (const [k, m] of Object.entries(o)) if (m.size > 0) out[k] = [...m.entries()];
  return out;
}

export function fromJson(j: unknown): Overrides {
  const out: Overrides = {};
  if (!j || typeof j !== "object") return out;
  for (const [k, list] of Object.entries(j as Record<string, unknown>)) {
    if (!PROPS[k] || !Array.isArray(list)) continue;
    const m = new Map<number, number>();
    for (const e of list) {
      if (Array.isArray(e) && Number.isInteger(e[0]) && typeof e[1] === "number" && Number.isFinite(e[1])) {
        m.set(e[0] as number, e[1] as number);
      }
    }
    out[k] = m;
  }
  return out;
}

/** Escreve `value` em todos os `uids`; o valor padrão apaga a sobreposição (fica esparso). */
export function setProp(o: Overrides, name: string, uids: Iterable<number>, value: number): void {
  const def = PROPS[name];
  if (!def) throw new Error(`propriedade '${name}' desconhecida`);
  const m = o[name] ?? new Map<number, number>();
  o[name] = m;
  for (const u of uids) {
    if (value === def.default) m.delete(u);
    else m.set(u, value);
  }
}

/** Escreve valores diferentes por uid (ex.: gradiente). */
export function setPropEach(
  o: Overrides,
  name: string,
  uids: ArrayLike<number>,
  values: ArrayLike<number>,
): void {
  const def = PROPS[name];
  if (!def) throw new Error(`propriedade '${name}' desconhecida`);
  const m = o[name] ?? new Map<number, number>();
  o[name] = m;
  for (let i = 0; i < uids.length; i++) {
    const v = values[i] as number;
    if (v === def.default) m.delete(uids[i] as number);
    else m.set(uids[i] as number, v);
  }
}

/** Preenche as colunas do armazém com as sobreposições (uid sem ponto correspondente é ignorado). */
export function applyOverrides(s: PointStore, o: Overrides): void {
  for (const [name, m] of Object.entries(o)) {
    if (m.size === 0) continue;
    const col = s.col(name);
    for (const [uid, v] of m) {
      const i = s.indexOf(uid);
      if (i >= 0) col[i] = v;
    }
  }
}

/** Valor de uma propriedade para um uid (sobreposição ou padrão). */
export function getProp(o: Overrides, name: string, uid: number): number {
  return o[name]?.get(uid) ?? (PROPS[name]?.default as number);
}

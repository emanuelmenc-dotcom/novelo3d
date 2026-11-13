// SPDX-License-Identifier: GPL-3.0-or-later
// Estado do espaço de trabalho: layout atual, layouts customizados do usuário e qual preset está aplicado.
// Mesmo padrão das configurações: estado na camada de comandos (D-21), persistência no studio.
import { DEFAULT_PRESET_ID, presetLayout } from "./presets.ts";
import { type Layout, validateLayout } from "./workspace.ts";

export interface CustomLayout {
  id: string;
  name: string;
  layout: Layout;
}

export interface WorkspaceState {
  layout: Layout;
  /** "classic", "custom:<id>" ou null quando o layout foi alterado depois de aplicado. */
  presetId: string | null;
  customs: CustomLayout[];
}

const initialLayout = (): Layout => presetLayout(DEFAULT_PRESET_ID) as Layout;

let current: WorkspaceState = { layout: initialLayout(), presetId: DEFAULT_PRESET_ID, customs: [] };
const listeners = new Set<(s: WorkspaceState) => void>();

export const workspaceSnapshot = (): WorkspaceState => current;

export function subscribeWorkspace(fn: (s: WorkspaceState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit(next: WorkspaceState): WorkspaceState {
  current = next;
  for (const fn of listeners) fn(current);
  return current;
}

/** Aplica uma operação pura sobre o layout; o resultado deixa de ser "igual ao preset". */
export function mutateLayout(fn: (l: Layout) => Layout): WorkspaceState {
  return commit({ ...current, layout: fn(current.layout), presetId: null });
}

export function applyLayoutId(id: string): WorkspaceState {
  if (id.startsWith("custom:")) {
    const c = current.customs.find((x) => `custom:${x.id}` === id);
    if (!c) throw new Error(`layout customizado '${id}' não existe`);
    return commit({ ...current, layout: structuredClone(c.layout), presetId: id });
  }
  const layout = presetLayout(id);
  if (!layout) throw new Error(`preset '${id}' não existe`);
  return commit({ ...current, layout, presetId: id });
}

export function resetWorkspace(): WorkspaceState {
  return applyLayoutId(DEFAULT_PRESET_ID);
}

const slug = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "layout";

function checkName(name: unknown): string {
  if (typeof name !== "string") throw new Error("o nome deve ser texto");
  const n = name.trim();
  if (n.length < 1 || n.length > 40) throw new Error("o nome deve ter de 1 a 40 caracteres");
  return n;
}

/** Salva o layout atual com um nome. Mesmo nome (sem diferenciar maiúsculas) sobrescreve. */
export function saveCustom(name: string): WorkspaceState {
  const n = checkName(name);
  const same = current.customs.find((c) => c.name.toLowerCase() === n.toLowerCase());
  const layout = structuredClone(current.layout);
  if (same) {
    const customs = current.customs.map((c) => (c === same ? { ...c, name: n, layout } : c));
    return commit({ ...current, customs, presetId: `custom:${same.id}` });
  }
  const base = slug(n);
  let id = base;
  for (let i = 2; current.customs.some((c) => c.id === id); i++) id = `${base}-${i}`;
  return commit({
    ...current,
    customs: [...current.customs, { id, name: n, layout }],
    presetId: `custom:${id}`,
  });
}

export function deleteCustom(id: string): WorkspaceState {
  if (!current.customs.some((c) => c.id === id)) throw new Error(`layout customizado '${id}' não existe`);
  return commit({
    ...current,
    customs: current.customs.filter((c) => c.id !== id),
    presetId: current.presetId === `custom:${id}` ? null : current.presetId,
  });
}

export function renameCustom(id: string, name: string): WorkspaceState {
  const n = checkName(name);
  if (!current.customs.some((c) => c.id === id)) throw new Error(`layout customizado '${id}' não existe`);
  if (current.customs.some((c) => c.id !== id && c.name.toLowerCase() === n.toLowerCase())) {
    throw new Error(`já existe um layout chamado '${n}'`);
  }
  return commit({ ...current, customs: current.customs.map((c) => (c.id === id ? { ...c, name: n } : c)) });
}

/** Carrega o que foi gravado (localStorage). Valores inválidos são ignorados, sem lançar erro. */
export function loadWorkspace(raw: unknown): WorkspaceState {
  const o = (raw ?? {}) as { layout?: unknown; presetId?: unknown; customs?: unknown };
  const customs: CustomLayout[] = [];
  if (Array.isArray(o.customs)) {
    for (const c of o.customs as { id?: unknown; name?: unknown; layout?: unknown }[]) {
      try {
        if (typeof c.id === "string" && typeof c.name === "string") {
          customs.push({ id: c.id, name: checkName(c.name), layout: validateLayout(c.layout) });
        }
      } catch {
        // custom inválido: descartado
      }
    }
  }
  let layout: Layout;
  try {
    layout = validateLayout(o.layout);
  } catch {
    layout = initialLayout();
    return commit({ layout, presetId: DEFAULT_PRESET_ID, customs });
  }
  const presetId = typeof o.presetId === "string" ? o.presetId : null;
  return commit({ layout, presetId, customs });
}

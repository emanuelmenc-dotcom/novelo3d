// SPDX-License-Identifier: GPL-3.0-or-later
// Estado do espaço de trabalho: layout atual, layouts customizados do usuário e qual preset está aplicado.
// Mesmo padrão das configurações: estado na camada de comandos (D-21), persistência no studio.
import { DEFAULT_PRESET_ID, presetLayout } from "./presets.ts";
import {
  enabledPanels,
  hidePanel,
  type Layout,
  type PanelId,
  panelsIn,
  pruneOff,
  showPanelNear,
  validateLayout,
} from "./workspace.ts";

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
  /** Janelas que o usuário desligou no menu Janelas: continuam desligadas ao trocar de layout predefinido. */
  off: PanelId[];
  /** Último layout predefinido ou do usuário aplicado: é onde uma janela religada volta a ficar. */
  base: string | null;
}

const initialLayout = (): Layout => presetLayout(DEFAULT_PRESET_ID) as Layout;

let current: WorkspaceState = {
  layout: initialLayout(),
  presetId: DEFAULT_PRESET_ID,
  customs: [],
  off: [],
  base: DEFAULT_PRESET_ID,
};
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

/** Layout de um preset ou de um layout do usuário (`custom:<id>`), sem aplicar. */
function layoutOfId(id: string | null): Layout | undefined {
  if (id === null) return undefined;
  if (id.startsWith("custom:")) {
    const c = current.customs.find((x) => `custom:${x.id}` === id);
    return c ? structuredClone(c.layout) : undefined;
  }
  return presetLayout(id);
}

export function applyLayoutId(id: string): WorkspaceState {
  const layout = layoutOfId(id);
  if (!layout) {
    throw new Error(
      id.startsWith("custom:") ? `layout customizado '${id}' não existe` : `preset '${id}' não existe`,
    );
  }
  // o layout só reposiciona: janela desligada no menu Janelas continua desligada
  return commit({ ...current, layout: pruneOff(layout, current.off), presetId: id, base: id });
}

/** Liga ou desliga uma janela, sem depender do layout predefinido aplicado. */
export function setPanelOff(panel: PanelId, off: boolean): WorkspaceState {
  if (!enabledPanels().includes(panel)) throw new Error(`o painel '${panel}' não existe`);
  const set = new Set(current.off);
  if (off) {
    set.add(panel);
    const layout = panelsIn(current.layout).includes(panel)
      ? hidePanel(current.layout, panel)
      : current.layout;
    return commit({ ...current, layout, off: [...set], presetId: null });
  }
  set.delete(panel);
  const layout = showPanelNear(current.layout, panel, layoutOfId(current.base));
  return commit({ ...current, layout, off: [...set], presetId: null });
}

export function resetWorkspace(): WorkspaceState {
  current = { ...current, off: [] };
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
/** Layout salvo antes do G4: a janela Montagem virou Árvore e Propriedades. Troca nos dados crus, antes da validação descartar o desconhecido. */
function migratePanels(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(migratePanels);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => {
        if ((k === "tabs" || k === "off") && Array.isArray(v) && v.includes("assembly")) {
          return [k, [...new Set(v.flatMap((p) => (p === "assembly" ? ["tree", "props"] : [p])))]];
        }
        return [k, migratePanels(v)];
      }),
    );
  }
  return node;
}

export function loadWorkspace(rawSaved: unknown): WorkspaceState {
  const raw = migratePanels(rawSaved);
  const o = (raw ?? {}) as {
    layout?: unknown;
    presetId?: unknown;
    customs?: unknown;
    off?: unknown;
    base?: unknown;
  };
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
  const known = enabledPanels();
  const off = Array.isArray(o.off) ? (o.off.filter((p) => known.includes(p as PanelId)) as PanelId[]) : [];
  const base = typeof o.base === "string" ? o.base : DEFAULT_PRESET_ID;
  let layout: Layout;
  try {
    layout = validateLayout(o.layout);
  } catch {
    layout = initialLayout();
    return commit({
      layout: pruneOff(layout, off),
      presetId: DEFAULT_PRESET_ID,
      customs,
      off,
      base: DEFAULT_PRESET_ID,
    });
  }
  const presetId = typeof o.presetId === "string" ? o.presetId : null;
  return commit({ layout, presetId, customs, off, base });
}

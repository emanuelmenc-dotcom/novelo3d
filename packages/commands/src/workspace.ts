// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo do espaço de trabalho modular: uma árvore de janelas (divisões com tamanho editável); cada janela
// agrupa painéis em abas, pode ser encolhida numa barra e receber painéis arrastados. Funções puras e testáveis;
// a interface (studio) só desenha esta árvore. Sem DOM.

import { type Features, features } from "./features.ts";

export const PANEL_IDS = [
  "recipe",
  "verify",
  "chart",
  "view3d",
  "cp",
  "yarns",
  "points",
  "tree",
  "props",
  "render",
  "stitchEditor",
] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** Painéis que pertencem a um recurso pausável (features.ts): enquanto o recurso está desligado, o painel não existe. */
const PANEL_FEATURE: Partial<Record<PanelId, keyof Features>> = {
  render: "render",
  stitchEditor: "stitchEditor",
};
export const panelEnabled = (p: PanelId): boolean => {
  const f = PANEL_FEATURE[p];
  return f === undefined || features()[f];
};
/** Painéis que existem agora (os do recurso desligado ficam de fora). */
export const enabledPanels = (): PanelId[] => PANEL_IDS.filter(panelEnabled);

export const PANEL_TITLES: Record<PanelId, string> = {
  recipe: "Receita",
  verify: "Verificação de contagem",
  chart: "Gráfico circular",
  view3d: "3D",
  cp: "Texto CrochetPARADE",
  yarns: "Fios",
  points: "Pontos",
  tree: "Árvore",
  props: "Propriedades",
  render: "Render",
  stitchEditor: "Criador de pontos",
};

export type Zone = "center" | "left" | "right" | "top" | "bottom";
export type Dir = "row" | "column";

export interface Leaf {
  type: "leaf";
  id: string;
  tabs: PanelId[];
  active: number;
  /** Encolhida numa barra fina (só o título). */
  collapsed: boolean;
}
export interface Split {
  type: "split";
  id: string;
  dir: Dir;
  /** Frações do espaço, uma por filho; somam 1. */
  sizes: number[];
  children: Node[];
}
export type Node = Leaf | Split;
export interface Layout {
  root: Node;
}

export const MIN_FRACTION = 0.06;

const clone = <T>(x: T): T => structuredClone(x);

// ---------------------------------------------------------------- construção a partir de especificações

export type Spec =
  | { leaf: PanelId[]; active?: number; collapsed?: boolean }
  | { dir: Dir; sizes: number[]; children: Spec[] };

export function buildLayout(spec: Spec): Layout {
  let n = 0;
  const make = (s: Spec): Node => {
    n++;
    const id = `n${n}`;
    if ("leaf" in s) {
      return { type: "leaf", id, tabs: [...s.leaf], active: s.active ?? 0, collapsed: s.collapsed ?? false };
    }
    return { type: "split", id, dir: s.dir, sizes: [...s.sizes], children: s.children.map(make) };
  };
  return { root: normalizeNode(make(spec)) as Node };
}

// ---------------------------------------------------------------- consulta

export function walk(
  node: Node,
  fn: (n: Node, parent: Split | null) => void,
  parent: Split | null = null,
): void {
  fn(node, parent);
  if (node.type === "split") for (const c of node.children) walk(c, fn, node);
}

export function leaves(layout: Layout): Leaf[] {
  const out: Leaf[] = [];
  walk(layout.root, (n) => {
    if (n.type === "leaf") out.push(n);
  });
  return out;
}

export function findLeaf(layout: Layout, id: string): Leaf | undefined {
  return leaves(layout).find((l) => l.id === id);
}

export function leafOfPanel(layout: Layout, panel: PanelId): Leaf | undefined {
  return leaves(layout).find((l) => l.tabs.includes(panel));
}

export function panelsIn(layout: Layout): PanelId[] {
  return leaves(layout).flatMap((l) => l.tabs);
}

/** Painéis realmente à vista: aba ativa de uma janela não encolhida (a única janela nunca conta como encolhida). */
export function visiblePanels(layout: Layout): Set<PanelId> {
  const all = leaves(layout);
  const out = new Set<PanelId>();
  for (const l of all) {
    if (l.collapsed && all.length > 1) continue;
    const p = l.tabs[l.active];
    if (p) out.add(p);
  }
  return out;
}

function nextId(root: Node): string {
  let max = 0;
  walk(root, (n) => {
    const m = /^n(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `n${max + 1}`;
}

// ---------------------------------------------------------------- normalização

function renorm(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  let s = sizes.map((v) => Math.max(v / total, 0));
  // piso mínimo por filho, refeito até estabilizar
  for (let k = 0; k < 4; k++) {
    const low = s.map((v) => v < MIN_FRACTION);
    if (!low.some(Boolean)) break;
    const fixed = low.filter(Boolean).length * MIN_FRACTION;
    const rest = s.reduce((a, v, i) => a + (low[i] ? 0 : v), 0) || 1;
    s = s.map((v, i) => (low[i] ? MIN_FRACTION : (v / rest) * (1 - fixed)));
  }
  return s;
}

function normalizeNode(node: Node): Node | null {
  if (node.type === "leaf") {
    // painéis de recurso pausado somem de qualquer layout (preset, salvo ou vindo de fora); ao religar o recurso, voltam a
    // aparecer como painéis ocultos
    const tabs = node.tabs.filter(panelEnabled);
    if (tabs.length === 0) return null;
    const shown = node.tabs[node.active];
    const active = shown !== undefined && tabs.includes(shown) ? tabs.indexOf(shown) : 0;
    return { ...node, tabs, active: Math.min(Math.max(active, 0), tabs.length - 1) };
  }
  const kids: Node[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    const n = normalizeNode(c);
    if (n) {
      kids.push(n);
      sizes.push(node.sizes[i] ?? 1 / node.children.length);
    }
  });
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0] as Node;
  // achata divisões aninhadas na mesma direção
  const flatKids: Node[] = [];
  const flatSizes: number[] = [];
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  kids.forEach((k, i) => {
    const frac = (sizes[i] as number) / total;
    if (k.type === "split" && k.dir === node.dir) {
      const ct = k.sizes.reduce((a, b) => a + b, 0) || 1;
      k.children.forEach((g, j) => {
        flatKids.push(g);
        flatSizes.push(frac * ((k.sizes[j] as number) / ct));
      });
    } else {
      flatKids.push(k);
      flatSizes.push(frac);
    }
  });
  return { ...node, children: flatKids, sizes: renorm(flatSizes) };
}

export function normalize(layout: Layout): Layout {
  const root = normalizeNode(layout.root);
  if (!root) throw new Error("o layout ficaria sem nenhuma janela");
  return { root };
}

// ---------------------------------------------------------------- validação (entrada de fora: arquivo, MCP)

export function validateLayout(input: unknown): Layout {
  const seenIds = new Set<string>();
  const seenPanels = new Set<string>();
  const check = (n: unknown, path: string): Node => {
    if (typeof n !== "object" || n === null) throw new Error(`${path}: nó inválido`);
    const o = n as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id === "") throw new Error(`${path}: sem id`);
    if (seenIds.has(o.id)) throw new Error(`${path}: id repetido '${o.id}'`);
    seenIds.add(o.id);
    if (o.type === "leaf") {
      if (!Array.isArray(o.tabs) || o.tabs.length === 0) throw new Error(`${path}: janela sem painéis`);
      // painel que não existe mais (uma versão antiga do app) é ignorado, para não perder o layout salvo inteiro
      const known = (o.tabs as unknown[]).filter((t) =>
        (PANEL_IDS as readonly string[]).includes(t as string),
      );
      if (known.length === 0) throw new Error(`${path}: janela sem painéis`);
      for (const t of known) {
        if (seenPanels.has(t as string)) throw new Error(`${path}: painel '${String(t)}' aparece duas vezes`);
        seenPanels.add(t as string);
      }
      const active = typeof o.active === "number" ? o.active : 0;
      return {
        type: "leaf",
        id: o.id,
        tabs: known as PanelId[],
        active,
        collapsed: o.collapsed === true,
      };
    }
    if (o.type === "split") {
      if (o.dir !== "row" && o.dir !== "column") throw new Error(`${path}: direção inválida`);
      if (!Array.isArray(o.children) || o.children.length < 2) {
        throw new Error(`${path}: divisão precisa de 2 ou mais filhos`);
      }
      if (
        !Array.isArray(o.sizes) ||
        o.sizes.length !== o.children.length ||
        o.sizes.some((v) => typeof v !== "number" || !(v > 0))
      ) {
        throw new Error(`${path}: tamanhos inválidos`);
      }
      return {
        type: "split",
        id: o.id,
        dir: o.dir,
        sizes: [...(o.sizes as number[])],
        children: (o.children as unknown[]).map((c, i) => check(c, `${path}/${i}`)),
      };
    }
    throw new Error(`${path}: tipo '${String(o.type)}' desconhecido`);
  };
  const root = (input as { root?: unknown } | null)?.root;
  return normalize({ root: check(root, "raiz") });
}

// ---------------------------------------------------------------- operações

function mapNode(node: Node, fn: (n: Node) => Node): Node {
  const out = fn(node);
  if (out.type === "split") return { ...out, children: out.children.map((c) => mapNode(c, fn)) };
  return out;
}

export function setActive(layout: Layout, leafId: string, index: number): Layout {
  if (!findLeaf(layout, leafId)) throw new Error(`janela '${leafId}' não existe`);
  return {
    root: mapNode(layout.root, (n) =>
      n.type === "leaf" && n.id === leafId
        ? { ...n, active: Math.min(Math.max(index, 0), n.tabs.length - 1) }
        : n,
    ),
  };
}

/** Encolhe a janela numa barra ou a restaura. Janela única não encolhe. */
export function toggleCollapse(layout: Layout, leafId: string, force?: boolean): Layout {
  const l = findLeaf(layout, leafId);
  if (!l) throw new Error(`janela '${leafId}' não existe`);
  if (leaves(layout).length === 1) return layout;
  const to = force ?? !l.collapsed;
  return {
    root: mapNode(layout.root, (n) => (n.type === "leaf" && n.id === leafId ? { ...n, collapsed: to } : n)),
  };
}

/** Move a borda entre o filho `index` e o seguinte, em fração do espaço da divisão. */
export function resizeSplit(layout: Layout, splitId: string, index: number, delta: number): Layout {
  let found = false;
  const root = mapNode(layout.root, (n) => {
    if (n.type !== "split" || n.id !== splitId) return n;
    found = true;
    if (index < 0 || index >= n.sizes.length - 1) throw new Error("índice de borda inválido");
    const sizes = [...n.sizes];
    const a = sizes[index] as number;
    const b = sizes[index + 1] as number;
    const d = Math.min(Math.max(delta, MIN_FRACTION - a), b - MIN_FRACTION);
    sizes[index] = a + d;
    sizes[index + 1] = b - d;
    return { ...n, sizes };
  });
  if (!found) throw new Error(`divisão '${splitId}' não existe`);
  return { root };
}

/** Define todas as frações de uma divisão de uma vez (ajuste fino por comando). */
export function setSizes(layout: Layout, splitId: string, sizes: number[]): Layout {
  let found = false;
  const root = mapNode(layout.root, (n) => {
    if (n.type !== "split" || n.id !== splitId) return n;
    found = true;
    if (sizes.length !== n.children.length || sizes.some((v) => !(v > 0)))
      throw new Error("tamanhos inválidos");
    return { ...n, sizes: renorm(sizes) };
  });
  if (!found) throw new Error(`divisão '${splitId}' não existe`);
  return { root };
}

/** Troca o nó `id` pelo resultado de `make`, sem descer no nó novo (que pode conter o original). */
function replaceNode(root: Node, id: string, make: (n: Node) => Node): Node {
  if (root.id === id) return make(root);
  if (root.type === "split") return { ...root, children: root.children.map((c) => replaceNode(c, id, make)) };
  return root;
}

/**
 * Leva um painel para outra janela: `center` vira aba da janela alvo; as bordas dividem a janela alvo
 * e criam uma janela nova com o painel. Mover para a própria janela só reordena/ativa.
 */
export function movePanel(layout: Layout, panel: PanelId, targetLeafId: string, zone: Zone): Layout {
  const src = leafOfPanel(layout, panel);
  const target = findLeaf(layout, targetLeafId);
  if (!src) throw new Error(`painel '${panel}' não está no layout`);
  if (!target) throw new Error(`janela '${targetLeafId}' não existe`);
  if (src.id === target.id) {
    if (zone === "center") return setActive(layout, target.id, target.tabs.indexOf(panel));
    if (src.tabs.length === 1) return layout; // dividir a janela com ela mesma não faz sentido
  }
  const work = clone(layout);
  // 1. tira o painel da janela de origem
  let root = mapNode(work.root, (n) => {
    if (n.type === "leaf" && n.id === src.id) {
      const tabs = n.tabs.filter((t) => t !== panel);
      return { ...n, tabs, active: Math.min(n.active, Math.max(0, tabs.length - 1)) };
    }
    return n;
  });
  // 2. coloca na janela de destino
  if (zone === "center") {
    root = replaceNode(root, target.id, (n) =>
      n.type === "leaf" ? { ...n, tabs: [...n.tabs, panel], active: n.tabs.length, collapsed: false } : n,
    );
  } else {
    const fresh: Leaf = { type: "leaf", id: nextId(root), tabs: [panel], active: 0, collapsed: false };
    const splitId = `n${Number(fresh.id.slice(1)) + 1}`;
    const dir: Dir = zone === "left" || zone === "right" ? "row" : "column";
    const before = zone === "left" || zone === "top";
    root = replaceNode(root, target.id, (n) => ({
      type: "split",
      id: splitId,
      dir,
      sizes: [0.5, 0.5],
      children: before ? [fresh, n] : [n, fresh],
    }));
  }
  return normalize({ root });
}

/** Tira o painel do layout (fica "oculto" até `showPanel`). Não deixa o layout vazio. */
export function hidePanel(layout: Layout, panel: PanelId): Layout {
  const src = leafOfPanel(layout, panel);
  if (!src) return layout;
  if (panelsIn(layout).length === 1) throw new Error("não dá para ocultar o último painel");
  return normalize({
    root: mapNode(layout.root, (n) => {
      if (n.type === "leaf" && n.id === src.id) {
        const tabs = n.tabs.filter((t) => t !== panel);
        return { ...n, tabs, active: Math.min(n.active, Math.max(0, tabs.length - 1)) };
      }
      return n;
    }),
  });
}

/** Tira do layout todos os painéis de `off` (os que o usuário desligou), sem nunca deixar o layout vazio. */
export function pruneOff(layout: Layout, off: readonly PanelId[]): Layout {
  let out = layout;
  for (const p of off) if (leafOfPanel(out, p) && panelsIn(out).length > 1) out = hidePanel(out, p);
  return out;
}

/** Traz de volta um painel desligado para perto dos seus vizinhos no layout `base` (um preset ou layout do usuário). */
export function showPanelNear(layout: Layout, panel: PanelId, base: Layout | undefined): Layout {
  if (leafOfPanel(layout, panel)) return layout;
  const baseLeaf = base ? leafOfPanel(base, panel) : undefined;
  const neighbour = baseLeaf?.tabs.find((t) => t !== panel && leafOfPanel(layout, t));
  const target = (neighbour ? leafOfPanel(layout, neighbour) : undefined) ?? (leaves(layout)[0] as Leaf);
  return {
    root: mapNode(layout.root, (n) =>
      n.type === "leaf" && n.id === target.id
        ? { ...n, tabs: [...n.tabs, panel], active: n.tabs.length, collapsed: false }
        : n,
    ),
  };
}

/** Traz de volta um painel oculto, como aba da primeira janela. */
export function showPanel(layout: Layout, panel: PanelId): Layout {
  if (leafOfPanel(layout, panel)) return layout;
  const first = leaves(layout)[0] as Leaf;
  return {
    root: mapNode(layout.root, (n) =>
      n.type === "leaf" && n.id === first.id
        ? { ...n, tabs: [...n.tabs, panel], active: n.tabs.length, collapsed: false }
        : n,
    ),
  };
}

export function hiddenPanels(layout: Layout): PanelId[] {
  const present = new Set(panelsIn(layout));
  return PANEL_IDS.filter((p) => !present.has(p) && panelEnabled(p));
}

// ---------------------------------------------------------------- tamanhos mínimos e modo compacto

/** Tamanho em pixels (na escala 100% da interface). */
export interface PanelMin {
  w: number;
  h: number;
}
export type PanelMins = Record<PanelId, PanelMin>;

/** Mínimos de cada painel. O do 3D vem da configuração `interface.min3d`. */
export const DEFAULT_PANEL_MINS: PanelMins = {
  recipe: { w: 220, h: 150 },
  verify: { w: 260, h: 130 },
  chart: { w: 280, h: 220 },
  view3d: { w: 320, h: 256 },
  cp: { w: 220, h: 120 },
  yarns: { w: 260, h: 200 },
  points: { w: 260, h: 200 },
  tree: { w: 240, h: 200 },
  props: { w: 260, h: 200 },
  render: { w: 320, h: 260 },
  stitchEditor: { w: 320, h: 240 },
};

/** Mínimos com o 3D ajustado: largura `min3d` e altura 80% dela. */
export function panelMins(min3d: number): PanelMins {
  return { ...DEFAULT_PANEL_MINS, view3d: { w: min3d, h: Math.round(min3d * 0.8) } };
}

export const HEAD_PX = 34;
export const BAR_PX = 34;
export const SPLITTER_PX = 6;

/** Menor tamanho que a janela/divisão aguenta sem espremer nenhum painel (considera todas as abas). */
export function minSize(node: Node, mins: PanelMins): PanelMin {
  if (node.type === "leaf") {
    if (node.collapsed) return { w: BAR_PX, h: BAR_PX };
    const w = Math.max(...node.tabs.map((t) => mins[t].w));
    const h = Math.max(...node.tabs.map((t) => mins[t].h)) + HEAD_PX;
    return { w, h };
  }
  const kids = node.children.map((c) => minSize(c, mins));
  const gaps = (node.children.length - 1) * SPLITTER_PX;
  if (node.dir === "row") {
    return { w: kids.reduce((s, k) => s + k.w, 0) + gaps, h: Math.max(...kids.map((k) => k.h)) };
  }
  return { w: Math.max(...kids.map((k) => k.w)), h: kids.reduce((s, k) => s + k.h, 0) + gaps };
}

export function layoutMinSize(layout: Layout, mins: PanelMins): PanelMin {
  return minSize(layout.root, mins);
}

/**
 * Versão "compacta" do layout para janelas estreitas: uma única janela com todos os painéis em abas, na ordem de
 * leitura. Só para exibir: não altera nem substitui o layout salvo.
 */
export function compactLayout(layout: Layout, prefer?: PanelId): Layout {
  const ls = leaves(layout);
  const tabs = ls.flatMap((l) => l.tabs);
  const first = ls[0];
  const wanted = prefer && tabs.includes(prefer) ? prefer : first?.tabs[first.active];
  return {
    root: {
      type: "leaf",
      id: "compact",
      tabs,
      active: Math.max(0, wanted ? tabs.indexOf(wanted) : 0),
      collapsed: false,
    },
  };
}

/** O layout cabe numa área de `w` x `h` pixels (escala 100%)? */
export function fits(layout: Layout, mins: PanelMins, w: number, h: number): boolean {
  const m = layoutMinSize(layout, mins);
  return w >= m.w && h >= m.h;
}

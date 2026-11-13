// SPDX-License-Identifier: GPL-3.0-or-later
// Executor do render (R3b): vive fora de qualquer painel. Assina o estado `render.*`; quando uma rodada nova começa
// (por botão, MCP ou teste), monta e desenha na tela única do `RenderView`, respeitando pausar/parar. O painel só
// mostra a tela e os controles, então trocar de aba não interrompe nem duplica o trabalho.
import { dispatch, renderSnapshot, subscribeRender } from "@novelo/commands";
import type { LayoutData } from "../view3d.ts";
import { type CameraState, type RenderControl, type RenderSubset, RenderView } from "./renderView.ts";

export interface RenderSource {
  layout(): LayoutData | null;
  camera(): CameraState | null;
  /** Seleção atual (uids) e a peça a que pertence (montagem); null se não houver seleção. */
  selection?(): { uids: number[]; part: string | null } | null;
}

declare global {
  interface Window {
    /** Exposto para os testes de navegador. */
    __render?: {
      stats(): RenderView["stats"];
      coverage(): number;
      alphaAtCorner(): number;
      lastPng(): { width: number; height: number; bytes: number } | null;
    };
  }
}

let view: RenderView | null = null;
let source: RenderSource = { layout: () => null, camera: () => null };
let pinned: CameraState | null = null;
let startedRun = 0;
let jobKey: string | undefined;
let installed = false;
let serving = false;
let lastPng: { width: number; height: number; bytes: number } | null = null;
let message: string | null = null;
const listeners = new Set<() => void>();

function say(m: string | null): void {
  message = m;
  for (const fn of listeners) fn();
}
export const subscribeRenderMessage = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const renderMessage = (): string | null => message;

/** A tela única de exibição (criada na primeira vez que alguém precisa dela). */
export function renderView(): RenderView {
  if (!view) {
    view = new RenderView();
    view.display.dataset.testid = "render-scene";
  }
  return view;
}

export function setRenderSource(s: RenderSource): void {
  source = s;
}
export function pinCamera(c: CameraState | null): void {
  pinned = c;
}

/** Enquadramento padrão quando não há câmera do 3D: olha a peça de frente e de cima (eixo z para cima). */
function framing(layout: LayoutData, fovDeg: number, only?: number[]): CameraState {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const p = layout.positions;
  const idx = only ?? Array.from({ length: Math.floor(p.length / 3) }, (_, i) => i);
  for (const q of idx) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] as number, p[q * 3 + k] as number);
      hi[k] = Math.max(hi[k] as number, p[q * 3 + k] as number);
    }
  }
  const c = [0, 1, 2].map((k) => ((lo[k] as number) + (hi[k] as number)) / 2) as [number, number, number];
  // raio = maior distância do centro aos pontos (mais ~um ponto) em vez da meia-diagonal da caixa, que superestima
  let r = 0;
  for (const q of idx) {
    r = Math.max(r, Math.hypot(...[0, 1, 2].map((k) => (p[q * 3 + k] as number) - (c[k] as number))));
  }
  r = (r || 10) * 1.08 + 0.5;
  const dist = (r / Math.sin((fovDeg * Math.PI) / 360)) * 1.05;
  const d = [0, -0.85, 0.5];
  const l = Math.hypot(d[0] as number, d[1] as number, d[2] as number);
  return {
    position: [
      c[0] + ((d[0] as number) / l) * dist,
      c[1] + ((d[1] as number) / l) * dist,
      c[2] + ((d[2] as number) / l) * dist,
    ],
    target: c,
    up: [0, 0, 1],
  };
}

/** Mantém a direção da câmera e a enquadra no subconjunto desenhado. */
function fitCamera(base: CameraState, layout: LayoutData, fovDeg: number, only: number[]): CameraState {
  const f = framing(layout, fovDeg, only);
  const d = [0, 1, 2].map((k) => (base.position[k] as number) - (base.target[k] as number));
  const l = Math.hypot(d[0] as number, d[1] as number, d[2] as number) || 1;
  const dist = Math.hypot(
    f.position[0] - f.target[0],
    f.position[1] - f.target[1],
    f.position[2] - f.target[2],
  );
  return {
    position: [
      f.target[0] + ((d[0] as number) / l) * dist,
      f.target[1] + ((d[1] as number) / l) * dist,
      f.target[2] + ((d[2] as number) / l) * dist,
    ],
    target: f.target,
    up: base.up,
  };
}

/** Índices da seleção e do contexto (N saltos pelas arestas do layout). Mesma regra de peça que o destaque azul do 3D. */
function pickSubset(
  layout: LayoutData,
  sel: { uids: number[]; part: string | null },
  hops: number,
): RenderSubset {
  const want = new Set(sel.uids);
  const selected: number[] = [];
  layout.nodes.forEach((nd, i) => {
    if (nd.uid !== undefined && want.has(nd.uid) && (!sel.part || nd.part === sel.part)) selected.push(i);
  });
  const adj = new Map<number, number[]>();
  for (let e = 0; e + 1 < layout.edges.length; e += 2) {
    const a = layout.edges[e] as number;
    const b = layout.edges[e + 1] as number;
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  const seen = new Set(selected);
  let front = selected;
  const context: number[] = [];
  for (let h = 0; h < hops; h++) {
    const next: number[] = [];
    for (const p of front) {
      for (const q of adj.get(p) ?? []) {
        if (!seen.has(q)) {
          seen.add(q);
          next.push(q);
          context.push(q);
        }
      }
    }
    front = next;
  }
  return { selected, context };
}

const safe = (fn: () => void): void => {
  try {
    fn();
  } catch {
    // transição que já não vale (parado no meio): descartada
  }
};

function start(runId: number): void {
  startedRun = runId;
  const v = renderView();
  const layout = source.layout();
  if (!layout || layout.nodes.length === 0) {
    safe(() =>
      dispatch("render.fail", { message: "não há peça para renderizar (a receita está vazia ou inválida)" }),
    );
    return;
  }
  jobKey = layout.geomKey;
  say(null);
  const settings = renderSnapshot().settings;
  // seleção: fotografada agora (mudar a seleção depois não afeta esta rodada)
  let subset: RenderSubset | undefined;
  if (settings.scope === "selection") {
    const sel = source.selection?.() ?? null;
    subset = sel ? pickSubset(layout, sel, settings.context) : undefined;
    if (!subset || subset.selected.length === 0) {
      safe(() =>
        dispatch("render.fail", { message: "selecione pontos no 3D antes de renderizar só a seleção" }),
      );
      return;
    }
  }
  const baseCamera = pinned ?? source.camera() ?? framing(layout, settings.fovDeg);
  const camera =
    subset && settings.fitSelection
      ? fitCamera(baseCamera, layout, settings.fovDeg, [...subset.selected, ...subset.context])
      : baseCamera;
  const mine = () => renderSnapshot().run === runId;
  const ctl: RenderControl = {
    gate: async () => {
      for (;;) {
        if (!mine()) return false;
        const st = renderSnapshot().state;
        if (st === "running") return true;
        if (st !== "paused") return false;
        await new Promise((r) => setTimeout(r, 60));
      }
    },
    report: (done, total, phase, ms) => {
      if (mine()) safe(() => dispatch("render.progress", { done, total, phase, ms: Math.round(ms) }));
    },
    info: (i) => {
      if (mine()) safe(() => dispatch("render.info", i as unknown as Record<string, unknown>));
    },
  };
  const t0 = performance.now();
  v.run(layout, settings, camera, ctl, subset)
    .then((res) => {
      if (res === "done" && mine() && renderSnapshot().state === "running") {
        dispatch("render.complete", { ms: Math.round(performance.now() - t0) });
      }
    })
    .catch((e) => {
      if (mine() && ["running", "paused"].includes(renderSnapshot().state)) {
        safe(() => dispatch("render.fail", { message: (e as Error).message }));
      }
    });
}

/** Atende todos os pedidos de PNG pendentes com um único download. */
function servePng(): void {
  if (serving) return;
  serving = true;
  const v = renderView();
  const finish = () => {
    while (renderSnapshot().pngRequests > 0) safe(() => dispatch("render.pngServed", {}));
    serving = false;
  };
  if (v.stats.blocks === 0) {
    say("ainda não há imagem: aperte Play antes de salvar o PNG");
    finish();
    return;
  }
  v.png()
    .then((blob) => {
      lastPng = { width: v.display.width, height: v.display.height, bytes: blob.size };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "novelo3d-render.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    })
    .catch((e) => say((e as Error).message))
    .finally(finish);
}

/** Avisa que a geometria do projeto mudou: uma rodada em andamento fica obsoleta. */
export function renderGeomChanged(key: string | undefined): void {
  const st = renderSnapshot().state;
  if ((st === "running" || st === "paused") && jobKey !== undefined && key !== jobKey) {
    safe(() => dispatch("render.stale", {}));
  }
}

/** Liga o executor ao estado `render.*` (uma vez por página). */
export function installRenderJob(): void {
  if (installed) return;
  installed = true;
  subscribeRender((st) => {
    if (st.state === "running" && st.run !== startedRun) start(st.run);
    if (st.pngRequests > 0) servePng();
  });
  if (typeof window !== "undefined") {
    window.__render = {
      stats: () => renderView().stats,
      coverage: () => renderView().coverage(renderSnapshot().settings.background),
      alphaAtCorner: () => renderView().alphaAtCorner(),
      lastPng: () => lastPng,
    };
  }
}

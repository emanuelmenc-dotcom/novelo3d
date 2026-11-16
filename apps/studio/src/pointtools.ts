// SPDX-License-Identifier: GPL-3.0-or-later
// Estado da interface das ferramentas de pontos (qual ferramenta o botão esquerdo usa) e os tratadores de clique,
// forma e pincel da vista 3D. Toda ação passa pelos comandos selection.*, tool.* e points.* (D-21).
import { dispatch, partsSnapshot } from "@novelo/commands";
import type { Handlers, Tool } from "./view3d.ts";

export type Mode = "orbit" | "select" | "yarn" | "tension" | "measure";
export type SelTool = "point" | "group" | "column" | "hood" | "path" | "rect" | "ellipse" | "lasso";
export type BrushTool = "brush" | "bucket" | "dropper" | "erase";
export type SelOp = "replace" | "add" | "remove" | "intersect";

export interface ToolState {
  mode: Mode;
  selTool: SelTool;
  op: SelOp;
  brushTool: BrushTool;
  yarn: string;
  tension: number;
  /** Raio do pincel e da vizinhança, em saltos de ponto. */
  hops: number;
  /** Caminho A→B pelo fio (ordem do trabalho) em vez do mais curto. */
  pathByYarn: boolean;
  /** Formas na tela só pegam os pontos visíveis (desligado: atravessam a peça). */
  visibleOnly: boolean;
  /** Primeiro ponto do caminho, esperando o segundo clique. */
  pathA: number | null;
  /** Medir distância: primeiro ponto, esperando o segundo clique, e o último resultado (estimativa). */
  measureA: { part: string; uid: number } | null;
  measureText: string | null;
  /** Pontos marcados no 3D pela medida (índices da vista): o primeiro clique, depois os dois. */
  measureIds: number[] | null;
  stroking: boolean;
  error: string | null;
}

let st: ToolState = {
  mode: "orbit",
  selTool: "point",
  op: "replace",
  brushTool: "brush",
  yarn: "B",
  tension: -0.5,
  hops: 1,
  pathByYarn: false,
  visibleOnly: false,
  pathA: null,
  measureA: null,
  measureText: null,
  measureIds: null,
  stroking: false,
  error: null,
};
const listeners = new Set<() => void>();
export const toolSnapshot = (): ToolState => st;
export function subscribeTools(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function setTools(patch: Partial<ToolState>): void {
  st = { ...st, ...patch };
  for (const fn of listeners) fn();
}

/** Ferramenta do botão esquerdo na vista 3D, a partir do estado. */
export function viewerTool(s: ToolState): Tool {
  if (s.mode === "select" && (s.selTool === "rect" || s.selTool === "ellipse" || s.selTool === "lasso")) {
    return s.selTool;
  }
  if ((s.mode === "yarn" || s.mode === "tension") && (s.brushTool === "brush" || s.brushTool === "erase"))
    return "brush";
  return "orbit";
}

export interface Ctx {
  text: string;
  dialect: string;
  /** Dados do ponto da vista 3D pelo índice. */
  node: (id: number) => { uid: number; row: number; part?: string } | undefined;
  /** Intervalo dos pontos da peça ativa no 3D (montagem), ou null com uma peça só. */
  range: () => { offset: number; count: number } | null;
}

/** Valor que a ferramenta grava: fio, tensão ou null (borracha). */
function valueNow(s: ToolState): string | number | null {
  if (s.brushTool === "erase") return null;
  return s.mode === "yarn" ? s.yarn : s.tension;
}

export function makeHandlers(ctx: () => Ctx): Handlers {
  const run = (method: string, params: Record<string, unknown>) => {
    try {
      const c = ctx();
      const r = dispatch(method, { text: c.text, dialect: c.dialect, ...params });
      if (st.error) setTools({ error: null });
      return r;
    } catch (e) {
      setTools({ error: (e as Error).message });
      return undefined;
    }
  };
  /** Clicar num ponto de outra peça passa a editar essa peça. */
  const focus = (nd: { part?: string } | undefined) => {
    if (nd?.part && partsSnapshot().active !== nd.part) {
      try {
        dispatch("parts.setActive", { id: nd.part });
      } catch (e) {
        setTools({ error: (e as Error).message });
      }
    }
  };
  const opOf = (mods: { shift: boolean; ctrl: boolean }): SelOp =>
    mods.ctrl ? "remove" : mods.shift ? "add" : st.op;

  return {
    onClick(id, mods) {
      if (st.mode === "measure") {
        const hit = id === null ? undefined : ctx().node(id);
        if (!hit) return;
        const here = { part: hit.part ?? partsSnapshot().active, uid: hit.uid };
        if (st.measureA === null) {
          setTools({ measureA: here, measureIds: [id as number], measureText: "Clique no segundo ponto." });
          return;
        }
        try {
          const r = dispatch("measure.distance", { a: st.measureA, b: here }) as {
            distance: number;
            distanceMm: number;
          };
          setTools({
            measureA: null,
            measureIds: [...(st.measureIds ?? []).slice(0, 1), id as number],
            measureText: `Distância ≈ ${r.distanceMm} mm (${r.distance} larguras de ponto) · estimativa`,
          });
        } catch (e) {
          setTools({ measureA: null, measureIds: null, measureText: (e as Error).message });
        }
        return;
      }
      if (st.mode === "orbit") return;
      const nd = id === null ? undefined : ctx().node(id);
      focus(nd);
      if (st.mode === "select") {
        if (!nd) {
          if (!mods.shift && !mods.ctrl && st.selTool !== "path") run("selection.clear", {});
          return;
        }
        const op = opOf(mods);
        if (st.selTool === "point") run("selection.select", { by: { kind: "uids", uids: [nd.uid] }, op });
        else if (st.selTool === "group") {
          run("selection.select", {
            by: nd.row >= 0 ? { kind: "group", from: nd.row + 1 } : { kind: "uids", uids: [nd.uid] },
            op,
          });
        } else if (st.selTool === "column")
          run("selection.select", { by: { kind: "column", uid: nd.uid }, op });
        else if (st.selTool === "hood") {
          run("selection.select", { by: { kind: "neighborhood", uid: nd.uid, hops: st.hops }, op });
        } else if (st.selTool === "path") {
          if (st.pathA === null) setTools({ pathA: nd.uid });
          else {
            run("selection.select", {
              by: { kind: st.pathByYarn ? "pathYarn" : "pathShortest", a: st.pathA, b: nd.uid },
              op,
            });
            setTools({ pathA: null });
          }
        }
        return;
      }
      if (!nd) return;
      const prop = st.mode === "yarn" ? "yarn" : "tension";
      if (st.brushTool === "dropper") {
        const r = run("tool.eyedropper", { uid: nd.uid, prop }) as { value: string | number } | undefined;
        if (r) setTools(prop === "yarn" ? { yarn: String(r.value) } : { tension: Number(r.value) });
      } else if (st.brushTool === "bucket") {
        run("tool.bucket", { uid: nd.uid, prop, value: valueNow(st) });
      } else {
        run("tool.brush", { uid: nd.uid, hops: st.hops, prop, value: valueNow(st) });
      }
    },
    onScreen(shape, xy, mods, visible) {
      const c = ctx();
      const range = c.range();
      const mine = range ? xy.slice(range.offset * 2, (range.offset + range.count) * 2) : xy;
      const params: Record<string, unknown> = { xy: mine, shape, op: opOf(mods) };
      if (st.visibleOnly) {
        const lo = range?.offset ?? 0;
        const hi = lo + (range?.count ?? Number.POSITIVE_INFINITY);
        params.visible = visible()
          .filter((i) => i >= lo && i < hi)
          .map((i) => c.node(i)?.uid)
          .filter((u): u is number => u !== undefined);
      }
      run("selection.screen", params);
    },
    onStroke(id, first) {
      const nd = ctx().node(id);
      if (!nd) return;
      if (first) {
        setTools({ stroking: true });
        focus(nd);
        // um traço inteiro de pincel é um passo só de desfazer
        run("history.begin", {});
      }
      run("tool.brush", {
        uid: nd.uid,
        hops: st.hops,
        prop: st.mode === "yarn" ? "yarn" : "tension",
        value: valueNow(st),
      });
    },
    onStrokeEnd() {
      setTools({ stroking: false });
      run("history.end", {});
    },
  };
}

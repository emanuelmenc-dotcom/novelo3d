// SPDX-License-Identifier: GPL-3.0-or-later
// Componente React da vista 3D: monta o three.js uma vez e repassa dados, grafo e destaque.
import { useEffect, useRef } from "react";
import { setLastCamera } from "./cameraStore.ts";
import {
  type Handlers,
  type LayoutData,
  mountView3D,
  type NodeMeta,
  type Tool,
  type View3D,
  type ViewCubeOptions,
} from "./view3d.ts";

declare global {
  interface Window {
    /** Exposto para os testes de navegador. */
    __view3d?: View3D;
  }
}

export function Viewer3D(props: {
  layout: LayoutData | null;
  showGraph: boolean;
  rows: number[] | null;
  /** Peça cujas voltas/seleção aparecem destacadas (montagem). */
  activePart?: string;
  cube: ViewCubeOptions;
  tool: Tool;
  handlers: Handlers;
  /** Uids dos pontos selecionados (azul). */
  selection: number[] | null;
  onSelect: (node: NodeMeta | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<View3D | null>(null);
  const cb = useRef(props.onSelect);
  cb.current = props.onSelect;
  const cubeRef = useRef(props.cube);
  cubeRef.current = props.cube;

  useEffect(() => {
    if (!box.current) return;
    const v = mountView3D(box.current, (n) => cb.current(n), cubeRef.current);
    view.current = v;
    window.__view3d = v;
    return () => {
      const c = v.cameraState();
      setLastCamera(c);
      v.dispose();
      if (window.__view3d === v) window.__view3d = undefined;
      view.current = null;
    };
  }, []);
  useEffect(() => {
    view.current?.setData(props.layout);
  }, [props.layout]);
  useEffect(() => {
    view.current?.setTool(props.tool);
  }, [props.tool]);
  useEffect(() => {
    view.current?.setHandlers(props.handlers);
  }, [props.handlers]);
  useEffect(() => {
    view.current?.setSelectionUids(props.selection, props.activePart);
  }, [props.selection, props.activePart]);
  useEffect(() => {
    view.current?.setShowGraph(props.showGraph);
  }, [props.showGraph]);
  useEffect(() => {
    view.current?.highlightRows(props.rows, props.activePart);
  }, [props.rows, props.activePart]);
  useEffect(() => {
    view.current?.setViewCube(props.cube);
  }, [props.cube]);

  return <div ref={box} className="view3d" data-testid="scene" />;
}

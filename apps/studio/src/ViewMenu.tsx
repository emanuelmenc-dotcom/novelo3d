// SPDX-License-Identifier: GPL-3.0-or-later
// Menu de vista: um botão ao lado do cubo (no canto configurado) que abre as ferramentas de vista (ajustar, vistas padrão,
// só linhas, grafo, tela cheia). Fica no DOM, então continua acessível quando o cubo some num 3D pequeno.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.tsx";
import type { ViewCubeOptions } from "./view3d.ts";
import { VIEWS } from "./views.ts";

export function ViewMenu(props: {
  cube: ViewCubeOptions;
  wire: boolean;
  showGraph: boolean;
  showWireOption: boolean;
  onWire: (v: boolean) => void;
  onGraph: (v: boolean) => void;
  fullscreenTarget: () => HTMLElement | null;
}) {
  const { cube, wire, showGraph, showWireOption, onWire, onGraph, fullscreenTarget } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const bottom = cube.position.startsWith("bottom");
  const left = cube.position.endsWith("left");
  // o botão fica ao lado do cubo, do lado de dentro do 3D
  const style = {
    [bottom ? "bottom" : "top"]: 8,
    [left ? "left" : "right"]: cube.size + 12,
  } as React.CSSProperties;

  return (
    <div className="view-menu" ref={ref} style={style} data-testid="view-menu-wrap">
      <button
        type="button"
        className="view-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Vista e ferramentas de vista"
        data-testid="view-menu"
        onClick={() => setOpen(!open)}
      >
        <Icon name="cube" size={16} />
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Vista"
          className={`menu-pop view-pop ${bottom ? "up" : "down"} ${left ? "l" : "r"}`}
        >
          <button
            type="button"
            role="menuitem"
            title="Ajustar à peça (F)"
            onClick={() => {
              window.__view3d?.fit();
              setOpen(false);
            }}
          >
            <Icon name="fit" size={16} /> Ajustar
          </button>
          <div className="menu-title">Vistas</div>
          <div className="views" data-testid="views">
            {Object.entries(VIEWS).map(([key, v]) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                title={`${v.name} (${key})`}
                onClick={() => {
                  window.__view3d?.snapView([...v.dir] as [number, number, number]);
                  setOpen(false);
                }}
              >
                {v.name}
              </button>
            ))}
          </div>
          <div className="menu-title">Exibição</div>
          <label>
            <input type="checkbox" checked={showGraph} onChange={(e) => onGraph(e.target.checked)} /> Mostrar
            grafo (ligações)
          </label>
          {showWireOption && (
            <label>
              <input
                type="checkbox"
                data-testid="wire-toggle"
                checked={wire}
                onChange={(e) => onWire(e.target.checked)}
              />{" "}
              Só linhas (vermelho/azul)
            </label>
          )}
          <button
            type="button"
            role="menuitem"
            data-testid="view-fullscreen"
            onClick={() => {
              const el = fullscreenTarget();
              setOpen(false);
              if (document.fullscreenElement) void document.exitFullscreen();
              else void el?.requestFullscreen?.();
            }}
          >
            <Icon name="full" size={16} /> Tela cheia do 3D
          </button>
        </div>
      )}
    </div>
  );
}

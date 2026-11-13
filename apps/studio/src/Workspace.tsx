// SPDX-License-Identifier: GPL-3.0-or-later
// Espaço de trabalho modular: desenha a árvore de janelas do modelo (packages/commands/src/workspace.ts).
// Divisores arrastáveis (tamanho editável), abas arrastáveis entre janelas, janela encolhida numa barra e zonas de
// soltar nas bordas para dividir. Toda alteração passa pelos comandos workspace.* (D-21), então o MCP faz o mesmo.
import {
  BAR_PX,
  compactLayout,
  dispatch,
  type Leaf,
  layoutMinSize,
  leaves,
  minSize,
  type Node,
  PANEL_TITLES,
  type PanelId,
  type PanelMins,
  panelMins,
  SPLITTER_PX,
  type Split,
  settingsSnapshot,
  subscribeSettings,
  subscribeWorkspace,
  visiblePanels,
  workspaceSnapshot,
  type Zone,
} from "@novelo/commands";
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { setVisiblePanels } from "./visibility.ts";

export type PanelRenderers = Record<PanelId, () => ReactNode>;

const DRAG_TYPE = "text/x-novelo-panel";
const MIN_FRACTION = 0.06;
/** Tamanhos do modelo estão em pixels na escala 100%; no CSS viram rem, que acompanha a escala da interface. */
const rem = (px: number): string => `${px / 16}rem`;
/** Pixels reais de 1 "pixel de modelo" na escala atual da interface. */
const pxScale = (): number => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;

const MinsContext = createContext<PanelMins>(panelMins(320));

const isCollapsed = (n: Node): boolean => n.type === "leaf" && n.collapsed;
const safe = (method: string, params: Record<string, unknown>) => {
  try {
    dispatch(method, params);
  } catch {
    // ação recusada pelo modelo (ex.: ocultar o último painel): nada a fazer
  }
};

export function Workspace({ render }: { render: PanelRenderers }) {
  const ws = useSyncExternalStore(subscribeWorkspace, workspaceSnapshot);
  const settings = useSyncExternalStore(subscribeSettings, settingsSnapshot);
  const rootRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [compactPanel, setCompactPanel] = useState<PanelId | undefined>(undefined);
  const mins = panelMins(settings.interface.min3d);

  // mede a área disponível; a escala atual é lida a cada renderização (o app a aplica antes de avisar o React)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // modo compacto: se as janelas não cabem, mostra todos os painéis como abas de uma só janela (sem mexer no layout salvo)
  const need = layoutMinSize(ws.layout, mins);
  const sc = area ? pxScale() : 1;
  const tooSmall = area !== null && (area.w < need.w * sc - 1 || area.h < need.h * sc - 1);
  const compact = settings.interface.autoCompact && tooSmall && leaves(ws.layout).length > 1;

  // diz ao app o que está à vista (no modo compacto só a aba ativa; senão a aba ativa de cada janela aberta)
  const compactLeaf = compact ? (compactLayout(ws.layout, compactPanel).root as Leaf) : null;
  const shownNow = compactLeaf
    ? new Set<PanelId>([compactLeaf.tabs[compactLeaf.active] as PanelId])
    : visiblePanels(ws.layout);
  useEffect(() => {
    setVisiblePanels(shownNow);
  });

  return (
    <div className="ws-root" data-testid="workspace" data-compact={compact ? "true" : "false"} ref={rootRef}>
      <MinsContext.Provider value={mins}>
        {compact ? (
          <CompactView
            render={render}
            prefer={compactPanel}
            onPick={setCompactPanel}
            visible={visiblePanels(ws.layout)}
            layoutNode={compactLayout(ws.layout, compactPanel).root as Leaf}
          />
        ) : (
          <div
            className="ws-fit"
            style={{ minWidth: rem(need.w), minHeight: rem(need.h) }}
            data-testid="ws-fit"
          >
            <NodeView node={ws.layout.root} render={render} parentDir={null} />
          </div>
        )}
      </MinsContext.Provider>
    </div>
  );
}

/** Janela estreita: uma única janela com abas, só para exibir (o layout salvo não muda). */
function CompactView(props: {
  render: PanelRenderers;
  prefer: PanelId | undefined;
  onPick: (p: PanelId) => void;
  visible: Set<PanelId>;
  layoutNode: Leaf;
}) {
  const { layoutNode: leaf } = props;
  const active = leaf.tabs[leaf.active] as PanelId;
  return (
    <section className="ws-leaf ws-compact" data-compact-leaf="true">
      <div className="ws-head" role="tablist" aria-label="Abas da janela">
        {leaf.tabs.map((p, i) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={i === leaf.active}
            className={i === leaf.active ? "ws-tab on" : "ws-tab"}
            onClick={() => props.onPick(p)}
          >
            {PANEL_TITLES[p]}
          </button>
        ))}
        <span className="ws-spacer" />
        <span className="ws-note" title="Ajuste em Configurações > Interface">
          janela estreita: painéis em abas
        </span>
      </div>
      <div className="ws-body" data-panel={active}>
        {props.render[active]()}
      </div>
    </section>
  );
}

function NodeView(props: { node: Node; render: PanelRenderers; parentDir: "row" | "column" | null }) {
  return props.node.type === "leaf" ? (
    <LeafView leaf={props.node} render={props.render} parentDir={props.parentDir} />
  ) : (
    <SplitView split={props.node} render={props.render} />
  );
}

function SplitView({ split, render }: { split: Split; render: PanelRenderers }) {
  const ref = useRef<HTMLDivElement>(null);
  const mins = useContext(MinsContext);
  const horizontal = split.dir === "row";

  const startDrag = (index: number, e: React.PointerEvent) => {
    const box = ref.current;
    const a = split.children[index] as Node;
    const b = split.children[index + 1] as Node;
    if (!box || isCollapsed(a) || isCollapsed(b)) return;
    e.preventDefault();
    const k = pxScale();
    const total = horizontal ? box.clientWidth : box.clientHeight;
    const fixed =
      split.children.reduce((s, c) => s + (isCollapsed(c) ? BAR_PX * k : 0), 0) +
      (split.children.length - 1) * SPLITTER_PX * k;
    const room = Math.max(1, total - fixed);
    const open = split.children.reduce((s, c, i) => s + (isCollapsed(c) ? 0 : (split.sizes[i] as number)), 0);
    const start = horizontal ? e.clientX : e.clientY;
    const sizes0 = [...split.sizes];
    // limite: nenhuma das duas janelas passa do tamanho mínimo dos seus painéis (o do 3D é configurável)
    const minFrac = (n: Node) =>
      Math.max(MIN_FRACTION, (((horizontal ? minSize(n, mins).w : minSize(n, mins).h) * k) / room) * open);
    const move = (ev: PointerEvent) => {
      let d = (((horizontal ? ev.clientX : ev.clientY) - start) * open) / room;
      const sa = sizes0[index] as number;
      const sb = sizes0[index + 1] as number;
      const loA = Math.min(minFrac(a), sa); // se já estava abaixo do mínimo, não piora
      const loB = Math.min(minFrac(b), sb);
      d = Math.min(Math.max(d, loA - sa), sb - loB);
      const sizes = [...sizes0];
      sizes[index] = sa + d;
      sizes[index + 1] = sb - d;
      safe("workspace.setSizes", { split: split.id, sizes });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("ws-dragging");
    };
    document.body.classList.add("ws-dragging");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={ref} className={`ws-split ws-${split.dir}`} data-split={split.id}>
      {split.children.map((c, i) => (
        <Fragment key={c.id}>
          <div
            className="ws-cell"
            style={
              isCollapsed(c)
                ? { flex: `0 0 ${rem(BAR_PX)}` }
                : {
                    flex: `${split.sizes[i]} 1 0`,
                    minWidth: rem(minSize(c, mins).w),
                    minHeight: rem(minSize(c, mins).h),
                  }
            }
          >
            <NodeView node={c} render={render} parentDir={split.dir} />
          </div>
          {i < split.children.length - 1 && (
            // biome-ignore lint/a11y/useSemanticElements: divisor arrastável; <hr> não aceita ponteiro nem foco
            <div
              role="separator"
              tabIndex={0}
              aria-orientation={horizontal ? "vertical" : "horizontal"}
              aria-valuenow={Math.round((split.sizes[i] as number) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Redimensionar janelas"
              className={`ws-splitter ws-splitter-${split.dir}`}
              data-testid={`splitter-${split.id}-${i}`}
              style={{ flex: `0 0 ${rem(SPLITTER_PX)}` }}
              onPointerDown={(e) => startDrag(i, e)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.05 : 0.02;
                const back = horizontal ? "ArrowLeft" : "ArrowUp";
                const fwd = horizontal ? "ArrowRight" : "ArrowDown";
                if (e.key === back || e.key === fwd) {
                  e.preventDefault();
                  safe("workspace.resize", {
                    split: split.id,
                    index: i,
                    delta: e.key === fwd ? step : -step,
                  });
                }
              }}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

function zoneAt(e: React.DragEvent<HTMLElement>): Zone {
  const r = e.currentTarget.getBoundingClientRect();
  const fx = (e.clientX - r.left) / Math.max(1, r.width);
  const fy = (e.clientY - r.top) / Math.max(1, r.height);
  if (fx < 0.25) return "left";
  if (fx > 0.75) return "right";
  if (fy < 0.25) return "top";
  if (fy > 0.75) return "bottom";
  return "center";
}
const hasPanel = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(DRAG_TYPE);

function LeafView({
  leaf,
  render,
  parentDir,
}: {
  leaf: Leaf;
  render: PanelRenderers;
  parentDir: "row" | "column" | null;
}) {
  const [zone, setZone] = useState<Zone | null>(null);
  const active = leaf.tabs[leaf.active] as PanelId;
  const titles = leaf.tabs.map((p) => PANEL_TITLES[p]).join(" · ");

  const drop = (e: React.DragEvent, z: Zone) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = e.dataTransfer.getData(DRAG_TYPE);
    setZone(null);
    if (panel) safe("workspace.movePanel", { panel, leaf: leaf.id, zone: z });
  };
  const over = (e: React.DragEvent<HTMLElement>, z: Zone | "auto") => {
    if (!hasPanel(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setZone(z === "auto" ? zoneAt(e) : z);
  };
  const leave = (e: React.DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setZone(null);
  };

  if (leaf.collapsed) {
    const vertical = parentDir === "row";
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: barra recolhida, alvo de soltar painéis
      <section
        className={`ws-bar ${vertical ? "ws-bar-v" : "ws-bar-h"}`}
        data-leaf={leaf.id}
        data-collapsed="true"
        onDragOver={(e) => over(e, "center")}
        onDragLeave={leave}
        onDrop={(e) => drop(e, "center")}
      >
        <button
          type="button"
          className="ws-bar-btn"
          aria-label={`Restaurar ${titles}`}
          title="Restaurar janela"
          onClick={() => safe("workspace.collapse", { leaf: leaf.id, collapsed: false })}
        >
          <span aria-hidden="true">{vertical ? "▸" : "▾"}</span> {titles}
        </button>
      </section>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: janela, alvo de soltar painéis nas bordas
    <section
      className="ws-leaf"
      data-leaf={leaf.id}
      onDragOver={(e) => over(e, "auto")}
      onDragLeave={leave}
      onDrop={(e) => drop(e, zoneAt(e))}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: faixa de abas, alvo de soltar painéis */}
      <div
        className="ws-head"
        role="tablist"
        aria-label="Abas da janela"
        onDragOver={(e) => {
          e.stopPropagation();
          over(e, "center");
        }}
        onDrop={(e) => drop(e, "center")}
      >
        {leaf.tabs.map((p, i) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={i === leaf.active}
            className={i === leaf.active ? "ws-tab on" : "ws-tab"}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, p);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => safe("workspace.setActive", { panel: p })}
            title="Arraste para outra janela ou borda"
          >
            {PANEL_TITLES[p]}
          </button>
        ))}
        <span className="ws-spacer" />
        <button
          type="button"
          className="ws-ctl"
          aria-label={`Encolher ${PANEL_TITLES[active]}`}
          title="Encolher em barra"
          onClick={() => safe("workspace.collapse", { leaf: leaf.id, collapsed: true })}
        >
          –
        </button>
        <button
          type="button"
          className="ws-ctl"
          aria-label={`Ocultar ${PANEL_TITLES[active]}`}
          title="Ocultar painel (volte pelo menu Layout)"
          onClick={() => safe("workspace.hidePanel", { panel: active })}
        >
          ×
        </button>
      </div>
      <div className="ws-body" data-panel={active}>
        {render[active]()}
      </div>
      {zone && <div className={`ws-drop ws-drop-${zone}`} data-zone={zone} />}
    </section>
  );
}

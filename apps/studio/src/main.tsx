// SPDX-License-Identifier: GPL-3.0-or-later
// Studio: receita -> verificação -> gráfico circular -> 3D -> texto CrochetPARADE, organizados em janelas modulares
// (espaço de trabalho): cada seção é um painel que pode ser redimensionado, encolhido numa barra, agrupado em
// abas e reorganizado por presets ou layouts do usuário.
import {
  dispatch,
  editSnapshot,
  exportEditAll,
  exportPaintAll,
  exportParts,
  loadEditAll,
  loadPaintAll,
  loadParts,
  loadWorkspace,
  type PanelId,
  paintSnapshot,
  partsSnapshot,
  renderSnapshot,
  rootOf,
  settingsSnapshot,
  subscribeEdit,
  subscribePaint,
  subscribeParts,
  subscribeRender,
  subscribeSettings,
  subscribeWorkspace,
} from "@novelo/commands";
import { StrictMode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { AssemblyPanel } from "./AssemblyPanel.tsx";
import { type BridgeState, startBridge } from "./bridge.ts";
import { lastCamera } from "./cameraStore.ts";
import { FloatingWindow } from "./FloatingWindow.tsx";
import { LayoutMenu } from "./LayoutMenu.tsx";
import { MaterialsPanel } from "./MaterialsPanel.tsx";
import { PointsPanel } from "./PointsPanel.tsx";
import { makeHandlers, subscribeTools, toolSnapshot, viewerTool } from "./pointtools.ts";
import { RenderPanel } from "./render/RenderPanel.tsx";
import { installRenderJob, renderGeomChanged, setRenderSource } from "./render/renderJob.ts";
import { SettingsDialog } from "./SettingsDialog.tsx";
import "./styles.css";
import { Viewer3D } from "./Viewer3D.tsx";
import type { LayoutData, NodeMeta } from "./view3d.ts";
import { subscribeVisible, visibleSnapshot } from "./visibility.ts";
import { type PanelRenderers, Workspace } from "./Workspace.tsx";
import { YarnsPanel } from "./YarnsPanel.tsx";

const EXEMPLO = `V1: 6 pb no anel mágico (6)
V2: 6 aum (12)
V3: (1 pb, 1 aum) x6 (18)
V4: (2 pb, 1 aum) x6 (24)
V5: (3 pb, 1 aum) x6 (30)
V6: (4 pb, 1 aum) x6 (36)
V7–12: 1 pb em cada ponto (36)
V13: (4 pb, 1 dim) x6 (30)
V14: (3 pb, 1 dim) x6 (24)
V15: (2 pb, 1 dim) x6 (18)
V16: (1 pb, 1 dim) x6 (12)
V17: 6 dim (6)`;

interface Issue {
  code: string;
  message: string;
  severity?: string;
}
interface VerifyOut {
  ok: boolean;
  dialect: string;
  detected: string | null;
  table: {
    label: string;
    instruction: string;
    expected?: number;
    found: number;
    status: string;
    ok: boolean;
  }[];
  totalCounted: number;
  issues: Issue[];
}
interface ChartOut {
  pages: { label: string; svg: string; overlaps: number }[];
}
interface LayoutOut extends LayoutData {
  stats: { nodes: number; edges: number; meanEdge: number; mode: string };
  rows: { label: string }[];
}

/** Vistas padrão, com as teclas do FreeCAD. Eixo Z para cima; "frente" olha de -Y para +Y. */
const VIEWS = {
  "1": { name: "Frente", dir: [0, -1, 0] },
  "2": { name: "Topo", dir: [0, 0, 1] },
  "3": { name: "Direita", dir: [1, 0, 0] },
  "4": { name: "Trás", dir: [0, 1, 0] },
  "5": { name: "Base", dir: [0, 0, -1] },
  "6": { name: "Esquerda", dir: [-1, 0, 0] },
  "0": { name: "Isométrica", dir: [1, -1, 1] },
} as const satisfies Record<string, { name: string; dir: [number, number, number] }>;

// Configurações e layouts: carregados do navegador ao iniciar e gravados a cada mudança
// (sem erro se o navegador bloquear o armazenamento).
const SETTINGS_KEY = "novelo3d.settings";
const WORKSPACE_KEY = "novelo3d.workspace";
const PROJECT_KEY = "novelo3d.project"; // paleta, pintura, receita e dialeto
try {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) dispatch("settings.set", JSON.parse(saved));
} catch {
  // armazenamento indisponível ou valor antigo/inválido: segue com o padrão
}
try {
  const saved = localStorage.getItem(WORKSPACE_KEY);
  if (saved) loadWorkspace(JSON.parse(saved));
} catch {
  // idem: layout padrão
}
installRenderJob();

/** Escala da interface e do texto: variáveis lidas pelo CSS (html: 16px x --ui; textos: x --text). */
function applyScale(s: { interface: { scale: number; textScale: number } }) {
  const root = document.documentElement.style;
  root.setProperty("--ui", String(s.interface.scale / 100));
  root.setProperty("--text", String(s.interface.textScale / 100));
}
applyScale(settingsSnapshot());
const EDIT_KEY = "novelo3d.edit"; // fio e tensão por ponto, de cada peça
const PARTS_KEY = "novelo3d.parts"; // peças, receitas e costuras
function readJson(key: string): unknown {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : undefined;
  } catch {
    return undefined; // armazenamento indisponível ou valor inválido: segue com o padrão
  }
}
{
  // formato antigo: a receita e o dialeto ficavam junto com a paleta; viram a peça 1
  const legacy = (readJson(PROJECT_KEY) ?? {}) as { text?: string; dialect?: string };
  const d = legacy.dialect;
  loadParts(readJson(PARTS_KEY), {
    text: typeof legacy.text === "string" ? legacy.text : EXEMPLO,
    ...(d === "pt-BR" || d === "en-US" || d === "en-UK" ? { dialect: d } : {}),
  });
  const root = rootOf(partsSnapshot().active).id;
  loadPaintAll(readJson(PROJECT_KEY), root);
  loadEditAll(readJson(EDIT_KEY), root);
}
let editTimer: ReturnType<typeof setTimeout> | undefined;
subscribeEdit(() => {
  // grava com atraso: um arrasto de pincel dispara muitas edições seguidas
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    try {
      localStorage.setItem(EDIT_KEY, JSON.stringify(exportEditAll(partsSnapshot().parts.map((q) => q.id))));
    } catch {
      // sem persistência: vale só nesta sessão
    }
  }, 400);
});
subscribePaint(() => {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(exportPaintAll(partsSnapshot().parts.map((q) => q.id))));
  } catch {
    // sem persistência: vale só nesta sessão
  }
});
let partsTimer: ReturnType<typeof setTimeout> | undefined;
subscribeParts(() => {
  clearTimeout(partsTimer);
  partsTimer = setTimeout(() => {
    try {
      const ids = partsSnapshot().parts.map((q) => q.id);
      localStorage.setItem(PARTS_KEY, JSON.stringify(exportParts()));
      // copiar, remover/desfazer e destacar peças mexem nas edições e na pintura delas: grava junto
      localStorage.setItem(EDIT_KEY, JSON.stringify(exportEditAll(ids)));
      localStorage.setItem(PROJECT_KEY, JSON.stringify(exportPaintAll(ids)));
    } catch {
      // sem persistência: vale só nesta sessão
    }
  }, 300);
});
subscribeSettings((s) => {
  applyScale(s);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // sem persistência: vale só nesta sessão
  }
});
subscribeWorkspace((w) => {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(w));
  } catch {
    // sem persistência: vale só nesta sessão
  }
});

const call = <T,>(method: string, params: Record<string, unknown>): T => dispatch(method, params) as T;

function App() {
  // a receita e o dialeto são os da peça ativa (instâncias e espelhadas mostram os da original)
  const partsState = useSyncExternalStore(subscribeParts, partsSnapshot);
  const rootPart = rootOf(partsState.active);
  const text = rootPart.text;
  const dialect = rootPart.dialect ?? "auto";
  const setText = (t: string) =>
    dispatch("parts.setText", {
      id: rootPart.id,
      text: t,
      ...(rootPart.dialect ? { dialect: rootPart.dialect } : {}),
    });
  const setDialect = (d: string) =>
    dispatch("parts.setText", {
      id: rootPart.id,
      text: rootPart.text,
      ...(d !== "auto" ? { dialect: d } : {}),
    });
  const multi = partsState.parts.length > 1 || partsState.seams.length > 0;
  // confirma a receita quando a digitação para: só daí os uids passam a ser realinhados contra ela
  // biome-ignore lint/correctness/useExhaustiveDependencies: o texto e o dialeto da peça disparam a confirmação
  useEffect(() => {
    const id = rootPart.id;
    const t = setTimeout(() => {
      try {
        dispatch("parts.commitText", { id });
      } catch {
        // receita inválida: segue sem confirmar
      }
    }, 600);
    return () => clearTimeout(t);
  }, [rootPart.id, rootPart.text, rootPart.dialect]);
  const paintState = useSyncExternalStore(subscribePaint, paintSnapshot);
  const [beginner, setBeginner] = useState(true);
  const [page, setPage] = useState(0);
  const [bridge, setBridge] = useState<BridgeState>("off");
  const [showGraph, setShowGraph] = useState(false);
  const [selLabel, setSelLabel] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<NodeMeta | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const settings = useSyncExternalStore(subscribeSettings, settingsSnapshot);
  const visible = useSyncExternalStore(subscribeVisible, visibleSnapshot);
  const show3d = visible.has("view3d");
  const rstate = useSyncExternalStore(subscribeRender, renderSnapshot).state;
  const showRender = visible.has("render") || rstate === "running" || rstate === "paused";
  const edit = useSyncExternalStore(subscribeEdit, editSnapshot);
  const tools = useSyncExternalStore(subscribeTools, toolSnapshot);
  // durante um arrasto de pincel o recálculo espera o fim (a prévia vem depois de soltar)
  const pverRef = useRef(edit.pver);
  if (!tools.stroking) pverRef.current = edit.pver;
  const pver = pverRef.current;

  useEffect(() => {
    const port = Number(new URLSearchParams(location.search).get("bridge") ?? 47821);
    return startBridge(port, setBridge);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a pintura e a paleta (estado dos comandos) também invalidam
  const view = useMemo(() => {
    try {
      const params = { text, dialect };
      const verify = call<VerifyOut>("pattern.verify", params);
      const chart = call<ChartOut>("chart.render", { ...params, beginner });
      const cp = call<{ text: string; issues: Issue[] }>("pattern.toCp", params);
      return { verify, chart, cp, error: null as string | null };
    } catch (e) {
      return { verify: null, chart: null, cp: null, error: (e as Error).message };
    }
  }, [text, dialect, beginner, paintState, pver]);

  // posições 3D só são calculadas quando o painel 3D está à vista
  // biome-ignore lint/correctness/useExhaustiveDependencies: a pintura e a paleta (estado dos comandos) também invalidam
  const layout = useMemo(() => {
    if (!show3d && !showRender) return null;
    try {
      return multi
        ? call<LayoutOut>("assembly.layout", { include: true })
        : call<LayoutOut>("graph.layout", { text, dialect, include: true });
    } catch {
      return null;
    }
  }, [show3d, showRender, multi, partsState.version, text, dialect, paintState, pver]);
  // uids selecionados, em azul no 3D
  // biome-ignore lint/correctness/useExhaustiveDependencies: a versão da edição indica mudança da seleção
  const selection = useMemo(() => {
    if (!show3d) return null;
    try {
      const r = dispatch("selection.get", { text, dialect, all: true }) as { uids: number[] };
      return r.uids;
    } catch {
      return null;
    }
  }, [show3d, text, dialect, edit.version]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // o render busca as posições na hora do Play (mesmo sem a aba 3D ou Render à vista) e avisa se a geometria mudar
  const srcRef = useRef({ text, dialect, multi });
  srcRef.current = { text, dialect, multi };
  useEffect(() => {
    setRenderSource({
      layout: () => {
        const c = srcRef.current;
        try {
          return c.multi
            ? call<LayoutOut>("assembly.layout", { include: true })
            : call<LayoutOut>("graph.layout", { text: c.text, dialect: c.dialect, include: true });
        } catch {
          return null;
        }
      },
      selection: () => {
        const c = srcRef.current;
        try {
          const r = dispatch("selection.get", { text: c.text, dialect: c.dialect, all: true }) as {
            uids: number[];
          };
          return { uids: r.uids, part: c.multi ? partsSnapshot().active : null };
        } catch {
          return null;
        }
      },
      camera: () => {
        const c = window.__view3d?.cameraState() ?? lastCamera();
        return c ? { position: c.position, target: c.target, up: c.up } : null;
      },
    });
  }, []);
  useEffect(() => {
    if (showRender) renderGeomChanged(layout?.geomKey);
  }, [showRender, layout?.geomKey]);
  const handlers = useMemo(
    () =>
      makeHandlers(() => {
        // lê da peça ativa no momento do clique (um clique em outra peça a ativa antes de agir)
        const st = partsSnapshot();
        const root = rootOf(st.active);
        return {
          text: root.text,
          dialect: root.dialect ?? "auto",
          node: (id) => {
            const n = layoutRef.current?.nodes[id];
            return n && n.uid !== undefined
              ? { uid: n.uid, row: n.row, ...(n.part ? { part: n.part } : {}) }
              : undefined;
          },
          range: () => {
            const info = layoutRef.current?.parts?.find((q) => q.id === st.active);
            return info ? { offset: info.offset, count: info.count } : null;
          },
        };
      }),
    [],
  );
  const highlighted = useMemo(
    () =>
      layout && selLabel !== null ? layout.rows.flatMap((r, i) => (r.label === selLabel ? [i] : [])) : null,
    [layout, selLabel],
  );
  const onSelect3D = (n: NodeMeta | null) => {
    setSelNode(n);
    const label = n?.rowLabel ?? (layout && n && n.row >= 0 ? layout.rows[n.row]?.label : undefined);
    setSelLabel(label ?? null);
  };

  // atalhos de vista iguais aos do FreeCAD (só com o 3D à vista e fora de campos de texto)
  useEffect(() => {
    if (!show3d) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName)) return;
      const v = window.__view3d;
      if (!v) return;
      if (e.key === "f" || e.key === "F") v.fit();
      else if (e.key in VIEWS) v.snapView(VIEWS[e.key as keyof typeof VIEWS].dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show3d]);

  // Ctrl+Z / Ctrl+Y (ou Ctrl+Shift+Z) desfazem e refazem as edições por ponto, fora dos campos de texto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      try {
        if (k === "z" && !e.shiftKey) dispatch("history.undo");
        else if (k === "y" || (k === "z" && e.shiftKey)) dispatch("history.redo");
        else return;
        e.preventDefault();
      } catch {
        // nada para desfazer/refazer
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pages = view.chart?.pages ?? [];
  const current = pages[Math.min(page, Math.max(0, pages.length - 1))];
  const needsDialect = view.verify?.issues.some((i) => i.code === "AMBIGUOUS_DIALECT");

  const download = (name: string, content: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const panels: PanelRenderers = {
    recipe: () => (
      <div className="panel-col">
        {multi && (
          <div className="row">
            <label>
              Peça{" "}
              <select
                aria-label="Peça ativa"
                value={partsState.active}
                onChange={(e) => dispatch("parts.setActive", { id: e.target.value })}
              >
                {partsState.parts.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </label>
            {rootPart.id !== partsState.active && (
              <span className="hint">edita a original ({rootPart.name})</span>
            )}
          </div>
        )}
        <textarea
          aria-label="Receita"
          onBlur={() => {
            try {
              dispatch("parts.commitText", { id: rootPart.id });
            } catch {
              // receita inválida
            }
          }}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPage(0);
          }}
          spellCheck={false}
        />
        <div className="row">
          <label>
            Dialeto{" "}
            <select aria-label="Dialeto" value={dialect} onChange={(e) => setDialect(e.target.value)}>
              <option value="auto">Detectar</option>
              <option value="pt-BR">pt-BR</option>
              <option value="en-US">en-US</option>
              <option value="en-UK">en-UK</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={beginner} onChange={(e) => setBeginner(e.target.checked)} />{" "}
            Versão para iniciantes
          </label>
        </div>
        {view.verify?.detected && dialect === "auto" && (
          <p className="hint">Dialeto detectado: {view.verify.detected}. Confirme se está certo.</p>
        )}
        {needsDialect && (
          <p className="error">dc e tr mudam de significado entre US e UK. Escolha o dialeto.</p>
        )}
        {view.error && <p className="error">{view.error}</p>}
      </div>
    ),

    verify: () => (
      <div className="panel-col scroll">
        {view.verify && (
          <>
            <p data-testid="verify-summary" className={view.verify.ok ? "ok" : "error"}>
              {view.verify.ok ? "Receita fecha" : "Receita com problemas"} · {view.verify.totalCounted} pontos
            </p>
            <table data-testid="verify-table">
              <thead>
                <tr>
                  <th>Volta</th>
                  <th>Instrução</th>
                  <th>Esperada</th>
                  <th>Encontrada</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {view.verify.table.map((r) => (
                  <tr
                    key={r.label + r.instruction}
                    className={`${r.ok ? "" : "bad"} ${selLabel === r.label ? "sel" : ""}`}
                    onClick={() => setSelLabel(selLabel === r.label ? null : r.label)}
                  >
                    <td>{r.label}</td>
                    <td>{r.instruction}</td>
                    <td>{r.expected ?? "—"}</td>
                    <td>{r.found}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="issues">
              {view.verify.issues.map((i) => (
                <li key={i.code + i.message} className={i.severity === "error" ? "error" : "warn"}>
                  {i.message}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    ),

    chart: () => (
      <div className="panel-col scroll">
        {pages.length > 0 && (
          <>
            <div className="row">
              {pages.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  className={i === page ? "tab on" : "tab"}
                  onClick={() => setPage(i)}
                >
                  {p.label}
                </button>
              ))}
              <button type="button" onClick={() => window.print()}>
                Imprimir / PDF
              </button>
            </div>
            {current && (
              <div
                className="chart"
                data-testid="chart"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG gerado pelo próprio pacote charts
                dangerouslySetInnerHTML={{ __html: current.svg }}
              />
            )}
          </>
        )}
      </div>
    ),

    view3d: () => (
      <div className="panel-col">
        <div className="row">
          <label>
            <input type="checkbox" checked={showGraph} onChange={(e) => setShowGraph(e.target.checked)} />{" "}
            Mostrar grafo (ligações)
          </label>
          {layout && (
            <span className="hint">
              {layout.stats.nodes} nós · aresta média {layout.stats.meanEdge.toFixed(2)} · {layout.stats.mode}
            </span>
          )}
        </div>
        <div className="row views" data-testid="views">
          <button type="button" onClick={() => window.__view3d?.fit()} title="Ajustar à peça (F)">
            Ajustar
          </button>
          {Object.entries(VIEWS).map(([key, v]) => (
            <button
              key={key}
              type="button"
              title={`${v.name} (${key})`}
              onClick={() => window.__view3d?.snapView([...v.dir] as [number, number, number])}
            >
              {v.name}
            </button>
          ))}
        </div>
        <Viewer3D
          layout={layout}
          showGraph={showGraph}
          rows={highlighted}
          {...(multi ? { activePart: partsState.active } : {})}
          cube={settings.interface.viewCube}
          tool={viewerTool(tools)}
          handlers={handlers}
          selection={selection}
          onSelect={onSelect3D}
        />
        <p className="hint">
          Girar: botão esquerdo · Deslocar: botão do meio ou direito · Zoom: roda · Cubo no canto: clique numa
          face, aresta ou canto.
        </p>
        <p data-testid="node-info" className="hint">
          {selNode
            ? `#${selNode.uid} · Volta ${selNode.row >= 0 && layout ? layout.rows[selNode.row]?.label : "anel"}, ponto ${selNode.index + 1} · ${selNode.code}${selNode.parents.length > 0 ? ` · sai de ${selNode.parents.length} ponto(s) da volta anterior` : ""}`
            : "Clique num ponto para ver a volta na receita. Clique numa linha da tabela para destacar a volta."}
        </p>
      </div>
    ),

    assembly: () => <AssemblyPanel />,

    materials: () => <MaterialsPanel version={pver} />,

    render: () => <RenderPanel />,

    points: () => <PointsPanel text={text} dialect={dialect} selNode={selNode} />,

    yarns: () => <YarnsPanel text={text} dialect={dialect} selLabel={selLabel} selNode={selNode} />,

    cp: () => (
      <div className="panel-col">
        <textarea aria-label="Texto CrochetPARADE" readOnly value={view.cp?.text ?? ""} className="cp" />
        <div className="row">
          <button type="button" onClick={() => navigator.clipboard?.writeText(view.cp?.text ?? "")}>
            Copiar
          </button>
          <button type="button" onClick={() => download("receita.cp.txt", view.cp?.text ?? "")}>
            Baixar .txt
          </button>
        </div>
        {view.cp?.issues.map((i) => (
          <p key={i.message} className="warn">
            {i.message}
          </p>
        ))}
      </div>
    ),
  } satisfies Record<PanelId, () => React.ReactNode>;

  return (
    <div className="app">
      <header>
        <strong>Novelo3D</strong>
        <LayoutMenu />
        <button
          type="button"
          aria-pressed={showMaterials}
          onClick={() => setShowMaterials((v) => !v)}
          aria-label="Lista de materiais"
        >
          ▤ Lista de materiais
        </button>
        <button type="button" onClick={() => setShowSettings(true)} aria-label="Configurações">
          ⚙ Configurações
        </button>
        <span data-testid="bridge-state">
          ponte MCP: {bridge === "connected" ? "conectada" : "desconectada"}
        </span>
      </header>

      <Workspace render={panels} />

      {/* páginas do gráfico para impressão/PDF: ficam fora das janelas, só aparecem ao imprimir */}
      <div className="print-only" data-testid="print-pages">
        {pages.map((p) => (
          <div
            key={p.label}
            className="print-page"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG gerado pelo próprio pacote charts
            dangerouslySetInnerHTML={{ __html: p.svg }}
          />
        ))}
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showMaterials && (
        <FloatingWindow
          title="Lista de materiais"
          onClose={() => setShowMaterials(false)}
          testId="materials-window"
        >
          <MaterialsPanel version={pver} />
        </FloatingWindow>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

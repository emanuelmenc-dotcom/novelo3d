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
  exportTutorial,
  features,
  loadEditAll,
  loadPaintAll,
  loadParts,
  loadTutorial,
  loadWorkspace,
  type PanelId,
  paintSnapshot,
  partsSnapshot,
  readingOn,
  renderSnapshot,
  rootOf,
  settingsSnapshot,
  subscribeEdit,
  subscribePaint,
  subscribeParts,
  subscribeRender,
  subscribeSettings,
  subscribeTimeline,
  subscribeTutorial,
  subscribeWorkspace,
  tutorialVersion,
} from "@novelo/commands";
import { StrictMode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { AssemblyPanel } from "./AssemblyPanel.tsx";
import { type BridgeState, startBridge } from "./bridge.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import { lastCamera } from "./cameraStore.ts";
import { FloatingWindow } from "./FloatingWindow.tsx";
import { MaterialsPanel } from "./MaterialsPanel.tsx";
import { PropsPanel } from "./PropsPanel.tsx";
import { makeHandlers, subscribeTools, toolSnapshot, viewerTool } from "./pointtools.ts";
import { type ReadingData, ReadingMode } from "./ReadingMode.tsx";
import { Ribbon } from "./Ribbon.tsx";
import { RenderPanel } from "./render/RenderPanel.tsx";
import { installRenderJob, renderGeomChanged, setRenderSource } from "./render/renderJob.ts";
import { buildRibbonTabs } from "./ribbonTabs.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";
import { StitchEditorPanel } from "./StitchEditorPanel.tsx";
import { TimelineStrip } from "./TimelineStrip.tsx";
import { TitleBar } from "./TitleBar.tsx";
import { ToolOptionsBar } from "./ToolOptionsBar.tsx";
import { VIEWS } from "./views.ts";
import "./styles.css";
import { Viewer3D } from "./Viewer3D.tsx";
import type { LayoutData, NodeMeta, TutorialView } from "./view3d.ts";
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
if (features().render) installRenderJob(); // render pausado (D-57): sem assinatura nem trabalho em segundo plano

/** Escala da interface e do texto: variáveis lidas pelo CSS (html: 16px x --ui; textos: x --text). */
function applyScale(s: { interface: { scale: number; textScale: number } }) {
  const root = document.documentElement.style;
  root.setProperty("--ui", String(s.interface.scale / 100));
  root.setProperty("--text", String(s.interface.textScale / 100));
}
applyScale(settingsSnapshot());
const EDIT_KEY = "novelo3d.edit"; // fio e tensão por ponto, de cada peça
const PARTS_KEY = "novelo3d.parts"; // peças, receitas e costuras
const UI_KEY = "novelo3d.ui"; // versão da interface (migração única do layout e do cubo) e preferências do ribbon
const TUTORIAL_KEY = "novelo3d.tutorial"; // onde o usuário parou no tutorial, por peça
const TIMELINE_KEY = "novelo3d.timeline"; // linha do tempo: features e marcador (a base vai em outra chave, grava menos vezes)
const TIMELINE_BASE_KEY = "novelo3d.timeline.base";
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
    ...(d === "pt-BR" || d === "en-US" || d === "en-UK" || d === "xva" ? { dialect: d } : {}),
  });
  const root = rootOf(partsSnapshot().active).id;
  loadPaintAll(readJson(PROJECT_KEY), root);
  loadEditAll(readJson(EDIT_KEY), root);
  loadTutorial(readJson(TUTORIAL_KEY));
  // linha do tempo (desfazer) do navegador: só vale se reexecutá-la dá o projeto que acabou de ser carregado
  const tl = readJson(TIMELINE_KEY) as { base?: unknown } | undefined;
  if (tl) {
    const kept = JSON.parse(JSON.stringify(dispatch("project.export"))) as Record<string, unknown>;
    try {
      dispatch("timeline.load", { timeline: { ...tl, base: readJson(TIMELINE_BASE_KEY) } });
      dispatch("timeline.verify", { keep: true });
    } catch {
      // linha do tempo ilegível ou reexecução que lançou: o projeto volta como estava e abre sem histórico
      try {
        kept.timeline = undefined;
        dispatch("project.import", { project: kept });
      } catch {
        // nada a fazer: o projeto carregado já era o certo
      }
    }
  }
}
// gravação no navegador: se falhar (espaço cheio, armazenamento bloqueado), a tela avisa em vez de calar
// (uma chave grande pode falhar enquanto outra pequena grava: o aviso vale enquanto qualquer uma falhar)
const failedKeys = new Set<string>();
let saveFailed = false;
const saveListeners = new Set<() => void>();
function put(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    failedKeys.delete(key);
  } catch {
    failedKeys.add(key);
  }
  const failed = failedKeys.size > 0;
  if (failed !== saveFailed) {
    saveFailed = failed;
    for (const fn of saveListeners) fn();
  }
}
const subscribeSave = (fn: () => void) => {
  saveListeners.add(fn);
  return () => void saveListeners.delete(fn);
};
const saveFailedNow = () => saveFailed;
let editTimer: ReturnType<typeof setTimeout> | undefined;
subscribeEdit(() => {
  // grava com atraso: um arrasto de pincel dispara muitas edições seguidas
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    put(EDIT_KEY, JSON.stringify(exportEditAll(partsSnapshot().parts.map((q) => q.id))));
  }, 400);
});
subscribePaint(() => {
  put(PROJECT_KEY, JSON.stringify(exportPaintAll(partsSnapshot().parts.map((q) => q.id))));
});
let partsTimer: ReturnType<typeof setTimeout> | undefined;
subscribeParts(() => {
  clearTimeout(partsTimer);
  partsTimer = setTimeout(() => {
    const ids = partsSnapshot().parts.map((q) => q.id);
    put(PARTS_KEY, JSON.stringify(exportParts()));
    // copiar, remover/desfazer e destacar peças mexem nas edições e na pintura delas: grava junto
    put(EDIT_KEY, JSON.stringify(exportEditAll(ids)));
    put(PROJECT_KEY, JSON.stringify(exportPaintAll(ids)));
  }, 300);
});
subscribeTutorial(() => {
  put(TUTORIAL_KEY, JSON.stringify(exportTutorial()));
});
let tlTimer: ReturnType<typeof setTimeout> | undefined;
let tlBase: unknown;
subscribeTimeline(() => {
  // grava com atraso e só regrava a base quando ela muda (ela é a parte grande)
  clearTimeout(tlTimer);
  tlTimer = setTimeout(() => {
    const t = dispatch("timeline.save") as { base: unknown } | null;
    if (!t) {
      put(TIMELINE_KEY, "null");
      return;
    }
    if (t.base !== tlBase) {
      put(TIMELINE_BASE_KEY, JSON.stringify(t.base));
      tlBase = t.base;
    }
    put(TIMELINE_KEY, JSON.stringify({ ...t, base: undefined }));
  }, 500);
});
subscribeSettings((s) => {
  applyScale(s);
  put(SETTINGS_KEY, JSON.stringify(s));
});
subscribeWorkspace((w) => {
  put(WORKSPACE_KEY, JSON.stringify(w));
});

// interface 2 (ribbon, janelas independentes, cubo embaixo à esquerda): na primeira abertura troca o layout salvo pelo
// novo padrão e move o cubo; os layouts nomeados do usuário continuam na lista. Fica depois dos assinantes acima de propósito:
// a mudança tem de ser gravada, senão a próxima abertura traria o layout antigo de volta
try {
  const ui = (readJson(UI_KEY) ?? {}) as { version?: number; tab?: string; collapsed?: boolean };
  if (ui.version !== 2) {
    dispatch("workspace.applyPreset", { id: "edit" });
    dispatch("settings.set", { interface: { viewCube: { position: "bottom-left" } } });
    localStorage.setItem(UI_KEY, JSON.stringify({ ...ui, version: 2 }));
  }
} catch {
  // armazenamento indisponível: segue com o padrão
}

const call = <T,>(method: string, params: Record<string, unknown>): T => dispatch(method, params) as T;

function App() {
  // a receita e o dialeto são os da peça ativa (instâncias e espelhadas mostram os da original)
  const partsState = useSyncExternalStore(subscribeParts, partsSnapshot);
  const rootPart = rootOf(partsState.active);
  const text = rootPart.text;
  const dialect = rootPart.dialect ?? "auto";
  // receita grande: gráfico e 3D levam segundos, então só recalculam quando a digitação para (receita pequena: na hora)
  const slowCalc = useRef(false);
  const slow = slowCalc.current; // lido uma vez por desenho: o cálculo deste desenho só vale para o próximo
  const [calc, setCalc] = useState({ text, dialect });
  useEffect(() => {
    if (!slow) return void setCalc({ text, dialect });
    const t = setTimeout(() => setCalc({ text, dialect }), 700);
    return () => clearTimeout(t);
  }, [text, dialect, slow]);
  const ct = slow ? calc.text : text;
  const cd = slow ? calc.dialect : dialect;
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
  // com uma peça escondida o desenho vem da montagem (que sabe pular peças), mesmo com uma peça só
  const multi =
    partsState.parts.length > 1 || partsState.seams.length > 0 || partsState.parts.some((q) => q.hidden);
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
  const [wire, setWire] = useState(false);
  const [selLabel, setSelLabel] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<NodeMeta | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const settings = useSyncExternalStore(subscribeSettings, settingsSnapshot);
  const visible = useSyncExternalStore(subscribeVisible, visibleSnapshot);
  const reading = useSyncExternalStore(subscribeTutorial, readingOn);
  const show3d = visible.has("view3d") || reading;
  const rstate = useSyncExternalStore(subscribeRender, renderSnapshot).state;
  const [ribbonTab, setRibbonTab] = useState(() => {
    const ui = readJson(UI_KEY) as { tab?: string } | undefined;
    return typeof ui?.tab === "string" ? ui.tab : "receita";
  });
  const [ribbonCollapsed, setRibbonCollapsed] = useState(
    () => (readJson(UI_KEY) as { collapsed?: boolean } | undefined)?.collapsed === true,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  // a busca de comandos é do modo de edição: entrar na leitura a fecha, para não reaparecer ao sair
  useEffect(() => {
    if (reading) setPaletteOpen(false);
  }, [reading]);
  const saveUi = (patch: { tab?: string; collapsed?: boolean }) => {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({ ...((readJson(UI_KEY) as object) ?? {}), version: 2, ...patch }),
      );
    } catch {
      // preferência de tela: sem armazenamento, vale só nesta sessão
    }
  };
  const showTutorial = reading;
  const tutVersion = useSyncExternalStore(subscribeTutorial, tutorialVersion);
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
      const params = { text: ct, dialect: cd };
      const t0 = performance.now();
      const verify = call<VerifyOut>("pattern.verify", params);
      const chart = call<ChartOut>("chart.render", { ...params, beginner });
      const cp = call<{ text: string; issues: Issue[] }>("pattern.toCp", params);
      slowCalc.current = performance.now() - t0 > 150;
      return { verify, chart, cp, error: null as string | null };
    } catch (e) {
      return { verify: null, chart: null, cp: null, error: (e as Error).message };
    }
  }, [ct, cd, beginner, paintState, pver]);

  // posições 3D só são calculadas quando o painel 3D está à vista
  // biome-ignore lint/correctness/useExhaustiveDependencies: a pintura e a paleta (estado dos comandos) também invalidam
  const layout = useMemo(() => {
    if (!show3d && !showRender) return null;
    try {
      return multi
        ? call<LayoutOut>("assembly.layout", { include: true })
        : call<LayoutOut>("graph.layout", { text: ct, dialect: cd, include: true });
    } catch {
      return null;
    }
  }, [show3d, showRender, multi, partsState.version, ct, cd, paintState, pver]);
  // uids selecionados, em azul no 3D
  // biome-ignore lint/correctness/useExhaustiveDependencies: a versão da edição indica mudança da seleção
  const selection = useMemo(() => {
    if (!show3d) return null;
    try {
      const r = dispatch("selection.get", { text: ct, dialect: cd, all: true }) as { uids: number[] };
      return r.uids;
    } catch {
      return null;
    }
  }, [show3d, ct, cd, edit.version]);
  // passo atual do tutorial (só com a janela à vista); a receita grande usa o mesmo texto adiado do gráfico e do 3D
  // biome-ignore lint/correctness/useExhaustiveDependencies: a pintura e a edição (estado dos comandos) também invalidam
  const tut = useMemo(() => {
    if (!showTutorial) return null;
    try {
      const data = call<
        ReadingData & { doneThrough: number; step: { nodeIds: number[]; parentIds: number[] } | null }
      >("tutorial.get", { text: ct, dialect: cd, part: partsState.active });
      return { data, error: null as string | null };
    } catch (e) {
      return { data: null, error: (e as Error).message };
    }
  }, [showTutorial, ct, cd, partsState.active, tutVersion, paintState, pver]);
  // o mesmo passo, nos índices dos pontos da vista 3D (numa montagem a peça do tutorial começa no deslocamento dela)
  const tutorialView = useMemo((): TutorialView | null => {
    const step = tut?.data?.step;
    if (!tut?.data || !step || !layout) return null;
    const part = multi ? layout.parts?.find((q) => q.id === partsState.active) : undefined;
    const start = part?.offset ?? 0;
    // a peça ativa está escondida: não há o que destacar (o deslocamento dela já é o da peça seguinte)
    if (part && part.count === 0) return null;
    const end = start + (part?.count ?? layout.nodes.length);
    return {
      // no slide de estado nada fica em destaque: só o que já foi feito e o que falta
      current: step.kind === "state" ? [] : step.nodeIds.map((id) => id + start),
      parents: step.parentIds.map((id) => id + start),
      doneThrough: tut.data.doneThrough + start,
      start,
      end,
    };
  }, [tut, layout, multi, partsState.active]);
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
    if (!show3d || reading) return; // no modo de leitura F e os números são do próprio modo
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
  }, [show3d, reading]);

  // Ctrl+Z / Ctrl+Y (ou Ctrl+Shift+Z) desfazem e refazem as edições por ponto, fora dos campos de texto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (readingOn()) return; // no modo de leitura nada edita, nem desfazendo
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
  const saveBad = useSyncExternalStore(subscribeSave, saveFailedNow);
  const [projectMsg, setProjectMsg] = useState<string | null>(null);
  const saveProject = () => {
    download("projeto.novelo3d.json", JSON.stringify(dispatch("project.export")));
    setProjectMsg("Projeto salvo no arquivo projeto.novelo3d.json.");
  };
  const openProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error("arquivo grande demais");
      const project = JSON.parse(await file.text()) as unknown;
      dispatch("project.import", { project, check: true }); // arquivo errado nem oferece a troca
      if (!window.confirm("Abrir este projeto substitui o projeto atual. Salvou o atual? Continuar?")) return;
      const r = dispatch("project.import", { project }) as { parts: number };
      setProjectMsg(`Projeto aberto: ${file.name} (${r.parts} peça${r.parts === 1 ? "" : "s"}).`);
    } catch (e) {
      setProjectMsg(`Não consegui abrir o projeto: ${(e as Error).message}`);
    }
  };

  // ribbon: todas as ferramentas (botões) do app; as abas e a busca de comandos leem a mesma lista
  const hist = dispatch("history.get", {}) as { canUndo: boolean; canRedo: boolean };
  const runTool = (method: string, params: Record<string, unknown> = {}, withText = false) => {
    try {
      // o tutorial usa a mesma receita (adiada em receita grande) que o gráfico e o 3D
      const tutor = method.startsWith("tutorial.");
      dispatch(
        method,
        withText ? { text: tutor ? ct : text, dialect: tutor ? cd : dialect, ...params } : params,
      );
    } catch (e) {
      setProjectMsg((e as Error).message);
    }
  };
  const ribbonTabs = buildRibbonTabs({
    run: (m, p) => runTool(m, p),
    runText: (m, p) => runTool(m, p, true),
    save: saveProject,
    openFile: (f) => void openProject(f),
    settings: () => setShowSettings(true),
    materials: () => setShowMaterials((v) => !v),
    materialsOn: showMaterials,
    palette: () => setShowPalette((v) => !v),
    paletteOn: showPalette,
    print: () => window.print(),
    copyCp: () => void navigator.clipboard?.writeText(view.cp?.text ?? ""),
    downloadCp: () => download("receita.cp.txt", view.cp?.text ?? ""),
    tools,
    canUndo: hist.canUndo,
    canRedo: hist.canRedo,
    activePart: partsState.active,
    wire,
    showGraph,
    showWireOption: !features().realistic3d,
    setWire,
    setShowGraph,
    readingStart: () => runTool("tutorial.reading", { on: true }),
  });

  // Ctrl+K abre a busca de comandos, em qualquer lugar da tela
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!readingOn()) setPaletteOpen(true);
      } else if (e.key === "F9") {
        e.preventDefault();
        dispatch("tutorial.reading", {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const viewer3d = (
    <Viewer3D
      layout={layout}
      showGraph={showGraph}
      wire={wire}
      tutorial={tutorialView}
      rows={reading ? null : highlighted}
      {...(multi ? { activePart: partsState.active } : {})}
      cube={settings.interface.viewCube}
      // no modo de leitura o botão esquerdo só gira: nada de pintar nem selecionar
      tool={reading ? "orbit" : viewerTool(tools)}
      handlers={reading ? {} : handlers}
      selection={reading ? null : selection}
      onSelect={onSelect3D}
      onWire={setWire}
      onGraph={setShowGraph}
      showWireOption={!features().realistic3d}
    />
  );

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
              <option value="xva">XVA (X V A T F E)</option>
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
      <div className="panel-col view3d-col">
        <ToolOptionsBar
          tools={tools}
          selected={edit.selected}
          stats={
            layout
              ? `${layout.stats.nodes} nós · aresta média ${layout.stats.meanEdge.toFixed(2)} · ${layout.stats.mode}`
              : null
          }
        />
        {viewer3d}
        <TimelineStrip />
        <p data-testid="node-info" className="hint node-info">
          {selNode
            ? `#${selNode.uid} · Volta ${selNode.row >= 0 && layout ? layout.rows[selNode.row]?.label : "anel"}, ponto ${selNode.index + 1} · ${selNode.code}${selNode.parents.length > 0 ? ` · sai de ${selNode.parents.length} ponto(s) da volta anterior` : ""}`
            : "Clique num ponto para ver a volta na receita. Clique numa linha da tabela para destacar a volta."}
        </p>
      </div>
    ),

    tree: () => <AssemblyPanel sections={["tree"]} />,

    props: () => <PropsPanel text={text} dialect={dialect} selNode={selNode} />,

    render: () => <RenderPanel />,

    stitchEditor: () => <StitchEditorPanel />,

    cp: () => (
      <div className="panel-col">
        <textarea aria-label="Texto CrochetPARADE" readOnly value={view.cp?.text ?? ""} className="cp" />
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
      <TitleBar
        bridge={bridge}
        saveBad={saveBad}
        reading={reading}
        projectMsg={projectMsg}
        onSearch={() => setPaletteOpen(true)}
      />
      {reading ? (
        <ReadingMode
          data={tut?.data ?? null}
          error={tut?.error ?? null}
          countWarning={view.verify ? !view.verify.ok : false}
          params={() => ({ text: ct, dialect: cd, part: partsState.active })}
          onExit={() => dispatch("tutorial.reading", { on: false })}
          onShow={() => {
            const first = tutorialView?.current[0];
            if (first === undefined)
              window.__view3d?.fit(); // slide de estado: nenhum ponto em destaque
            else window.__view3d?.focusOn(first);
          }}
        >
          {viewer3d}
        </ReadingMode>
      ) : (
        <>
          <Ribbon
            tabs={ribbonTabs}
            active={ribbonTab}
            onTab={(id) => {
              setRibbonTab(id);
              saveUi({ tab: id });
            }}
            collapsed={ribbonCollapsed}
            onCollapse={(v) => {
              setRibbonCollapsed(v);
              saveUi({ collapsed: v });
            }}
          />
          {paletteOpen && <CommandPalette tabs={ribbonTabs} onClose={() => setPaletteOpen(false)} />}

          <Workspace render={panels} />
        </>
      )}

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
      {showPalette && !reading && (
        <FloatingWindow title="Paleta de fios" onClose={() => setShowPalette(false)} testId="yarns-window">
          <YarnsPanel text={text} dialect={dialect} selLabel={selLabel} selNode={selNode} />
        </FloatingWindow>
      )}
      {showMaterials && !reading && (
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

declare global {
  interface Window {
    /** Exposto para os testes de navegador: reexecuta a linha do tempo e confere que o projeto fica igual. */
    __timeline?: {
      verify: () => { ok: boolean; diff: string | null; features: number };
      run: (method: string, params?: Record<string, unknown>) => unknown;
    };
  }
}
window.__timeline = {
  verify: () => dispatch("timeline.verify") as { ok: boolean; diff: string | null; features: number },
  run: (method, params) => dispatch(method, params),
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

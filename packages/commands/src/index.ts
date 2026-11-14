// SPDX-License-Identifier: GPL-3.0-or-later
// Camada de comandos (D-21): toda função do app é um comando JSON -> JSON,
// chamável pela interface e pela ponte MCP. Sem DOM.
import { renderChart } from "@novelo/charts";
import {
  applyPaint,
  buildGraph,
  COLOR_KIND_NAMES,
  COLOR_KINDS,
  countYarnChanges,
  DEFAULT_SEGMENT_M,
  type Dialect,
  type Issue,
  MATERIALS,
  materialById,
  type PaintRegion,
  type Pattern,
  paintedYarns,
  paintIssues,
  REGION_NAMES,
  roundCount,
  STITCH_TYPES,
  stitchType,
  THICKNESS,
  thicknessById,
  thicknessRatio,
  validate,
  validateRegion,
  validateYarns,
  type Yarn,
  yarnColorAt,
  yarnCursor,
  yarnUsage,
} from "@novelo/core";
import { fromCp, parseCpDot, toCp } from "@novelo/interop";
import { parsePattern, printPattern, printPatternWithYarns, splitLines } from "@novelo/notation";
import { bandOf, MAX_LEGS, modelKey, tensionLevel } from "@novelo/stitch3d";
import { readingScript } from "@novelo/tutorial";
import { editCommands } from "./edit-commands.ts";
import {
  engineFor,
  lastLayoutKey,
  layoutCached,
  overrideRegions,
  refreshColumns,
  sizeOfTension,
} from "./edit-store.ts";
import { FEATURE_NAMES, featureOfMethod, features } from "./features.ts";
import { materialsCommands } from "./materials-commands.ts";
import {
  addRegion,
  clearPaint,
  nextYarnId,
  paintSnapshot,
  removeRegion,
  resetPaint,
  setYarns,
} from "./paint-store.ts";
import { partsCommands } from "./parts-commands.ts";
import { projectCommands } from "./project-commands.ts";
import {
  completeRender,
  failRender,
  infoRender,
  pauseRender,
  pngServed,
  progressRender,
  type RenderInfo,
  type RenderPatch,
  renderSnapshot,
  requestPng,
  resetRender,
  resumeRender,
  setRenderSettings,
  staleRender,
  startRender,
  stopRender,
} from "./render-store.ts";
import { getSettings, resetSettings, type SettingsPatch, setSettings } from "./settings.ts";
import { stitchEditorCommands } from "./stitch-editor-commands.ts";
import { type ScriptCtx, tutorialCommands } from "./tutorial-commands.ts";

export {
  CUBE_POSITIONS,
  CUBE_SIZE_MAX,
  CUBE_SIZE_MIN,
  type CubePosition,
  DEFAULT_SETTINGS,
  getSettings,
  type InterfaceSettings,
  MIN_3D_MAX,
  MIN_3D_MIN,
  resetSettings,
  SCALE_MAX,
  SCALE_MIN,
  type Settings,
  type SettingsPatch,
  setSettings,
  settingsSnapshot,
  subscribeSettings,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  type ViewCubeSettings,
} from "./settings.ts";

import { DEFAULT_PRESET_ID, presetList } from "./presets.ts";
import {
  enabledPanels,
  findLeaf,
  hiddenPanels,
  leafOfPanel,
  movePanel,
  PANEL_IDS,
  PANEL_TITLES,
  type PanelId,
  panelEnabled,
  panelsIn,
  resizeSplit,
  setActive,
  setSizes,
  toggleCollapse,
  visiblePanels,
  type Zone,
} from "./workspace.ts";
import {
  applyLayoutId,
  deleteCustom,
  mutateLayout,
  renameCustom,
  resetWorkspace,
  saveCustom,
  setPanelOff,
  workspaceSnapshot,
} from "./workspace-store.ts";

export type { PaintRegion, Yarn } from "@novelo/core";
export {
  currentSlot,
  type EditJson,
  type EditView,
  editSnapshot,
  exportEdit,
  exportEditAll,
  loadEdit,
  loadEditAll,
  sizeOfTension,
  subscribeEdit,
  TENSION_MAX,
  TENSION_MIN,
} from "./edit-store.ts";
export { type Features, features, setFeature } from "./features.ts";
export {
  addRegion,
  clearPaint,
  exportPaintAll,
  loadPaint,
  loadPaintAll,
  nextYarnId,
  type PaintState,
  paintSnapshot,
  removeRegion,
  resetPaint,
  setYarns,
  subscribePaint,
} from "./paint-store.ts";
export {
  exportParts,
  loadParts,
  type Part,
  type PartsState,
  partsSnapshot,
  resetParts,
  rootOf,
  type Seam,
  subscribeParts,
} from "./parts-store.ts";
export { DEFAULT_PRESET_ID, PRESET_SPECS, type Preset, type PresetInfo, presetList } from "./presets.ts";
export {
  DEFAULT_RENDER,
  RENDER_MAX_SAMPLES,
  RENDER_MAX_SIDE,
  type RenderInfo,
  type RenderSettings,
  type RenderState,
  type RenderStatus,
  renderSnapshot,
  subscribeRender,
} from "./render-store.ts";
export { stitchEditorState, stitchEditorVersion, subscribeStitchEditor } from "./stitch-editor-store.ts";
export {
  exportTutorial,
  loadTutorial,
  readingOn,
  subscribeTutorial,
  type TutorialPos,
  tutorialVersion,
} from "./tutorial-store.ts";
export {
  BAR_PX,
  buildLayout,
  compactLayout,
  DEFAULT_PANEL_MINS,
  type Dir,
  enabledPanels,
  findLeaf,
  fits,
  HEAD_PX,
  hiddenPanels,
  hidePanel,
  type Layout,
  type Leaf,
  layoutMinSize,
  leafOfPanel,
  leaves,
  minSize,
  movePanel,
  type Node,
  normalize,
  PANEL_IDS,
  PANEL_TITLES,
  type PanelId,
  type PanelMin,
  type PanelMins,
  panelMins,
  panelsIn,
  resizeSplit,
  SPLITTER_PX,
  type Spec,
  type Split,
  setActive,
  setSizes,
  showPanel,
  toggleCollapse,
  validateLayout,
  visiblePanels,
  type Zone,
} from "./workspace.ts";
export {
  applyLayoutId,
  type CustomLayout,
  deleteCustom,
  loadWorkspace,
  mutateLayout,
  renameCustom,
  resetWorkspace,
  saveCustom,
  setPanelOff,
  subscribeWorkspace,
  type WorkspaceState,
  workspaceSnapshot,
} from "./workspace-store.ts";

export type Params = Record<string, unknown>;

const panelOf = (p: Params, k = "panel"): PanelId => {
  const v = p[k];
  if (typeof v !== "string" || !(PANEL_IDS as readonly string[]).includes(v)) {
    throw new Error(`painel '${String(v)}' inválido (use ${enabledPanels().join(", ")})`);
  }
  if (!panelEnabled(v as PanelId)) throw new Error(`o painel '${v}' está pausado (D-57)`);
  return v as PanelId;
};
/** Janela indicada por `leaf` (id) ou pelo painel que ela contém (`panel` / `toPanel`). */
const leafIdOf = (p: Params, panelKey = "panel"): string => {
  if (typeof p.leaf === "string") return p.leaf;
  const l = leafOfPanel(workspaceSnapshot().layout, panelOf(p, panelKey));
  if (!l) throw new Error("o painel está oculto (use workspace.showPanel)");
  return l.id;
};

/** Fios e pintura a usar: os do projeto aberto, ou os passados em `yarns` / `paint` (para testes e scripts). */
function paintOf(p: Params): { yarns: Yarn[]; paint: PaintRegion[]; rules: PaintRegion[] } {
  const yarns = p.yarns === undefined ? paintSnapshot().yarns : validateYarns(p.yarns);
  const paint =
    p.paint === undefined
      ? paintSnapshot().paint
      : (() => {
          if (!Array.isArray(p.paint)) throw new Error("paint deve ser uma lista de regiões");
          return p.paint.map((r) => validateRegion(r, yarns));
        })();
  // pontos pintados à mão (por uid) viram regiões de pontos no fim, e por isso valem mais que as regras
  const extra =
    p.paint === undefined && typeof p.text === "string"
      ? overrideRegions(engineFor(p.text, dialectOf(p)), yarns)
      : [];
  return { yarns, paint: [...paint, ...extra], rules: paint };
}

/** Resumo do espaço de trabalho, igual para todos os comandos workspace.*. */
function workspaceView() {
  const s = workspaceSnapshot();
  return {
    presetId: s.presetId,
    layout: s.layout,
    visible: [...visiblePanels(s.layout)],
    hidden: hiddenPanels(s.layout),
    /** Uma linha por janela do menu Janelas: ligada ou desligada, independente do layout predefinido. */
    windows: enabledPanels().map((panel) => ({
      panel,
      title: PANEL_TITLES[panel],
      // ligada = está no layout (um layout salvo antigo pode não ter uma janela nova: aparece desligada, e ligar a traz)
      visible: panelsIn(s.layout).includes(panel),
    })),
    presets: presetList(),
    customs: s.customs.map(({ id, name }) => ({ id, name })),
  };
}
export type Command = (params: Params) => unknown;

const str = (p: Params, k: string): string => {
  const v = p[k];
  if (typeof v !== "string") throw new Error(`parâmetro '${k}' deve ser texto`);
  return v;
};

const DIALECTS: Dialect[] = ["pt-BR", "en-US", "en-UK", "xva"];
function dialectOf(p: Params, k = "dialect"): Dialect | undefined {
  const v = p[k];
  if (v === undefined || v === null || v === "" || v === "auto") return undefined;
  if (typeof v === "string" && (DIALECTS as string[]).includes(v)) return v as Dialect;
  throw new Error(`dialeto '${String(v)}' inválido (use pt-BR, en-US, en-UK, xva ou auto)`);
}

function read(p: Params): { pattern: Pattern; issues: Issue[]; detected: Dialect | undefined } {
  const d = dialectOf(p);
  const r = parsePattern(str(p, "text"), d ? { dialect: d } : {});
  return { pattern: r.pattern, issues: r.issues, detected: r.detected };
}

/** Posições 3D e metadados dos pontos de uma receita (graph.layout e assembly.layout). `yarnMap` troca fios numa instância. */
function layoutOut(p: Params, yarnMap?: Record<string, string>, mirror = false): Record<string, unknown> {
  const { pattern, issues } = read(p);
  const { yarns, paint, rules } = paintOf(p);
  const graph = applyPaint(buildGraph(pattern), paint);
  const eng = engineFor(str(p, "text"), dialectOf(p));
  const opts: { seed?: number; epochs?: number } = {};
  if (typeof p.seed === "number") opts.seed = p.seed;
  if (typeof p.epochs === "number") opts.epochs = p.epochs;
  const r = layoutCached(eng, rules, opts);
  const out: Record<string, unknown> = {
    stats: r.stats,
    rows: graph.rows,
    palette: Object.fromEntries(yarns.map((y) => [y.id, y.colorHex])),
    issues,
  };
  if (p.include === true) {
    out.positions = Array.from(r.positions, (v) => Math.round(v * 1000) / 1000);
    out.edges = Array.from(r.edges);
    const refYarn = yarns.find((y) => y.id === "A");
    const byId = new Map(yarns.map((y) => [y.id, y]));
    const tensionCol = eng.store.col("tension");
    const cursor = yarnCursor(
      graph,
      getSettings().yarns.stitchWidthMm,
      (id) => thicknessRatio(byId.get(id), refYarn),
      (id) => sizeOfTension(tensionCol[id] as number),
    );
    let scaleSum = 0;
    // modelo de ponto de cada nó: tipo, pernas, faixa de raio do fio e espelho (a vista 3D instancia um modelo por chave)
    const geoms: string[] = [];
    const geomIndex = new Map<string, number>();
    let gSum = 0;
    out.nodes = graph.nodes.map((n) => {
      const y = byId.get(yarnMap?.[n.yarnId] ?? n.yarnId);
      const size = sizeOfTension(eng.store.col("tension")[n.id] as number) * thicknessRatio(y, refYarn);
      const uid = eng.store.uid[n.id] as number;
      const scale = size * (materialById(y?.material)?.fuzz ?? 1);
      scaleSum += scale * ((n.id % 97) + 1);
      const def = stitchType(n.code) ?? stitchType("SC");
      const rho = 0.22 * thicknessRatio(y, refYarn) * (materialById(y?.material)?.fuzz ?? 1);
      const gk = modelKey({
        type: def?.id ?? "SC",
        version: def?.version ?? 1,
        // pernas só contam em pontos com haste; anel e corrente não geram variantes duplicadas
        legs: def?.model.gen === "post" ? Math.max(1, Math.min(MAX_LEGS, n.parents.length)) : 1,
        band: bandOf(rho),
        mirror,
        // variante por nível de tensão (9 níveis) e qualidade de edição (0); a vista de edição ignora esses dois campos
        tension: tensionLevel(tensionCol[n.id] as number),
        quality: 0,
      });
      let g = geomIndex.get(gk);
      if (g === undefined) {
        g = geoms.length;
        geoms.push(gk);
        geomIndex.set(gk, g);
      }
      gSum += g * ((n.id % 89) + 1);
      return {
        g,
        id: n.id,
        row: n.rowIndex,
        index: n.indexInRow,
        code: n.code,
        counted: n.counted,
        parents: n.parents,
        yarn: n.yarnId,
        uid,
        size,
        scale,
        color: y ? yarnColorAt(y, cursor[n.id] as number, uid) : undefined,
      };
    });
    // mesma chave = mesma geometria: a vista 3D só atualiza as cores em vez de recriar as malhas
    out.geoms = geoms;
    out.geomKey = `${lastLayoutKey()}|${scaleSum.toFixed(4)}|${geoms.join(",")}|${gSum}`;
  }
  return out;
}

/** Roteiro do tutorial da receita (`text`, `dialect`), com a pintura do projeto, e o uid permanente de cada ponto. */
function scriptOf(p: Params): ScriptCtx {
  const { pattern } = read(p);
  const { paint } = paintOf(p);
  const graph = applyPaint(buildGraph(pattern), paint);
  const eng = engineFor(str(p, "text"), dialectOf(p));
  return { ...readingScript(pattern, graph), uidOf: (id) => eng.store.uid[id] as number };
}

export const commands: Record<string, Command> = {
  ...editCommands,
  ...partsCommands(layoutOut),
  ...materialsCommands((m, p) => dispatch(m, p)),
  ...stitchEditorCommands,
  ...projectCommands,
  ...tutorialCommands(scriptOf),
  "system.ping": () => ({ pong: true }),

  // --- janela de render (R3): máquina de estados síncrona; o studio executa e relata o progresso
  /** Estado do render: state, done/total, phase, ms, run, pngRequests e os ajustes. */
  "render.status": () => renderSnapshot(),
  /** Ajustes: quality 1|2, width, height, samples, fovDeg, shadows, light{azimuth,elevation,intensity,ambient}, background{kind,c1,c2}. */
  "render.set": (p) => setRenderSettings(p as RenderPatch),
  "render.start": () => startRender(),
  "render.pause": () => pauseRender(),
  "render.resume": () => resumeRender(),
  /** Parar descarta a fila e mantém a imagem parcial. */
  "render.stop": () => stopRender(),
  /** USO INTERNO do studio (progress, complete, fail, stale, pngServed): quem chama de fora só atrapalha a rodada. Relato: pontos prontos, total, fase e milissegundos. */
  "render.progress": (p) =>
    progressRender(Number(p.done), Number(p.total), String(p.phase ?? ""), Number(p.ms ?? 0)),
  /** USO INTERNO do studio: contagens do render por seleção (selected, context, drawn, relax). */
  "render.info": (p) => infoRender(p as unknown as RenderInfo),
  "render.complete": (p) => completeRender(Number(p.ms ?? 0)),
  "render.fail": (p) => failRender(String(p.message ?? "erro")),
  "render.stale": () => staleRender(),
  /** Pede ao studio para salvar a imagem atual em PNG (o app baixa o arquivo; o chamador remoto não recebe os bytes). */
  "render.savePng": () => requestPng(),
  "render.pngServed": () => pngServed(),
  "render.reset": () => resetRender(),

  /** Tipos de ponto do registro (embutidos; o criador de pontos acrescentará os do usuário): código, nomes e modelo. */
  "stitches.list": () => ({
    types: STITCH_TYPES.map((t) => ({
      id: t.id,
      version: t.version,
      builtin: t.builtin,
      lengthFactor: t.lengthFactor,
      names: t.names,
      model: { gen: t.model.gen, wraps: t.model.wraps },
    })),
  }),

  /** Configurações atuais (aba Interface: posição, formato e tamanho do cubo de vistas). */
  "settings.get": () => getSettings(),
  /** Altera configurações. Ex.: {interface:{viewCube:{position:"top-left", chamfered:false, size:140}}}. */
  "settings.set": (p) => setSettings(p as SettingsPatch),
  "settings.reset": () => resetSettings(),

  // --- espaço de trabalho modular: janelas, abas, barras, presets e layouts do usuário
  /** Layout atual, painéis à vista/ocultos, presets e layouts customizados. */
  "workspace.get": () => workspaceView(),
  /** Aplica um preset (`classic`, `focus3d`, ...) ou um layout customizado (`custom:<id>`). */
  "workspace.applyPreset": (p) => {
    applyLayoutId(String(p.id ?? DEFAULT_PRESET_ID));
    return workspaceView();
  },
  /** Salva o layout atual com um nome (mesmo nome sobrescreve). */
  "workspace.saveCustom": (p) => {
    saveCustom(p.name as string);
    return workspaceView();
  },
  "workspace.renameCustom": (p) => {
    renameCustom(String(p.id), p.name as string);
    return workspaceView();
  },
  "workspace.deleteCustom": (p) => {
    deleteCustom(String(p.id));
    return workspaceView();
  },
  /** Leva um painel a outra janela: zone = center (vira aba) | left | right | top | bottom (divide). */
  "workspace.movePanel": (p) => {
    const panel = panelOf(p);
    const zone = (p.zone ?? "center") as Zone;
    if (!["center", "left", "right", "top", "bottom"].includes(zone))
      throw new Error(`zona '${zone}' inválida`);
    const target = leafIdOf(p, "toPanel");
    mutateLayout((l) => movePanel(l, panel, target, zone));
    return workspaceView();
  },
  /** Encolhe/restaura a janela (por `leaf` ou pelo `panel` que ela contém). `collapsed` força o estado. */
  "workspace.collapse": (p) => {
    const id = leafIdOf(p);
    mutateLayout((l) => toggleCollapse(l, id, typeof p.collapsed === "boolean" ? p.collapsed : undefined));
    return workspaceView();
  },
  /** Ativa a aba de um painel ou a aba `index` de uma janela. */
  "workspace.setActive": (p) => {
    if (typeof p.panel === "string") {
      const panel = panelOf(p);
      const leaf = leafOfPanel(workspaceSnapshot().layout, panel);
      if (!leaf) throw new Error("o painel está oculto");
      mutateLayout((l) => setActive(l, leaf.id, leaf.tabs.indexOf(panel)));
    } else {
      const id = String(p.leaf);
      if (!findLeaf(workspaceSnapshot().layout, id)) throw new Error(`janela '${id}' não existe`);
      mutateLayout((l) => setActive(l, id, Number(p.index ?? 0)));
    }
    return workspaceView();
  },
  /** Move a borda entre o filho `index` e o seguinte, em fração da divisão (`split` = id da divisão). */
  "workspace.resize": (p) => {
    mutateLayout((l) => resizeSplit(l, String(p.split), Number(p.index ?? 0), Number(p.delta)));
    return workspaceView();
  },
  /** Define todas as frações de uma divisão: sizes = [0.3, 0.7]. */
  "workspace.setSizes": (p) => {
    mutateLayout((l) => setSizes(l, String(p.split), p.sizes as number[]));
    return workspaceView();
  },
  /** Desliga a janela (continua desligada ao trocar de layout predefinido). */
  "workspace.hidePanel": (p) => {
    setPanelOff(panelOf(p), true);
    return workspaceView();
  },
  /** Liga a janela de novo, perto das suas vizinhas no layout aplicado. */
  "workspace.showPanel": (p) => {
    setPanelOff(panelOf(p), false);
    return workspaceView();
  },
  /** `panel` e `visible` (true liga, false desliga): o que o menu Janelas usa. */
  "workspace.setPanelVisible": (p) => {
    if (typeof p.visible !== "boolean") throw new Error("parâmetro 'visible' deve ser verdadeiro ou falso");
    setPanelOff(panelOf(p), !p.visible);
    return workspaceView();
  },
  "workspace.reset": () => {
    resetWorkspace();
    return workspaceView();
  },
  "system.list": () => Object.keys(commands).sort(),
  "math.round": (p) => ({ value: roundCount(Number(p.x)) }),
  "notation.splitLines": (p) => {
    const r = splitLines(str(p, "text"));
    return r.ok ? r.value : r.issues;
  },
  "interop.parseDot": (p) => {
    const r = parseCpDot(str(p, "text"));
    if (!r.ok) return { ok: false, issues: r.issues };
    return {
      ok: true,
      dim: r.value.dim,
      nodes: r.value.nodes.length,
      edges: r.value.edges.length,
      issues: r.issues,
    };
  },

  /** Lê a receita e devolve dialeto, avisos e número de voltas. */
  "pattern.parse": (p) => {
    const { pattern, issues, detected } = read(p);
    return { dialect: pattern.dialect, detected: detected ?? null, rows: pattern.rows.length, issues };
  },

  /** Tabela de verificação (docs/07 seção 3): esperado x encontrado x status, por volta. */
  "pattern.verify": (p) => {
    const { pattern, issues, detected } = read(p);
    const v = validate(pattern);
    const all = [...issues, ...v.issues];
    return {
      ok: !all.some((i) => i.severity === "error"),
      dialect: pattern.dialect,
      detected: detected ?? null,
      table: v.rows,
      totalCounted: v.totalCounted,
      counts: v.counts,
      issues: all,
    };
  },

  /** Reescreve a receita em outro dialeto a partir da forma canônica. */
  "pattern.print": (p) => {
    const { pattern, issues } = read(p);
    const to = dialectOf(p, "to") ?? pattern.dialect;
    return { text: printPattern(pattern, to), dialect: to, issues };
  },

  /** Receita -> texto do CrochetPARADE. */
  "pattern.toCp": (p) => {
    const { pattern, issues } = read(p);
    const r = toCp(pattern);
    return { text: r.ok ? r.value : "", issues: [...issues, ...r.issues] };
  },

  /** Texto do CrochetPARADE -> receita no dialeto pedido (padrão pt-BR) e sua verificação. */
  "pattern.fromCp": (p) => {
    const r = fromCp(str(p, "text"));
    if (!r.ok) return { ok: false, issues: r.issues };
    const v = validate(r.value);
    const to = dialectOf(p, "to") ?? "pt-BR";
    return {
      ok: v.ok,
      text: printPattern(r.value, to),
      counts: v.counts,
      totalCounted: v.totalCounted,
      issues: [...r.issues, ...v.issues],
    };
  },

  // --- fios e pintura (P3)
  /** Paleta e regiões de pintura do projeto aberto. */
  "yarns.get": () => ({ ...paintSnapshot(), nextId: nextYarnId() ?? null }),
  /** Troca a paleta: yarns = [{id:"A", name:"verde musgo", colorHex:"#5d6b3a"}, ...]. O fio A é obrigatório. */
  "yarns.set": (p) => setYarns(p.yarns),
  /** Biblioteca de fios: tipos de cor, materiais e espessuras por padrão (EUA, Reino Unido/Europa, Brasil; valores aproximados). */
  "yarns.library": () => ({
    colorKinds: COLOR_KINDS.map((id) => ({
      id,
      name: COLOR_KIND_NAMES[id],
      defaultSegmentM: DEFAULT_SEGMENT_M[id],
    })),
    materials: MATERIALS,
    regions: REGION_NAMES,
    thickness: THICKNESS,
    note: "Espessuras, metragens e agulhas são valores aproximados de mercado; confirme no rótulo e calibre com uma amostra.",
  }),
  /**
   * Prévia da cor de um fio ao longo do fio gasto: yarn = {id,name,colorHex,color?,material?} (ou id da paleta),
   * meters = comprimento total (padrão 30), steps = amostras (padrão 24).
   */
  "yarns.preview": (p) => {
    const y =
      typeof p.yarn === "string"
        ? paintSnapshot().yarns.find((x) => x.id === p.yarn)
        : validateYarns([p.yarn])[0];
    if (!y) throw new Error(`fio '${String(p.yarn)}' não existe na paleta`);
    const meters = typeof p.meters === "number" && p.meters > 0 ? p.meters : 30;
    const steps = typeof p.steps === "number" ? Math.max(2, Math.min(200, Math.floor(p.steps))) : 24;
    return {
      colors: Array.from({ length: steps }, (_, i) =>
        yarnColorAt(y, ((i + 0.5) / steps) * meters * 1000, i + 1),
      ),
    };
  },
  /** Pinta as voltas de `from` a `to` (1-based) com o fio `yarn`. */
  "paint.rows": (p) => addRegion({ kind: "rows", yarn: p.yarn, from: p.from, to: p.to }),
  /** Pinta pontos soltos: at = [{row: 7, index: 0}, ...] (volta de 1, posição de 0). */
  "paint.stitches": (p) => addRegion({ kind: "stitches", yarn: p.yarn, at: p.at }),
  "paint.remove": (p) => removeRegion(Number(p.index)),
  "paint.clear": () => clearPaint(),
  "paint.reset": () => resetPaint(),
  /**
   * Relatório de fios da receita: trocas (volta, ponto, de, para), receita escrita com as trocas, consumo estimado
   * por fio e avisos. `stitchWidthMm` é a largura do ponto (padrão 5 mm). Aceita `yarns` e `paint` explícitos.
   */
  "paint.report": (p) => {
    const { pattern, issues } = read(p);
    const { yarns, paint, rules: rulesOf } = paintOf(p);
    const g0 = buildGraph(pattern);
    const g = applyPaint(g0, paint);
    const names = Object.fromEntries(yarns.map((y) => [y.id, y.name]));
    const to = dialectOf(p, "to") ?? pattern.dialect;
    const printed = printPatternWithYarns(pattern, paintedYarns(g0, paint), to, names);
    const width =
      typeof p.stitchWidthMm === "number" && p.stitchWidthMm > 0
        ? p.stitchWidthMm
        : getSettings().yarns.stitchWidthMm;
    // tensão por ponto (ponto maior gasta mais fio) e troca de fios de instância, antes de somar
    const eng = engineFor(str(p, "text"), dialectOf(p));
    refreshColumns(eng, rulesOf);
    const tension = eng.store.col("tension");
    const map = (p.yarnMap ?? null) as Record<string, string> | null;
    const gu = map ? { ...g, nodes: g.nodes.map((n) => ({ ...n, yarnId: map[n.yarnId] ?? n.yarnId })) } : g;
    const refYarn = yarns.find((y) => y.id === "A");
    const widthOf = (id: string) =>
      thicknessRatio(
        yarns.find((y) => y.id === id),
        refYarn,
      );
    return {
      changes: printed.changes,
      changeCount: countYarnChanges(g),
      recipe: printed.text,
      usage: yarnUsage(gu, width, widthOf, (id) => sizeOfTension(tension[id] as number)).map((u) => {
        const y = yarns.find((x) => x.id === u.yarn);
        const lengthM = Math.round(u.lengthMm) / 1000;
        const info = thicknessById(y?.thickness?.id);
        return {
          ...u,
          name: names[u.yarn] ?? u.yarn,
          lengthM,
          diameterMm: y?.thickness?.diameterMm ?? null,
          material: materialById(y?.material)?.name ?? null,
          // gramas só quando a espessura vem de um padrão com metragem conhecida (aproximado)
          gramsApprox: info ? Math.round((lengthM / info.mPer100g) * 1000) / 10 : null,
        };
      }),
      stitchWidthMm: width,
      note: "Consumo é uma estimativa (4,2 x a largura do ponto por ponto baixo); calibre com uma amostra.",
      issues: [...issues, ...paintIssues(g0, paint, yarns)],
    };
  },

  /**
   * Posições 3D de cada ponto (docs/09, D-17). Com `include: true` devolve também posições, arestas e
   * metadados por nó (para a vista 3D); sem ele, só o resumo (útil para o MCP).
   */
  "graph.layout": (p) => layoutOut(p),

  /** Gráfico circular em SVG A4 (uma página por item). */
  "chart.render": (p) => {
    const { pattern, issues } = read(p);
    const { yarns, paint } = paintOf(p);
    const r = renderChart(pattern, { beginner: p.beginner !== false, paint, yarns });
    return {
      pages: r.pages.map((pg) => ({
        label: pg.label,
        rings: pg.rings,
        overlaps: pg.overlaps,
        symbols: pg.symbols,
        yarns: pg.yarns,
        svg: pg.svg,
      })),
      issues: [...issues, ...r.issues],
    };
  },
};

export function dispatch(method: string, params: Params = {}): unknown {
  const fn = commands[method];
  if (!fn) throw new Error(`comando desconhecido: ${method}`);
  const feature = featureOfMethod(method);
  if (feature && !features()[feature]) {
    throw new Error(
      `recurso pausado: ${FEATURE_NAMES[feature]} (${method}); veja features.ts e a decisão D-57`,
    );
  }
  return fn(params);
}

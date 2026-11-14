// SPDX-License-Identifier: GPL-3.0-or-later
// As abas do ribbon e as ferramentas de cada uma. Ordem: as abas seguem a ordem em que o trabalho é feito (arquivo, receita,
// seleção, pintura, montagem, tutorial) e, dentro de cada aba, os botões vão do mais usado primeiro (esquerda) ao menos usado
// (direita). Toda ação passa pelos comandos (D-21): aqui só se decide o que cada botão dispara.
import { Icon } from "./icons.tsx";
import { setTools, type ToolState } from "./pointtools.ts";
import type { RibbonItem, RibbonTab } from "./Ribbon.tsx";
import { VIEWS } from "./views.ts";

export interface RibbonCtx {
  /** Dispara um comando; erro vira aviso na barra de título. */
  run: (method: string, params?: Record<string, unknown>) => void;
  /** Mesmo que `run`, acrescentando a receita e o dialeto da peça ativa (comandos de seleção e pontos). */
  runText: (method: string, params?: Record<string, unknown>) => void;
  save: () => void;
  openFile: (f: File | undefined) => void;
  settings: () => void;
  materials: () => void;
  materialsOn: boolean;
  print: () => void;
  copyCp: () => void;
  downloadCp: () => void;
  tools: ToolState;
  canUndo: boolean;
  canRedo: boolean;
  activePart: string;
  wire: boolean;
  showGraph: boolean;
  showWireOption: boolean;
  setWire: (v: boolean) => void;
  setShowGraph: (v: boolean) => void;
  /** Passo do tutorial: null sem receita válida. */
  tutorial: {
    index: number;
    total: number;
    round: number;
    rounds: number;
    onShow?: () => void;
  } | null;
}

const btn = (
  tab: string,
  id: string,
  label: string,
  icon: string,
  run: () => void,
  extra: Partial<Extract<RibbonItem, { kind: "button" }>> = {},
): RibbonItem => ({ kind: "button", id: `${tab}.${id}`, label, icon, run, ...extra });

export function buildRibbonTabs(c: RibbonCtx): RibbonTab[] {
  const t = c.tools;
  const inSelect = t.mode === "select";
  const inPaint = t.mode === "yarn" || t.mode === "tension";
  const modeBtn = (tab: string, mode: ToolState["mode"], label: string, icon: string) =>
    btn(tab, `mode-${mode}`, label, icon, () => setTools({ mode, pathA: null }), {
      pressed: t.mode === mode,
      testid: `mode-${mode}`,
      title: `${label}: ferramenta do botão esquerdo no 3D`,
    });
  const selBtn = (tool: ToolState["selTool"], label: string, icon: string) =>
    btn("selecionar", `sel-${tool}`, label, icon, () => setTools({ selTool: tool, pathA: null }), {
      pressed: inSelect && t.selTool === tool,
      disabled: !inSelect,
      testid: `sel-${tool}`,
      title: inSelect ? label : `${label} (escolha primeiro a ferramenta Selecionar)`,
    });
  const brushBtn = (tool: ToolState["brushTool"], label: string, icon: string) =>
    btn("pintar", `brush-${tool}`, label, icon, () => setTools({ brushTool: tool }), {
      pressed: inPaint && t.brushTool === tool,
      disabled: !inPaint,
      testid: `brush-${tool}`,
      title: inPaint ? label : `${label} (escolha primeiro Pintar fio ou Tensão)`,
    });
  const part = { id: c.activePart };

  const tutorialItems: RibbonItem[] = [
    btn("tutorial", "prev", "Anterior", "prev", () => c.runText("tutorial.prev", tutorialParams(c)), {
      disabled: !c.tutorial || c.tutorial.index <= 0,
      testid: "tutorial-prev",
      title: "Passo anterior (←)",
    }),
    btn("tutorial", "next", "Próximo", "next", () => c.runText("tutorial.next", tutorialParams(c)), {
      disabled: !c.tutorial || c.tutorial.index >= c.tutorial.total - 1,
      testid: "tutorial-next",
      title: "Próximo passo (→)",
    }),
  ];

  return [
    {
      id: "arquivo",
      label: "Arquivo",
      groups: [
        {
          id: "projeto",
          label: "Projeto",
          items: [
            btn("arquivo", "save", "Salvar projeto", "save", c.save, { testid: "project-save" }),
            {
              kind: "custom",
              id: "arquivo.open",
              label: "Abrir projeto",
              node: (
                <label className="rb" title="Abrir projeto">
                  <Icon name="open" size={22} />
                  <span>Abrir projeto</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    data-testid="project-open"
                    hidden
                    onChange={(e) => {
                      c.openFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              ),
            },
          ],
        },
        {
          id: "app",
          label: "Aplicativo",
          items: [
            btn("arquivo", "materials", "Lista de materiais", "list", c.materials, {
              pressed: c.materialsOn,
            }),
            btn("arquivo", "settings", "Configurações", "settings", c.settings),
          ],
        },
      ],
    },
    {
      id: "receita",
      label: "Receita",
      groups: [
        {
          id: "saida",
          label: "Saída",
          items: [
            btn("receita", "print", "Imprimir / PDF", "print", c.print),
            btn("receita", "copy", "Copiar texto CP", "copy", c.copyCp),
            btn("receita", "download", "Baixar .txt", "download", c.downloadCp),
          ],
        },
      ],
    },
    {
      id: "selecionar",
      label: "Selecionar",
      groups: [
        {
          id: "ferramenta",
          label: "Ferramenta",
          items: [
            modeBtn("selecionar", "orbit", "Girar", "orbit"),
            modeBtn("selecionar", "select", "Selecionar", "select"),
            modeBtn("selecionar", "yarn", "Pintar fio", "brush"),
            modeBtn("selecionar", "tension", "Tensão", "tension"),
          ],
        },
        {
          id: "forma",
          label: "Forma da seleção",
          items: [
            selBtn("point", "Ponto", "point"),
            selBtn("group", "Volta", "round"),
            selBtn("column", "Coluna", "column"),
            selBtn("hood", "Vizinhança", "hood"),
            selBtn("path", "Caminho", "path"),
            selBtn("rect", "Retângulo", "rect"),
            selBtn("ellipse", "Elipse", "ellipse"),
            selBtn("lasso", "Laço", "lasso"),
          ],
        },
        {
          id: "operacao",
          label: "Operação",
          items: [
            {
              kind: "custom",
              id: "selecionar.op",
              label: "Operação",
              node: (
                <label className="rc-field">
                  Operação
                  <select
                    aria-label="Operação"
                    value={t.op}
                    onChange={(e) => setTools({ op: e.target.value as ToolState["op"] })}
                  >
                    <option value="replace">substituir</option>
                    <option value="add">somar</option>
                    <option value="remove">tirar</option>
                    <option value="intersect">cruzar</option>
                  </select>
                </label>
              ),
            },
            {
              kind: "custom",
              id: "selecionar.visible",
              label: "Só pontos visíveis",
              node: (
                <label className="rc-field" title="Desligado: a forma atravessa a peça">
                  <input
                    type="checkbox"
                    data-testid="visible-only"
                    checked={t.visibleOnly}
                    onChange={(e) => setTools({ visibleOnly: e.target.checked })}
                  />{" "}
                  Só pontos visíveis
                </label>
              ),
            },
          ],
        },
        {
          id: "acoes",
          label: "Seleção",
          items: [
            btn("selecionar", "clear", "Limpar", "clear", () => c.runText("selection.clear")),
            btn("selecionar", "invert", "Inverter", "invert", () => c.runText("selection.invert")),
            btn("selecionar", "all", "Tudo", "all", () =>
              c.runText("selection.select", { by: { kind: "all" }, op: t.op }),
            ),
            btn("selecionar", "all-rounds", "Todas as voltas", "round", () =>
              c.runText("selection.select", { by: { kind: "group", from: 1, to: 9999 }, op: "replace" }),
            ),
          ],
        },
      ],
    },
    {
      id: "pintar",
      label: "Pintar",
      groups: [
        {
          id: "modo",
          label: "Ferramenta",
          items: [
            modeBtn("pintar", "yarn", "Pintar fio", "brush"),
            modeBtn("pintar", "tension", "Tensão", "tension"),
          ],
        },
        {
          id: "pincel",
          label: "Pincel",
          items: [
            brushBtn("brush", "Pincel", "brush"),
            brushBtn("bucket", "Balde", "bucket"),
            brushBtn("dropper", "Conta-gotas", "dropper"),
            brushBtn("erase", "Borracha", "erase"),
          ],
        },
        {
          id: "limpar",
          label: "Limpar",
          items: [
            btn("pintar", "clear-edits", "Apagar edições por ponto", "clear", () => c.runText("edit.clear")),
          ],
        },
      ],
    },
    {
      id: "montagem",
      label: "Montagem",
      groups: [
        {
          id: "peca",
          label: "Peça",
          items: [
            btn("montagem", "add", "Nova peça", "plus", () => c.run("parts.add", {})),
            btn("montagem", "instance", "Instância", "instance", () => c.run("parts.instance", part)),
            btn("montagem", "copy", "Cópia", "copy", () => c.run("parts.copy", part)),
          ],
        },
        {
          id: "espelho",
          label: "Espelhada no plano",
          items: (["x", "y", "z"] as const).map((plane) =>
            btn("montagem", `mirror-${plane}`, plane.toUpperCase(), "mirror", () =>
              c.run("parts.mirror", { ...part, plane }),
            ),
          ),
        },
      ],
    },
    {
      id: "tutorial",
      label: "Tutorial",
      groups: [
        {
          id: "passos",
          label: "Passos",
          items: [
            ...tutorialItems,
            {
              kind: "custom",
              id: "tutorial.round",
              label: "Ir para a volta",
              node: (
                <label className="rc-field">
                  Ir para a volta
                  <select
                    data-testid="tutorial-round"
                    disabled={!c.tutorial}
                    value={c.tutorial?.round ?? 1}
                    onChange={(e) =>
                      c.runText("tutorial.goto", { ...tutorialParams(c), round: Number(e.target.value) })
                    }
                  >
                    {Array.from({ length: c.tutorial?.rounds ?? 1 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            },
            btn("tutorial", "show", "Mostrar ponto", "eye", () => c.tutorial?.onShow?.(), {
              disabled: !c.tutorial?.onShow,
              testid: "tutorial-show",
              title: "Leva a câmera ao ponto atual (F)",
            }),
          ],
        },
      ],
    },
    {
      id: "vista",
      label: "Vista",
      groups: [
        {
          id: "camera",
          label: "Câmera",
          items: [
            btn("vista", "fit", "Ajustar", "fit", () => window.__view3d?.fit(), {
              title: "Ajustar à peça (F)",
            }),
          ],
        },
        {
          id: "vistas",
          label: "Vistas padrão",
          items: Object.entries(VIEWS).map(([key, v]) =>
            btn(
              "vista",
              `view-${key}`,
              v.name,
              key === "2" || key === "5" ? "top" : "front",
              () => window.__view3d?.snapView([...v.dir] as [number, number, number]),
              { title: `${v.name} (${key})` },
            ),
          ),
        },
        {
          id: "exibir",
          label: "Exibição",
          items: [
            btn("vista", "graph", "Grafo", "grid", () => c.setShowGraph(!c.showGraph), {
              pressed: c.showGraph,
              title: "Mostrar as ligações do grafo",
            }),
            ...(c.showWireOption
              ? [
                  btn("vista", "wire", "Só linhas", "wire", () => c.setWire(!c.wire), {
                    pressed: c.wire,
                    title: "Só as linhas das ligações (vermelho e azul)",
                  }),
                ]
              : []),
          ],
        },
      ],
    },
    {
      id: "historico",
      label: "Histórico",
      groups: [
        {
          id: "desfazer",
          label: "Desfazer",
          items: [
            btn("historico", "undo", "Desfazer", "undo", () => c.runText("history.undo"), {
              disabled: !c.canUndo,
              testid: "undo",
              title: "Desfazer (Ctrl+Z)",
            }),
            btn("historico", "redo", "Refazer", "redo", () => c.runText("history.redo"), {
              disabled: !c.canRedo,
              testid: "redo",
              title: "Refazer (Ctrl+Y)",
            }),
          ],
        },
      ],
    },
  ];
}

const tutorialParams = (c: RibbonCtx): Record<string, unknown> => ({ part: c.activePart });

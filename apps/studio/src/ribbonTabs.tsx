// SPDX-License-Identifier: GPL-3.0-or-later
// As abas do ribbon e as ferramentas de cada uma. Ordem: as abas seguem a ordem em que o trabalho é feito (arquivo, receita,
// seleção, pintura, montagem, tutorial) e, dentro de cada aba, os botões vão do mais usado primeiro (esquerda) ao menos usado
// (direita). Toda ação passa pelos comandos (D-21): aqui só se decide o que cada botão dispara.
import { Icon } from "./icons.tsx";
import { setTools, type ToolState } from "./pointtools.ts";
import type { RibbonItem, RibbonTab } from "./Ribbon.tsx";
import { openShape } from "./ShapeWindow.tsx";
import { sectionSnapshot, setSection } from "./section.ts";
import { VIEWS } from "./views.ts";

export interface RibbonCtx {
  /** Dispara um comando; erro vira aviso na barra de título. */
  run: (method: string, params?: Record<string, unknown>) => void;
  /** Mesmo que `run`, acrescentando a receita e o dialeto da peça ativa (comandos de seleção e pontos). */
  runText: (method: string, params?: Record<string, unknown>) => void;
  save: () => void;
  openFile: (f: File | undefined) => void;
  /** Peça nova a partir de um STL (malha fechada sem ramificação, P5d). */
  openStl: (f: File | undefined) => void;
  settings: () => void;
  materials: () => void;
  materialsOn: boolean;
  palette: () => void;
  paletteOn: boolean;
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
  /** Entra no modo de leitura (o tutorial passo a passo, em tela cheia). */
  readingStart: () => void;
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
            btn("pintar", "palette", "Paleta de fios", "recipe", () => c.palette(), {
              pressed: c.paletteOn,
              testid: "palette-open",
              title: "Abre a janela da paleta: fios, pinturas por volta, consumo e receita com trocas",
            }),
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
            btn("montagem", "shape", "Por forma", "part", () => openShape(), {
              testid: "shape-open",
              title:
                "Peça nova a partir de uma forma (esfera, ovo, cone, copo, composta ou perfil): a receita sai pronta",
            }),
            {
              kind: "custom",
              id: "montagem.stl",
              label: "De um STL",
              node: (
                <label
                  className="rb"
                  title="Peças a partir de um modelo 3D (STL) fechado: o corpo e uma peça por braço ou perna, com a receita pronta e onde costurar (protótipo)"
                >
                  <Icon name="open" size={22} />
                  <span>De um STL</span>
                  <input
                    type="file"
                    accept=".stl,model/stl,application/sla"
                    data-testid="stl-open"
                    hidden
                    onChange={(e) => {
                      c.openStl(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              ),
            },
            btn("montagem", "instance", "Instância", "instance", () => c.run("parts.instance", part)),
            btn("montagem", "copy", "Cópia", "copy", () => c.run("parts.copy", part)),
          ],
        },
        {
          id: "grupo",
          label: "Montagem",
          items: [
            btn(
              "montagem",
              "nova-montagem",
              "Nova montagem",
              "assembly",
              () => c.run("assembly.add", { fromSelection: true }),
              {
                testid: "tool-montagem.nova-montagem",
                title:
                  "Cria uma montagem; a peça escolhida na árvore entra nela (sem peça escolhida, nasce vazia)",
              },
            ),
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
          id: "leitura",
          label: "Leitura",
          items: [
            btn("tutorial", "reading", "Modo de leitura", "tutorial", () => c.readingStart(), {
              testid: "reading-start",
              title: "Esconde as ferramentas e mostra o 3D com o passo atual e as teclas de navegação (F9)",
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
          id: "medir",
          label: "Medir",
          items: [
            btn(
              "vista",
              "measure",
              "Distância",
              "ruler",
              () =>
                setTools(
                  t.mode === "measure"
                    ? { mode: "orbit", measureA: null }
                    : { mode: "measure", measureA: null, measureText: null },
                ),
              {
                pressed: t.mode === "measure",
                testid: "mode-measure",
                title: "Clique em dois pontos do 3D: mostra a distância estimada (mm e larguras de ponto)",
              },
            ),
          ],
        },
        {
          id: "corte",
          label: "Corte",
          items: [
            ...(["x", "y", "z"] as const).map((axis) =>
              btn(
                "vista",
                `section-${axis}`,
                `Cortar em ${axis.toUpperCase()}`,
                "cube",
                () => setSection({ axis: sectionSnapshot().axis === axis ? null : axis }),
                {
                  pressed: sectionSnapshot().axis === axis,
                  testid: `section-${axis}`,
                  title: `Corta a vista por um plano perpendicular ao eixo ${axis.toUpperCase()} (só da vista; não entra no projeto)`,
                },
              ),
            ),
            {
              kind: "custom",
              id: "section.pos",
              label: "Posição do corte",
              node: (
                <label className="rc-field">
                  Posição do corte
                  <input
                    type="range"
                    min={0}
                    max={100}
                    data-testid="section-pos"
                    aria-label="Posição do corte"
                    disabled={sectionSnapshot().axis === null}
                    value={sectionSnapshot().pos}
                    onChange={(e) => setSection({ pos: Number(e.target.value) })}
                  />
                </label>
              ),
            },
            btn(
              "vista",
              "section-flip",
              "Inverter lado",
              "invert",
              () => setSection({ flip: !sectionSnapshot().flip }),
              {
                pressed: sectionSnapshot().flip,
                disabled: sectionSnapshot().axis === null,
                testid: "section-flip",
                title: "Troca qual lado do corte some",
              },
            ),
          ],
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

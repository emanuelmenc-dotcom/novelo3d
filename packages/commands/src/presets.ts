// SPDX-License-Identifier: GPL-3.0-or-later
// Layouts padrão ("presets") do espaço de trabalho. É só dados: para criar ou ajustar um preset, edite esta lista.
// Cada `Spec` descreve a árvore de janelas; os ids são gerados por `buildLayout`.
import { buildLayout, type Layout, type Spec } from "./workspace.ts";

export interface Preset {
  id: string;
  name: string;
  description: string;
  spec: Spec;
}

export const PRESET_SPECS: Preset[] = [
  {
    id: "edit",
    name: "Edição (3D grande)",
    description:
      "Receita, verificação, gráfico e ferramentas na coluna da esquerda; o 3D ocupa o resto da tela.",
    spec: {
      dir: "row",
      sizes: [0.27, 0.73],
      children: [
        {
          dir: "column",
          sizes: [0.55, 0.45],
          children: [{ leaf: ["recipe", "verify", "chart", "cp"] }, { leaf: ["tree", "props"] }],
        },
        { leaf: ["view3d"] },
      ],
    },
  },
  {
    id: "classic",
    name: "Clássico (3 colunas)",
    description: "Receita, verificação e, à direita, gráfico/3D em abas sobre o texto do CrochetPARADE.",
    spec: {
      dir: "row",
      sizes: [0.24, 0.32, 0.44],
      children: [
        { leaf: ["recipe"] },
        { leaf: ["verify"] },
        {
          dir: "column",
          sizes: [0.7, 0.3],
          children: [
            { leaf: ["chart", "view3d", "stitchEditor"] },
            { leaf: ["cp", "tree", "props", "render"] },
          ],
        },
      ],
    },
  },
  {
    id: "focus3d",
    name: "Foco no 3D",
    description: "O 3D ocupa a maior parte da tela; receita e verificação ficam empilhadas ao lado.",
    spec: {
      dir: "row",
      sizes: [0.27, 0.73],
      children: [
        { dir: "column", sizes: [0.45, 0.55], children: [{ leaf: ["recipe"] }, { leaf: ["verify"] }] },
        {
          dir: "column",
          sizes: [0.74, 0.26],
          children: [
            { leaf: ["view3d", "stitchEditor"] },
            { leaf: ["chart", "cp", "tree", "props", "render"] },
          ],
        },
      ],
    },
  },
  {
    id: "chart",
    name: "Gráfico em destaque",
    description: "O gráfico circular à esquerda, em grande; o resto empilhado à direita.",
    spec: {
      dir: "row",
      sizes: [0.48, 0.52],
      children: [
        { leaf: ["chart", "stitchEditor"] },
        {
          dir: "column",
          sizes: [0.28, 0.3, 0.42],
          children: [
            { leaf: ["recipe"] },
            { leaf: ["verify"] },
            { leaf: ["view3d", "cp", "tree", "props", "render"] },
          ],
        },
      ],
    },
  },
  {
    id: "stack",
    name: "Empilhado",
    description: "Tudo em uma coluna, de cima para baixo; gráfico e 3D lado a lado.",
    spec: {
      dir: "column",
      sizes: [0.2, 0.22, 0.38, 0.2],
      children: [
        { leaf: ["recipe"] },
        { leaf: ["verify"] },
        { dir: "row", sizes: [0.5, 0.5], children: [{ leaf: ["chart"] }, { leaf: ["view3d"] }] },
        { leaf: ["cp", "tree", "props", "render", "stitchEditor"] },
      ],
    },
  },
  {
    id: "tabs",
    name: "Tudo em abas",
    description: "Uma única janela com todos os painéis em abas, como um navegador.",
    spec: {
      leaf: [
        "view3d",
        "recipe",
        "verify",
        "chart",
        "cp",
        "tree",
        "props",

        "render",
        "stitchEditor",
      ],
    },
  },
];

export const DEFAULT_PRESET_ID = "edit";

export interface PresetInfo {
  id: string;
  name: string;
  description: string;
}

export const presetList = (): PresetInfo[] =>
  PRESET_SPECS.map(({ id, name, description }) => ({ id, name, description }));

export function presetLayout(id: string): Layout | undefined {
  const p = PRESET_SPECS.find((x) => x.id === id);
  return p ? buildLayout(p.spec) : undefined;
}

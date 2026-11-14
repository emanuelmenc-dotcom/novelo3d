// SPDX-License-Identifier: GPL-3.0-or-later
// Barra de opções da ferramenta, fina, sobre o 3D: mostra qual ferramenta está ativa, o que ela faz com o botão esquerdo, quantos
// pontos estão selecionados e as estatísticas da peça. O resto fica no ribbon.
import type { ToolState } from "./pointtools.ts";

const MODE_NAME: Record<ToolState["mode"], string> = {
  orbit: "Girar",
  select: "Selecionar",
  yarn: "Pintar fio",
  tension: "Tensão",
};
const SEL_NAME: Record<ToolState["selTool"], string> = {
  point: "ponto",
  group: "volta",
  column: "coluna",
  hood: "vizinhança",
  path: "caminho",
  rect: "retângulo",
  ellipse: "elipse",
  lasso: "laço",
};
const OP_NAME: Record<ToolState["op"], string> = {
  replace: "substituir",
  add: "somar",
  remove: "tirar",
  intersect: "cruzar",
};
const BRUSH_NAME: Record<ToolState["brushTool"], string> = {
  brush: "pincel",
  bucket: "balde",
  dropper: "conta-gotas",
  erase: "borracha",
};

export function ToolOptionsBar(props: { tools: ToolState; selected: number; stats: string | null }) {
  const { tools, selected, stats } = props;
  const detail =
    tools.mode === "select"
      ? `${SEL_NAME[tools.selTool]} · ${OP_NAME[tools.op]}`
      : tools.mode === "yarn"
        ? `${BRUSH_NAME[tools.brushTool]} · fio ${tools.yarn} · raio ${tools.hops}`
        : tools.mode === "tension"
          ? `${BRUSH_NAME[tools.brushTool]} · tensão ${tools.tension} · raio ${tools.hops}`
          : "botão esquerdo gira · meio ou direito desloca · roda aproxima";
  return (
    <div className="optbar" data-testid="options-bar">
      <strong>{MODE_NAME[tools.mode]}</strong>
      <span>{detail}</span>
      <span className="optbar-spacer" />
      <span data-testid="options-selected">{selected} selecionados</span>
      {stats && <span className="hint">{stats}</span>}
    </div>
  );
}

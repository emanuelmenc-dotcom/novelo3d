// SPDX-License-Identifier: GPL-3.0-or-later
// Janela Propriedades (G4): os pontos escolhidos no 3D (seção Pontos) e o que foi escolhido na árvore. Peça: nome, posição, rotação, espelho e troca de fios.
// Projeto (raiz): nova costura e fechar montagem. Costura: dados dela. Os controles são os da antiga janela Montagem.
import { dispatch, partsSnapshot, subscribeParts, subscribeTree, treeVersion } from "@novelo/commands";
import { useSyncExternalStore } from "react";
import { AssemblyPanel } from "./AssemblyPanel.tsx";
import { PointsPanel } from "./PointsPanel.tsx";
import type { NodeMeta } from "./view3d.ts";

/** Tamanho estimado do item escolhido na árvore (projeto, peça ou montagem), em mm e em larguras de ponto. */
function Measures(props: { selected: string | null }) {
  const sel = props.selected;
  if (sel === null || sel.startsWith("s")) return null;
  const target =
    sel === "root"
      ? { target: "all" }
      : sel.startsWith("a")
        ? { target: "assembly", id: sel }
        : { target: "part", id: sel };
  let text: string;
  try {
    const r = dispatch("measure.bounds", target) as {
      size: number[];
      sizeMm: number[];
      stitchWidthMm: number;
    };
    const f = (v: number[]) => v.map((x) => Math.round(x * 10) / 10).join(" × ");
    text = `${f(r.sizeMm)} mm (${f(r.size)} larguras de ponto de ${r.stitchWidthMm} mm)`;
  } catch (e) {
    text = (e as Error).message;
  }
  return (
    <p className="hint" data-testid="measure-bounds">
      Tamanho (estimativa): {text}
    </p>
  );
}

export function PropsPanel(props: { text: string; dialect: string; selNode: NodeMeta | null }) {
  useSyncExternalStore(subscribeParts, partsSnapshot);
  useSyncExternalStore(subscribeTree, treeVersion);
  const { selected } = dispatch("tree.get") as { selected: string | null };
  // primeiro os pontos escolhidos no 3D (ferramenta, filtros, valores), depois o item escolhido na árvore
  return (
    <div className="panel-col scroll props-col">
      <PointsPanel text={props.text} dialect={props.dialect} selNode={props.selNode} />
      <Measures selected={selected} />
      {selected === "root" ? (
        <AssemblyPanel sections={["seam", "close"]} />
      ) : selected?.startsWith("a") ? (
        <AssemblyPanel sections={["asm"]} />
      ) : selected?.startsWith("s") ? (
        <p className="hint" data-testid="props-seam">
          Costura selecionada: veja a lista na árvore. Remova pelo botão × dela.
        </p>
      ) : (
        <AssemblyPanel sections={["part"]} />
      )}
    </div>
  );
}

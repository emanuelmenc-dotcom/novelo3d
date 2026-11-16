// SPDX-License-Identifier: GPL-3.0-or-later
// Painel "Pontos" (seção de Propriedades): quantos pontos estão selecionados e editados. Os valores da ferramenta ficam na
// barra de opções e as ações no ribbon (pergunta 12 em docs/12; `PointControls.tsx`).
import { editSnapshot, partsSnapshot, subscribeEdit, subscribeParts } from "@novelo/commands";
import { useSyncExternalStore } from "react";
import { subscribeTools, toolSnapshot } from "./pointtools.ts";
import type { NodeMeta } from "./view3d.ts";

export function PointsPanel(props: { text: string; dialect: string; selNode: NodeMeta | null }) {
  const tools = useSyncExternalStore(subscribeTools, toolSnapshot);
  const edit = useSyncExternalStore(subscribeEdit, editSnapshot);
  // peças e costuras também entram no desfazer
  useSyncExternalStore(subscribeParts, partsSnapshot);
  // os valores da ferramenta ficam na barra de opções e as ações no ribbon (pergunta 12 em docs/12)
  return (
    <div className="panel-col points" data-testid="points-panel">
      <p className="hint" data-testid="points-info">
        Selecionados: <strong data-testid="sel-count">{edit.selected}</strong>
        {props.selNode?.uid !== undefined && <> · último clique: #{props.selNode.uid}</>}
        {" · "}
        {edit.yarnOverrides + edit.tensionOverrides} pontos editados
      </p>
      {tools.mode === "select" && (
        <p className="hint">Shift + clique soma · Ctrl + clique tira · Alt + arrasto gira a câmera.</p>
      )}
      {tools.error && (
        <p className="warn" role="alert" data-testid="points-error">
          {tools.error}
        </p>
      )}
    </div>
  );
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Janela Propriedades (G4): mostra o que foi escolhido na árvore. Peça: nome, posição, rotação, espelho e troca de fios.
// Projeto (raiz): nova costura e fechar montagem. Costura: dados dela. Os controles são os da antiga janela Montagem.
import { dispatch, partsSnapshot, subscribeParts, subscribeTree, treeVersion } from "@novelo/commands";
import { useSyncExternalStore } from "react";
import { AssemblyPanel } from "./AssemblyPanel.tsx";

export function PropsPanel() {
  useSyncExternalStore(subscribeParts, partsSnapshot);
  useSyncExternalStore(subscribeTree, treeVersion);
  const { selected } = dispatch("tree.get") as { selected: string | null };
  if (selected === "root") return <AssemblyPanel sections={["seam", "close"]} />;
  if (selected?.startsWith("s")) {
    return (
      <div className="panel-col" data-testid="props-seam">
        <p className="hint">Costura selecionada: veja a lista na árvore. Remova pelo botão × dela.</p>
      </div>
    );
  }
  return <AssemblyPanel sections={["part"]} />;
}

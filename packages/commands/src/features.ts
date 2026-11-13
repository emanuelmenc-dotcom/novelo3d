// SPDX-License-Identifier: GPL-3.0-or-later
// Interruptores de recursos pausados (D-57, 2026-11-13). Os três ficam desligados: o código continua no repositório e
// testado nos testes de unidade (que ligam o interruptor de que precisam; os e2e do Render e do Criador ficam pulados e o
// caminho realista do `view3d` não tem e2e), mas some da interface e os comandos recusam. Para retomar um
// recurso, ligue o interruptor abaixo; `docs/15` e `docs/16` dizem o que mais conferir.
//   render        janela Render e comandos `render.*` (render 3D realista, docs/15)
//   stitchEditor  janela "Criador de pontos" e comandos `stitchEditor.*` (docs/16)
//   realistic3d   desenho realista dos pontos no 3D (modelos de ponto e tubo do `stitch3d`); desligado, o 3D desenha o
//                 fio ao longo das ligações do grafo, como o CrochetPARADE
export interface Features {
  render: boolean;
  stitchEditor: boolean;
  realistic3d: boolean;
}

const state: Features = { render: false, stitchEditor: false, realistic3d: false };

export const features = (): Readonly<Features> => state;

/** Liga ou desliga um recurso (usado pelos testes e, quando o recurso voltar, pela configuração). */
export function setFeature(name: keyof Features, on: boolean): void {
  state[name] = on;
}

/** Recurso a que um comando pertence (pelo prefixo do nome), se houver. */
export function featureOfMethod(method: string): keyof Features | undefined {
  if (method.startsWith("render.")) return "render";
  if (method.startsWith("stitchEditor.")) return "stitchEditor";
  return undefined;
}

export const FEATURE_NAMES: Record<keyof Features, string> = {
  render: "render 3D realista",
  stitchEditor: "criador de pontos",
  realistic3d: "3D realista",
};

// SPDX-License-Identifier: GPL-3.0-or-later
// Auxiliar dos testes (G6): reexecutar a linha do tempo a partir do projeto-base tem de dar o mesmo projeto que o estado
// ao vivo. Chamado no afterEach das suites; acha comando sem classificar e entrada que a reexecução não resolve.
import { expect } from "vitest";
import { dispatch, replayTimeline, timelineView } from "../src/index.ts";

type Project = Record<string, unknown>;
// a posição no tutorial e a seleção são da sessão; `uids` é cache do motor (nasce ao calcular o layout)
const strip = (p: Project): string =>
  JSON.stringify(p, (k, v) => (k === "tutorial" || k === "selection" || k === "uids" ? undefined : v));

let skip = false;
/** Até o desfazer virar movimento do marcador (G6, etapa 3) um teste que usa history.undo não é reexecutável. */
export const skipReplayCheck = (): void => {
  skip = true;
};

export function expectReplayMatchesLive(): void {
  if (skip) {
    skip = false;
    return;
  }
  if (!timelineView().hasBase) return;
  const live = strip(dispatch("project.export") as Project);
  replayTimeline();
  const again = strip(dispatch("project.export") as Project);
  expect(JSON.parse(again)).toEqual(JSON.parse(live));
}

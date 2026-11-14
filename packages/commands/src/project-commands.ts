// SPDX-License-Identifier: GPL-3.0-or-later
// Projeto em arquivo (D-58): `project.export` devolve tudo que o app guarda (peças, edições por ponto, paleta e pintura) e
// `project.import` carrega esse conteúdo no lugar do projeto atual. O studio só lê e grava o arquivo (D-21).
import { exportEditAll, loadEditAll } from "./edit-store.ts";
import { exportPaintAll, loadPaintAll } from "./paint-store.ts";
import { exportParts, loadParts, partsSnapshot, rootOf, validPartCount } from "./parts-store.ts";
import { exportTimeline, importTimeline } from "./timeline.ts";
import { exportTutorial, loadTutorial } from "./tutorial-store.ts";

type Params = Record<string, unknown>;

export const PROJECT_APP = "novelo3d";
export const PROJECT_VERSION = 1;

export function exportProject() {
  const ids = partsSnapshot().parts.map((q) => q.id);
  return {
    app: PROJECT_APP,
    version: PROJECT_VERSION,
    parts: exportParts(),
    edit: exportEditAll(ids),
    paint: exportPaintAll(ids),
    tutorial: exportTutorial(ids),
  };
}

/** Troca o projeto atual pelo do arquivo. Recusa, sem mexer em nada, o que não for projeto do Novelo3D com peças. */
export function importProject(raw: unknown, checkOnly = false): { parts: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || o.app !== PROJECT_APP) {
    throw new Error("o arquivo não é um projeto do Novelo3D");
  }
  if (o.version !== PROJECT_VERSION) throw new Error(`versão de projeto não suportada: ${String(o.version)}`);
  const n = validPartCount(o.parts);
  if (n === 0) throw new Error("o projeto do arquivo não tem peças válidas");
  if (checkOnly) return { parts: n };
  loadParts(o.parts, { text: "" });
  const root = rootOf(partsSnapshot().active).id;
  loadPaintAll(o.paint, root);
  loadEditAll(o.edit, root);
  loadTutorial(o.tutorial); // projetos antigos não têm: a posição recomeça
  importTimeline(o.timeline); // projetos antigos não têm: a linha do tempo recomeça vazia
  return { parts: partsSnapshot().parts.length };
}

export const projectCommands: Record<string, (p: Params) => unknown> = {
  /** Todo o projeto como JSON (versão 1): parts, edit, paint. */
  "project.export": () => ({ ...exportProject(), timeline: exportTimeline() }),
  /** Substitui o projeto atual por `project` (o JSON de `project.export`). Com `check: true` só confere o arquivo, sem carregar. Erro claro e nada muda se o arquivo for inválido. */
  "project.import": (p) => importProject(p.project, p.check === true),
};

// SPDX-License-Identifier: GPL-3.0-or-later
// Painel "Criador de pontos" (etapa D, docs/16): monta um ponto comando a comando (laçada, inserir numa base, puxar por k
// alças, fim do ponto) e mostra o diagrama de nós. Os botões vêm do que a máquina de estados aceita (`allowed` e
// `insertBases`) e toda ação passa por `dispatch`, o mesmo caminho da ponte MCP (D-21). Guardar o ponto é a etapa E.
import { dispatch, stitchEditorVersion, subscribeStitchEditor } from "@novelo/commands";
import { useMemo, useSyncExternalStore } from "react";

interface Cmd {
  kind: "yo" | "insert" | "draw" | "finish";
  base?: number;
  k?: number;
}

interface View {
  cmds: Cmd[];
  loops: number;
  allowed: { yo: boolean; insert: boolean; drawMax: number; finish: boolean };
  insertBases: number[];
  selectedBase: number;
  hand: "right" | "left";
  bases: number;
  summary: { type: string | null; legs: number; exact: boolean; complete: boolean };
  canUndo: boolean;
  svg: string;
  width: number;
  height: number;
}

const TYPE_NAMES: Record<string, string> = {
  CH: "corrente",
  SL: "ponto baixíssimo",
  SC: "ponto baixo",
  HDC: "meio ponto alto",
  DC: "ponto alto",
  TR: "ponto alto duplo",
};

const describe = (c: Cmd): string =>
  c.kind === "yo"
    ? "laçada"
    : c.kind === "insert"
      ? `inserir na base ${c.base}`
      : c.kind === "draw"
        ? `puxar por ${c.k}`
        : "fim do ponto";

export function StitchEditorPanel() {
  const version = useSyncExternalStore(subscribeStitchEditor, stitchEditorVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o estado muda quando a versão muda
  const v = useMemo(() => dispatch("stitchEditor.state") as View, [version]);
  const run = (method: string, params: Record<string, unknown> = {}): void => {
    try {
      dispatch(method, params);
    } catch (e) {
      console.warn((e as Error).message);
    }
  };
  const apply = (c: Cmd): void => run("stitchEditor.apply", c as unknown as Record<string, unknown>);
  const draws = Array.from({ length: v.allowed.drawMax }, (_, i) => i + 1);
  const baseList = Array.from({ length: v.bases }, (_, b) => b);
  const type = v.summary.type;
  return (
    <div className="panel-col scroll" data-testid="stitch-editor">
      <div
        className="stitch-editor-diagram"
        data-testid="stitch-diagram"
        style={{ aspectRatio: `${v.width} / ${v.height}` }}
      >
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: o SVG vem de stitchDiagramSvg (módulo puro, sem texto do usuário: não há legenda) */}
        <div dangerouslySetInnerHTML={{ __html: v.svg }} />
      </div>
      <p className="hint" data-testid="stitch-summary">
        {type === null
          ? "Escolha o primeiro comando."
          : `Mais parecido com: ${TYPE_NAMES[type] ?? type} (${v.summary.legs} perna${v.summary.legs === 1 ? "" : "s"})${v.summary.exact ? "" : ", aproximado"}${v.summary.complete ? ". Ponto terminado." : "."}`}{" "}
        <span data-testid="stitch-loops">Alças na agulha: {v.loops}.</span>
      </p>
      <div className="row">
        <button type="button" disabled={!v.allowed.yo} onClick={() => apply({ kind: "yo" })}>
          Laçada
        </button>
        <button
          type="button"
          disabled={!v.allowed.insert || v.insertBases.length === 0}
          onClick={() => apply({ kind: "insert" })}
        >
          Inserir na base {v.selectedBase}
        </button>
        {draws.map((k) => (
          <button key={k} type="button" onClick={() => apply({ kind: "draw", k })}>
            Puxar por {k}
          </button>
        ))}
        <button type="button" disabled={!v.allowed.finish} onClick={() => apply({ kind: "finish" })}>
          Fim do ponto
        </button>
      </div>
      <div className="row">
        <span>Base:</span>
        {baseList.map((b) => (
          <button
            key={b}
            type="button"
            className={b === v.selectedBase ? "on" : ""}
            disabled={!v.insertBases.includes(b)}
            onClick={() => run("stitchEditor.selectBase", { base: b })}
          >
            {b}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" disabled={!v.canUndo} onClick={() => run("stitchEditor.undo")}>
          Desfazer
        </button>
        <button type="button" disabled={!v.canUndo} onClick={() => run("stitchEditor.reset")}>
          Recomeçar
        </button>
        <button
          type="button"
          className={v.hand === "right" ? "on" : ""}
          onClick={() => run("stitchEditor.setHand", { hand: "right" })}
        >
          Destro
        </button>
        <button
          type="button"
          className={v.hand === "left" ? "on" : ""}
          onClick={() => run("stitchEditor.setHand", { hand: "left" })}
        >
          Canhoto
        </button>
      </div>
      <p className="hint" data-testid="stitch-history">
        {v.cmds.length === 0 ? "Nenhum comando ainda." : v.cmds.map(describe).join(" → ")}
      </p>
    </div>
  );
}

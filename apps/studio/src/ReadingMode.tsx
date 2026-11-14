// SPDX-License-Identifier: GPL-3.0-or-later
// Modo de leitura (G2, D-66): o tutorial passo a passo em tela cheia. As ferramentas de edição somem; fica o 3D com o passo
// atual e uma faixa embaixo com a cadeia de pontos, a volta inteira, os avisos e as teclas, grandes. Tudo anda pelos
// comandos `tutorial.*` (D-21), o mesmo caminho da ponte MCP.
import { dispatch, paintSnapshot } from "@novelo/commands";
import { type ReactNode, useEffect, useRef } from "react";
import { Icon } from "./icons.tsx";
import { VIEWS } from "./views.ts";

export interface ReadingData {
  total: number;
  rounds: number;
  milestones: number;
  milestone: { index: number; title: string; manual: boolean; fromRound: number; toRound: number } | null;
  index: number;
  step: {
    kind: "step" | "review" | "state";
    round: number;
    rowLabel: string;
    positionInRow: number;
    rowTotal: number;
    instruction: string;
    count: number;
    yarnId: string;
    alerts: ("yarnChange" | "rowStart" | "rowEnd")[];
    repetition?: { i: number; k: number };
    line: string;
    milestone: number;
  } | null;
}

/** Teclas do modo de leitura, da mais usada para a menos usada: a tela mostra esta lista e o ouvinte lê a mesma. */
const KEYS: { on: string[]; show: string; text: string; method: string; big?: boolean }[] = [
  { on: [" ", "ArrowRight"], show: "Espaço  →", text: "próximo", method: "tutorial.next", big: true },
  {
    on: ["ArrowLeft", "Backspace"],
    show: "←  Backspace",
    text: "voltar",
    method: "tutorial.prev",
    big: true,
  },
  { on: ["ArrowUp"], show: "↑", text: "próxima volta", method: "tutorial.nextRound" },
  { on: ["ArrowDown"], show: "↓", text: "volta anterior", method: "tutorial.prevRound" },
  { on: ["PageUp"], show: "Pg Up", text: "próximo marco", method: "tutorial.nextMilestone" },
  { on: ["PageDown"], show: "Pg Dn", text: "marco anterior", method: "tutorial.prevMilestone" },
  { on: ["Home"], show: "Home", text: "início", method: "tutorial.first" },
  { on: ["End"], show: "End", text: "fim", method: "tutorial.last" },
  { on: ["f"], show: "F", text: "ver ponto", method: "show" },
  { on: ["r"], show: "R", text: "revisão", method: "review" },
  { on: ["Escape"], show: "Esc", text: "sair", method: "exit" },
];

interface Latest {
  run: (method: string, extra?: Record<string, unknown>) => void;
  onExit: () => void;
  onShow: () => void;
  kind: string | undefined;
}

/** O que a tecla faz; undefined para as que não são do modo de leitura. */
function keyAction(key: string, c: Latest): (() => void) | undefined {
  const k = KEYS.find((x) => x.on.includes(key));
  if (!k) return undefined;
  if (k.method === "show") return c.onShow;
  if (k.method === "exit") return c.onExit;
  if (k.method === "review")
    return () => c.run("tutorial.slide", { kind: c.kind === "review" ? "state" : "review" });
  return () => c.run(k.method);
}

export function ReadingMode(props: {
  data: ReadingData | null;
  error: string | null;
  /** A contagem da receita não fecha: o modo de leitura segue a receita como está e avisa. */
  countWarning: boolean;
  params: () => Record<string, unknown>;
  onExit: () => void;
  onShow: () => void;
  children: ReactNode;
}) {
  const { data, error, countWarning, params, onExit, onShow, children } = props;

  const run = (method: string, extra: Record<string, unknown> = {}) => {
    try {
      dispatch(method, { ...params(), ...extra });
    } catch {
      // receita inválida: nada a andar
    }
  };

  // o ouvinte de teclas é instalado uma vez e lê sempre a versão mais nova destas funções
  const latest = useRef({ run, onExit, onShow, kind: data?.step?.kind });
  latest.current = { run, onExit, onShow, kind: data?.step?.kind };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const act = keyAction(key, latest.current);
      if (act) {
        act();
        e.preventDefault();
      } else if (key in VIEWS) {
        window.__view3d?.snapView([...VIEWS[key as keyof typeof VIEWS].dir] as [number, number, number]);
        e.preventDefault();
      }
    };
    // Espaço num botão com foco clicaria nele ao soltar: a tecla é só do modo de leitura
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, []);

  const s = data?.step ?? null;
  const yarn = s ? paintSnapshot().yarns.find((y) => y.id === s.yarnId) : undefined;
  const m = data?.milestone ?? null;

  return (
    <div className="reading" data-testid="reading">
      <div className="reading-view">{children}</div>
      <footer className="reading-strip" data-testid="tutorial">
        {error && (
          <p className="error" data-testid="tutorial-error">
            {error}
          </p>
        )}
        {!error && !s && <p className="hint">Escreva uma receita para ler o passo a passo.</p>}
        {s && data && (
          <div className="reading-main">
            <div className="reading-now" data-testid="tutorial-text">
              {s.kind === "step" ? (
                <>
                  <span className="reading-where">
                    Volta {s.rowLabel} · cadeia {s.positionInRow} de {s.rowTotal}
                    {s.repetition ? ` · repetição ${s.repetition.i} de ${s.repetition.k}` : ""}
                  </span>
                  <strong className="reading-chain">{s.instruction}</strong>
                  <span className="reading-line">{s.line}</span>
                </>
              ) : (
                <>
                  <span className="reading-where">
                    {s.kind === "review" ? "Revisão" : "Estado atual"} · marco {(m?.index ?? 0) + 1} de{" "}
                    {data.milestones}
                  </span>
                  <strong className="reading-chain">{m?.title}</strong>
                  <span className="reading-line">
                    {s.kind === "review"
                      ? `${m && m.fromRound !== m.toRound ? `Voltas ${m.fromRound} a ${m.toRound}` : `Volta ${m?.toRound}`}: o que foi feito desde o último marco (em destaque no 3D).`
                      : "Como a peça deve estar agora: compare com a sua."}
                  </span>
                </>
              )}
            </div>
            <div className="reading-alerts" data-testid="tutorial-alerts">
              {s.kind === "step" && s.alerts.includes("rowStart") && <p>Começa a volta {s.rowLabel}.</p>}
              {s.kind === "step" && s.alerts.includes("yarnChange") && (
                <p className="warn">
                  Troque para o fio {s.yarnId}
                  {yarn ? ` (${yarn.name})` : ""}.
                </p>
              )}
              {s.kind === "step" && s.alerts.includes("rowEnd") && <p>Fim da volta {s.rowLabel}.</p>}
              {countWarning && (
                <p className="warn" data-testid="tutorial-count-warning">
                  A contagem da receita não fecha: a leitura segue a receita como está escrita.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="reading-bar">
          <button
            type="button"
            className="reading-btn"
            data-testid="tutorial-prev"
            disabled={!data || data.index <= 0}
            title="Voltar (←)"
            onClick={() => run("tutorial.prev")}
          >
            <Icon name="prev" size={28} /> Voltar
          </button>
          <button
            type="button"
            className="reading-btn primary"
            data-testid="tutorial-next"
            disabled={!data || data.index >= data.total - 1}
            title="Próximo (Espaço ou →)"
            onClick={() => run("tutorial.next")}
          >
            Próximo <Icon name="next" size={32} />
          </button>
          <label className="rc-field">
            Ir para a volta
            <select
              data-testid="tutorial-round"
              disabled={!data}
              value={s?.round ?? 1}
              onChange={(e) => {
                run("tutorial.goto", { round: Number(e.target.value) });
                e.currentTarget.blur(); // com o foco no seletor as teclas do modo de leitura não chegariam
              }}
            >
              {Array.from({ length: data?.rounds ?? 1 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" data-testid="tutorial-show" title="Mostrar o ponto (F)" onClick={onShow}>
            <Icon name="eye" size={18} /> Ver ponto
          </button>
          <button
            type="button"
            data-testid="reading-review"
            title="Revisão do marco (R)"
            disabled={!data}
            onClick={() => run("tutorial.slide", { kind: "review" })}
          >
            Revisão
          </button>
          <button
            type="button"
            data-testid="reading-exit"
            title="Sair do modo de leitura (Esc)"
            onClick={onExit}
          >
            Sair
          </button>
          <span className="reading-progress" data-testid="tutorial-progress">
            {data
              ? `Passo ${data.index + 1} de ${data.total} · volta ${s?.round ?? 0} de ${data.rounds}`
              : ""}
          </span>
        </div>
        <ul className="reading-keys" aria-label="Teclas do modo de leitura">
          {KEYS.map((k) => (
            <li key={k.show} className={k.big ? "big" : ""}>
              <kbd>{k.show}</kbd> {k.text}
            </li>
          ))}
          <li>
            <kbd>1</kbd>–<kbd>6</kbd> <kbd>0</kbd> vistas
          </li>
        </ul>
      </footer>
    </div>
  );
}

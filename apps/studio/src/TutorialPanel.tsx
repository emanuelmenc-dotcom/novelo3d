// SPDX-License-Identifier: GPL-3.0-or-later
// Painel "Tutorial" (P4): mostra o passo atual da receita e anda pelos passos (anterior, próximo, ir à volta). O 3D destaca
// o ponto e as bases na hora. Tudo passa pelos comandos `tutorial.*` (D-21), o mesmo caminho da ponte MCP.
import { dispatch, paintSnapshot } from "@novelo/commands";

export interface TutorialData {
  total: number;
  rounds: number;
  index: number;
  step: {
    round: number;
    rowLabel: string;
    positionInRow: number;
    rowTotal: number;
    instruction: string;
    yarnId: string;
    alerts: ("yarnChange" | "rowStart" | "rowEnd")[];
  } | null;
}

export function TutorialPanel(props: {
  data: TutorialData | null;
  error: string | null;
  /** A contagem da receita não fecha: o tutorial segue a receita como está e avisa. */
  countWarning: boolean;
  text: string;
  dialect: string;
  part: string;
  /** Leva a câmera do 3D ao ponto atual (ausente sem 3D à vista). */
  onShow?: () => void;
}) {
  const { data, error, countWarning, text, dialect, part, onShow } = props;
  const run = (method: string, extra: Record<string, unknown> = {}): void => {
    try {
      dispatch(method, { text, ...(dialect !== "auto" ? { dialect } : {}), part, ...extra });
    } catch (e) {
      console.warn((e as Error).message);
    }
  };
  if (error) {
    return (
      <div className="panel-col" data-testid="tutorial">
        <p className="error" data-testid="tutorial-error">
          {error}
        </p>
      </div>
    );
  }
  if (!data?.step) {
    return (
      <div className="panel-col" data-testid="tutorial">
        <p className="hint">Escreva uma receita para ver o passo a passo.</p>
      </div>
    );
  }
  const s = data.step;
  const rounds = Array.from({ length: data.rounds }, (_, i) => i + 1);
  const yarn = paintSnapshot().yarns.find((y) => y.id === s.yarnId);
  return (
    <div className="panel-col" data-testid="tutorial">
      <p className="tutorial-step" data-testid="tutorial-text">
        Volta {s.rowLabel}, ponto {s.positionInRow} de {s.rowTotal}: <strong>{s.instruction}</strong>
      </p>
      <p className="hint" data-testid="tutorial-progress">
        Passo {data.index + 1} de {data.total} · volta {s.round} de {data.rounds}
      </p>
      <div className="tutorial-alerts" data-testid="tutorial-alerts">
        {s.alerts.includes("rowStart") && <p>Começa a volta {s.rowLabel}.</p>}
        {s.alerts.includes("yarnChange") && (
          <p className="warn">
            Troque para o fio {s.yarnId}
            {yarn ? ` (${yarn.name})` : ""}.
          </p>
        )}
        {s.alerts.includes("rowEnd") && <p>Fim da volta {s.rowLabel}.</p>}
      </div>
      {countWarning && (
        <p className="warn" data-testid="tutorial-count-warning">
          A contagem da receita não fecha: o passo a passo segue a receita como está escrita.
        </p>
      )}
      <div className="row">
        <button
          type="button"
          data-testid="tutorial-prev"
          disabled={data.index <= 0}
          onClick={() => run("tutorial.prev")}
        >
          Anterior
        </button>
        <button
          type="button"
          data-testid="tutorial-next"
          disabled={data.index >= data.total - 1}
          onClick={() => run("tutorial.next")}
        >
          Próximo
        </button>
        {onShow && (
          <button type="button" data-testid="tutorial-show" onClick={onShow}>
            Mostrar ponto
          </button>
        )}
        <label>
          Ir para a volta{" "}
          <select
            data-testid="tutorial-round"
            value={s.round}
            onChange={(e) => run("tutorial.goto", { round: Number(e.target.value) })}
          >
            {rounds.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">Setas esquerda e direita também andam os passos.</p>
    </div>
  );
}

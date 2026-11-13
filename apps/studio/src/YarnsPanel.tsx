// SPDX-License-Identifier: GPL-3.0-or-later
// Painel "Fios": paleta, pincel, pintura por voltas ou pontos, lista de regiões, consumo e a receita com as trocas.
// Tudo passa pelos comandos yarns.* e paint.* (D-21): o MCP pinta e lê o mesmo estado.
import { dispatch, nextYarnId, paintSnapshot, subscribePaint, type Yarn } from "@novelo/commands";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { NodeMeta } from "./view3d.ts";
import { YarnEditor } from "./YarnEditor.tsx";

interface Report {
  changes: { round: number; from: string | null; to: string; atStitch: number; text: string }[];
  changeCount: number;
  recipe: string;
  usage: {
    yarn: string;
    name: string;
    stitches: number;
    lengthM: number;
    share: number;
    gramsApprox: number | null;
  }[];
  issues: { code: string; message: string }[];
}

/** "7" ou "7–12" -> [7, 12]. */
function roundsOf(label: string | null): [number, number] | null {
  if (!label) return null;
  const m = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(label.trim());
  if (!m) return null;
  const a = Number(m[1]);
  return [a, m[2] ? Number(m[2]) : a];
}

export function YarnsPanel(props: {
  text: string;
  dialect: string;
  selLabel: string | null;
  selNode: NodeMeta | null;
}) {
  const { yarns, paint } = useSyncExternalStore(subscribePaint, paintSnapshot);
  const [brush, setBrush] = useState("B");
  const [from, setFrom] = useState(7);
  const [to, setTo] = useState(9);
  const [width, setWidth] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const run = (method: string, params: Record<string, unknown> = {}) => {
    try {
      dispatch(method, params);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const brushId = yarns.some((y) => y.id === brush) ? brush : (yarns[0]?.id ?? "A");

  // o relatório depende também da pintura e da paleta (estado dos comandos), por isso estão nas dependências
  // biome-ignore lint/correctness/useExhaustiveDependencies: yarns e paint só invalidam o cálculo
  const report = useMemo<Report | null>(() => {
    try {
      return dispatch("paint.report", {
        text: props.text,
        dialect: props.dialect,
        stitchWidthMm: width,
      }) as Report;
    } catch {
      return null;
    }
  }, [props.text, props.dialect, width, yarns, paint]);

  const setYarn = (id: string, patch: Partial<Yarn>) =>
    run("yarns.set", { yarns: yarns.map((y) => (y.id === id ? { ...y, ...patch } : y)) });
  const addYarn = () => {
    const id = nextYarnId(yarns);
    if (!id) return setError("a paleta está cheia (8 fios)");
    // o fio novo segue o padrão das configurações (tipo de cor, material, espessura), com cor diferente
    run("yarns.add", {});
    setBrush(id);
  };
  const removeYarn = (id: string) => run("yarns.set", { yarns: yarns.filter((y) => y.id !== id) });

  const selRounds = roundsOf(props.selLabel);
  const node = props.selNode && props.selNode.row >= 0 ? props.selNode : null;
  const name = (id: string) => yarns.find((y) => y.id === id)?.name ?? id;
  const color = (id: string) => yarns.find((y) => y.id === id)?.colorHex;
  const describe = (i: number) => {
    const r = paint[i];
    if (!r) return "";
    if (r.kind === "rows") return `Voltas ${r.from}${r.to > r.from ? `–${r.to}` : ""}`;
    const first = r.at[0] as { row: number; index: number };
    return `${r.at.length} ponto(s), ex.: volta ${first.row}, ponto ${first.index + 1}`;
  };

  return (
    <div className="panel-col scroll yarns">
      <h3>Paleta</h3>
      <ul className="yarn-list" aria-label="Paleta de fios">
        {yarns.map((y) => (
          <li key={y.id} data-yarn={y.id}>
            <label title="Pincel: com este fio as próximas pinturas">
              <input
                type="radio"
                name="brush"
                aria-label={`Pincel do fio ${y.id}`}
                checked={brushId === y.id}
                onChange={() => setBrush(y.id)}
              />{" "}
              <strong>{y.id}</strong>
            </label>
            <input
              type="color"
              aria-label={`Cor do fio ${y.id}`}
              value={y.colorHex}
              onChange={(e) => setYarn(y.id, { colorHex: e.target.value })}
            />
            <input
              aria-label={`Nome do fio ${y.id}`}
              value={y.name}
              maxLength={40}
              onChange={(e) => setYarn(y.id, { name: e.target.value })}
            />
            <button
              type="button"
              aria-label={`Editar fio ${y.id}`}
              aria-expanded={editing === y.id}
              onClick={() => setEditing(editing === y.id ? null : y.id)}
            >
              {editing === y.id ? "Fechar" : "Editar"}
            </button>
            {y.id !== "A" && (
              <button type="button" aria-label={`Remover fio ${y.id}`} onClick={() => removeYarn(y.id)}>
                ×
              </button>
            )}
            {editing === y.id && <YarnEditor yarn={y} onChange={(patch) => setYarn(y.id, patch)} />}
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" onClick={addYarn}>
          Adicionar fio
        </button>
      </div>

      <h3>Pintar com o fio {brushId}</h3>
      <div className="row">
        <label>
          Voltas de{" "}
          <input
            type="number"
            aria-label="Pintar de volta"
            min={1}
            value={from}
            onChange={(e) => setFrom(Number(e.target.value))}
            className="num"
          />
        </label>
        <label>
          até{" "}
          <input
            type="number"
            aria-label="Pintar até a volta"
            min={1}
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
            className="num"
          />
        </label>
        <button type="button" onClick={() => run("paint.rows", { yarn: brushId, from, to })}>
          Pintar voltas
        </button>
      </div>
      <div className="row">
        <button
          type="button"
          disabled={!selRounds}
          onClick={() =>
            selRounds && run("paint.rows", { yarn: brushId, from: selRounds[0], to: selRounds[1] })
          }
          title="Escolha uma volta na tabela de verificação ou clique num ponto do 3D"
        >
          Pintar volta selecionada{props.selLabel ? ` (${props.selLabel})` : ""}
        </button>
        <button
          type="button"
          disabled={!node}
          onClick={() =>
            node && run("paint.stitches", { yarn: brushId, at: [{ row: node.row + 1, index: node.index }] })
          }
          title="Clique num ponto no 3D"
        >
          Pintar ponto selecionado{node ? ` (volta ${node.row + 1}, ponto ${node.index + 1})` : ""}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <h3>Pinturas ({paint.length})</h3>
      {paint.length === 0 && <p className="hint">Nenhuma pintura: a peça toda é do fio A.</p>}
      <ul className="paint-list" aria-label="Pinturas">
        {paint.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a lista é ordenada e a posição é a identidade da região
          <li key={i} data-paint={i}>
            <span className="swatch" style={{ background: color(r.yarn) }} />
            <span>
              {describe(i)} → fio {r.yarn} ({name(r.yarn)})
            </span>
            <button
              type="button"
              aria-label={`Remover pintura ${i + 1}`}
              onClick={() => run("paint.remove", { index: i })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {paint.length > 0 && (
        <div className="row">
          <button type="button" onClick={() => run("paint.clear")}>
            Limpar pintura
          </button>
        </div>
      )}

      <h3>Consumo por fio</h3>
      <label className="block">
        Largura do ponto (mm){" "}
        <input
          type="number"
          aria-label="Largura do ponto em mm"
          min={1}
          max={30}
          step={0.5}
          value={width}
          onChange={(e) => setWidth(Math.max(1, Number(e.target.value) || 5))}
          className="num"
        />
      </label>
      <table data-testid="usage-table">
        <thead>
          <tr>
            <th>Fio</th>
            <th>Pontos</th>
            <th>Metros</th>
            <th>g≈</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {report?.usage.map((u) => (
            <tr key={u.yarn} data-usage={u.yarn}>
              <td>
                <span className="swatch" style={{ background: color(u.yarn) }} /> {u.yarn} {u.name}
              </td>
              <td>{u.stitches}</td>
              <td>{u.lengthM.toFixed(2)}</td>
              <td>{u.gramsApprox === null ? "–" : u.gramsApprox.toFixed(0)}</td>
              <td>{Math.round(u.share * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Estimativa: 4,2 × a largura do ponto por ponto baixo; calibre com uma amostra.</p>

      <h3>Receita com as trocas de fio ({report?.changeCount ?? 0})</h3>
      <textarea
        aria-label="Receita com trocas de fio"
        readOnly
        value={report?.recipe ?? ""}
        className="cp"
        data-testid="recipe-yarns"
      />
      <div className="row">
        <button type="button" onClick={() => navigator.clipboard?.writeText(report?.recipe ?? "")}>
          Copiar
        </button>
      </div>
      {report?.issues
        .filter((i) => i.code.startsWith("PAINT_"))
        .map((i) => (
          <p key={i.message} className="warn">
            {i.message}
          </p>
        ))}
    </div>
  );
}

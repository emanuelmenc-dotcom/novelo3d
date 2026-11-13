// SPDX-License-Identifier: GPL-3.0-or-later
// Lista de materiais: fios do projeto com consumo por peça, edição de qualquer propriedade e troca de um fio por outro
// em todo o projeto; e as costuras com o fio de costura. Tudo via comandos (materials.*, yarns.*, seam.*; D-21).
import {
  dispatch,
  paintSnapshot,
  partsSnapshot,
  settingsSnapshot,
  subscribePaint,
  subscribeParts,
  subscribeSettings,
  type Yarn,
} from "@novelo/commands";
import { useMemo, useState, useSyncExternalStore } from "react";
import { YarnEditor } from "./YarnEditor.tsx";

interface Row extends Yarn {
  stitches: number;
  lengthM: number;
  gramsApprox: number | null;
  used: boolean;
  parts: { id: string; name: string; stitches: number }[];
}
interface SeamRow {
  id: string;
  name: string;
  type: string;
  pairs: number;
  lengthM: number;
  ok: boolean;
}
interface List {
  yarns: Row[];
  seams: SeamRow[];
  seamLengthM: number;
  note: string;
}

const SEAM_TYPES: [string, string][] = [
  ["mattress", "Ponto invisível (colchão)"],
  ["whip", "Chuleio (ponto de arremate)"],
  ["slip", "Ponto baixíssimo"],
  ["sc", "Ponto baixo"],
];

export function MaterialsPanel(props: { version?: number }) {
  const { yarns } = useSyncExternalStore(subscribePaint, paintSnapshot);
  const parts = useSyncExternalStore(subscribeParts, partsSnapshot);
  const settings = useSyncExternalStore(subscribeSettings, settingsSnapshot);
  const [selected, setSelected] = useState("B");
  const [target, setTarget] = useState("");
  const [remove, setRemove] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a paleta, as peças, as edições e as configurações invalidam a lista
  const list = useMemo<List | null>(() => {
    try {
      return dispatch("materials.list") as List;
    } catch {
      return null;
    }
  }, [yarns, parts.version, props.version, settings]);

  const run = (method: string, params: Record<string, unknown> = {}) => {
    try {
      const r = dispatch(method, params);
      setError(null);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  };
  const sel = yarns.find((y) => y.id === selected) ?? yarns[0];
  const others = yarns.filter((y) => y.id !== sel?.id);
  const to = others.some((y) => y.id === target) ? target : (others[0]?.id ?? "");
  const setYarn = (id: string, patch: Partial<Yarn>) =>
    run("yarns.set", { yarns: yarns.map((y) => (y.id === id ? { ...y, ...patch } : y)) });
  const row = (id: string) => list?.yarns.find((r) => r.id === id);

  return (
    <div className="panel-col scroll materials" data-testid="materials-panel">
      <h3>Fios</h3>
      <table data-testid="materials-table">
        <thead>
          <tr>
            <th />
            <th>Fio</th>
            <th>Nome</th>
            <th>Pontos</th>
            <th>Metros</th>
            <th>g≈</th>
            <th>Peças</th>
          </tr>
        </thead>
        <tbody>
          {yarns.map((y) => {
            const r = row(y.id);
            return (
              <tr key={y.id} data-material={y.id} className={sel?.id === y.id ? "on" : ""}>
                <td>
                  <input
                    type="radio"
                    name="material-sel"
                    aria-label={`Selecionar fio ${y.id}`}
                    checked={sel?.id === y.id}
                    onChange={() => setSelected(y.id)}
                  />
                </td>
                <td>
                  <span className="swatch" style={{ background: y.colorHex }} /> <strong>{y.id}</strong>
                </td>
                <td>
                  <input
                    aria-label={`Nome do fio ${y.id} na lista`}
                    value={y.name}
                    maxLength={40}
                    onChange={(e) => setYarn(y.id, { name: e.target.value })}
                  />
                </td>
                <td>{r?.stitches ?? 0}</td>
                <td>{(r?.lengthM ?? 0).toFixed(2)}</td>
                <td>{r?.gramsApprox == null ? "–" : r.gramsApprox.toFixed(0)}</td>
                <td className="hint">{r?.parts.map((q) => q.name).join(", ") || "não usado"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sel && (
        <fieldset data-testid="material-selected">
          <legend>
            Fio {sel.id} · {sel.name}
          </legend>
          <div className="row">
            <label>
              Trocar por{" "}
              <select aria-label="Trocar pelo fio" value={to} onChange={(e) => setTarget(e.target.value)}>
                {others.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.id} · {y.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} /> remover
              o fio {sel.id} depois
            </label>
            <button
              type="button"
              data-testid="material-replace"
              disabled={!to}
              onClick={() => {
                const r = run("materials.replace", { from: sel.id, to, remove: remove && sel.id !== "A" }) as
                  | { changed: number }
                  | undefined;
                if (r) setInfo(`Fio ${sel.id} trocado por ${to} em ${r.changed} lugar(es).`);
              }}
            >
              Trocar em todo o projeto
            </button>
          </div>
          {sel.id === "A" && (
            <p className="hint">O fio A é o base: ele passa a ter as propriedades do fio escolhido.</p>
          )}
          {info && (
            <p className="ok" data-testid="material-info">
              {info}
            </p>
          )}
          <YarnEditor yarn={sel} onChange={(patch) => setYarn(sel.id, patch)} />
        </fieldset>
      )}

      <h3>Costuras ({list?.seams.length ?? 0})</h3>
      <p className="hint">
        Fio de costura padrão:{" "}
        <span className="swatch" style={{ background: settings.yarns.seam.colorHex }} />{" "}
        {settings.yarns.seam.colorHex} (mude em Configurações › Fios e costura). Consumo estimado:{" "}
        {(list?.seamLengthM ?? 0).toFixed(2)} m.
      </p>
      <table data-testid="materials-seams">
        <tbody>
          {list?.seams.map((s) => (
            <tr key={s.id} data-seam-row={s.id}>
              <td className={s.ok ? "ok" : "warn"}>{s.ok ? "✓" : "✗"}</td>
              <td>{s.name}</td>
              <td>
                <select
                  aria-label={`Ponto da costura ${s.name}`}
                  value={s.type}
                  onChange={(e) => run("seam.set", { id: s.id, type: e.target.value })}
                >
                  {SEAM_TYPES.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </td>
              <td>{s.pairs} pares</td>
              <td>{s.lengthM.toFixed(2)} m</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list && <p className="hint">{list.note}</p>}
      {error && (
        <p className="warn" role="alert" data-testid="materials-error">
          {error}
        </p>
      )}
    </div>
  );
}

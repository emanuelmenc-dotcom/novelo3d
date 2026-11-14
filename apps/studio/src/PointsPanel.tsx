// SPDX-License-Identifier: GPL-3.0-or-later
// Painel "Pontos": ferramenta do botão esquerdo no 3D (girar, selecionar, pintar fio, editar tensão), filtros de
// seleção, operações sobre a seleção e histórico. Tudo passa pelos comandos (D-21), o mesmo que o MCP usa.
import {
  dispatch,
  editSnapshot,
  paintSnapshot,
  partsSnapshot,
  subscribeEdit,
  subscribePaint,
  subscribeParts,
} from "@novelo/commands";
import { useState, useSyncExternalStore } from "react";
import { setTools, subscribeTools, toolSnapshot } from "./pointtools.ts";
import type { NodeMeta } from "./view3d.ts";

const CODES = ["CH", "SL", "SC", "HDC", "DC", "TR"];

export function PointsPanel(props: { text: string; dialect: string; selNode: NodeMeta | null }) {
  const tools = useSyncExternalStore(subscribeTools, toolSnapshot);
  const edit = useSyncExternalStore(subscribeEdit, editSnapshot);
  // peças e costuras também entram no desfazer
  useSyncExternalStore(subscribeParts, partsSnapshot);
  const { yarns } = useSyncExternalStore(subscribePaint, paintSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [fYarn, setFYarn] = useState("");
  const [fCode, setFCode] = useState("");
  const [gFrom, setGFrom] = useState("");
  const [gTo, setGTo] = useState("");
  const [tFrom, setTFrom] = useState("-1");
  const [tTo, setTTo] = useState("1");
  const [stripe, setStripe] = useState("A2 B1");
  const [gradFrom, setGradFrom] = useState(-0.5);
  const [gradTo, setGradTo] = useState(0.5);

  const run = (method: string, params: Record<string, unknown> = {}) => {
    try {
      const r = dispatch(method, { text: props.text, dialect: props.dialect, ...params });
      setError(null);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  };
  const msg = error ?? tools.error;
  const yarnId = yarns.some((y) => y.id === tools.yarn) ? tools.yarn : (yarns[0]?.id ?? "A");

  const applyFilter = () => {
    const by: Record<string, unknown> = { kind: "filter" };
    if (fYarn) by.yarns = [fYarn];
    if (fCode) by.codes = [fCode];
    if (gFrom !== "" || gTo !== "") by.group = [Number(gFrom || 1), Number(gTo || 9999)];
    if (tFrom !== "-1" || tTo !== "1") by.tension = [Number(tFrom), Number(tTo)];
    if (tools.op === "intersect" || tools.op === "remove") by.within = undefined;
    run("selection.select", { by, op: tools.op });
  };

  const parseStripes = (): [string, number][] =>
    stripe
      .trim()
      .split(/\s+/)
      .map((t) => {
        const m = /^([A-Za-z])(\d*)$/.exec(t);
        if (!m) throw new Error(`listra '${t}' inválida (use letra e voltas, ex.: A2 B1)`);
        return [(m[1] as string).toUpperCase(), Number(m[2] || 1)];
      });

  return (
    <div className="panel-col points" data-testid="points-panel">
      <p className="hint" data-testid="points-info">
        Selecionados: <strong data-testid="sel-count">{edit.selected}</strong>
        {props.selNode?.uid !== undefined && <> · último clique: #{props.selNode.uid}</>}
        {" · "}
        {edit.yarnOverrides + edit.tensionOverrides} pontos editados
      </p>

      {tools.mode === "select" && (
        <>
          <div className="row">
            {tools.selTool === "hood" && (
              <label>
                Saltos{" "}
                <input
                  aria-label="Saltos da vizinhança"
                  type="number"
                  min={0}
                  max={20}
                  value={tools.hops}
                  onChange={(e) => setTools({ hops: Number(e.target.value) })}
                />
              </label>
            )}
            {tools.selTool === "path" && (
              <label>
                <input
                  type="checkbox"
                  checked={tools.pathByYarn}
                  onChange={(e) => setTools({ pathByYarn: e.target.checked })}
                />{" "}
                Pelo fio
              </label>
            )}
          </div>
          {tools.selTool === "path" && (
            <p className="hint" data-testid="path-hint">
              {tools.pathA === null ? "Clique no ponto A." : `A = #${tools.pathA}. Clique no ponto B.`}
            </p>
          )}
          <p className="hint">Shift + clique soma · Ctrl + clique tira · Alt + arrasto gira a câmera.</p>
          <fieldset>
            <legend>Filtro por propriedade</legend>
            <div className="row">
              <label>
                Fio{" "}
                <select aria-label="Filtro de fio" value={fYarn} onChange={(e) => setFYarn(e.target.value)}>
                  <option value="">qualquer</option>
                  {yarns.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ponto{" "}
                <select aria-label="Filtro de ponto" value={fCode} onChange={(e) => setFCode(e.target.value)}>
                  <option value="">qualquer</option>
                  {CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row">
              <label>
                Voltas{" "}
                <input
                  aria-label="Filtro volta de"
                  className="num"
                  value={gFrom}
                  onChange={(e) => setGFrom(e.target.value)}
                />
              </label>
              <label>
                a{" "}
                <input
                  aria-label="Filtro volta até"
                  className="num"
                  value={gTo}
                  onChange={(e) => setGTo(e.target.value)}
                />
              </label>
              <label>
                Tensão{" "}
                <input
                  aria-label="Filtro tensão de"
                  className="num"
                  value={tFrom}
                  onChange={(e) => setTFrom(e.target.value)}
                />
              </label>
              <label>
                a{" "}
                <input
                  aria-label="Filtro tensão até"
                  className="num"
                  value={tTo}
                  onChange={(e) => setTTo(e.target.value)}
                />
              </label>
            </div>
            <button type="button" data-testid="apply-filter" onClick={applyFilter}>
              Aplicar filtro
            </button>
          </fieldset>
        </>
      )}

      {(tools.mode === "yarn" || tools.mode === "tension") && (
        <>
          <div className="row">
            {tools.mode === "yarn" ? (
              <label>
                Fio{" "}
                <select
                  aria-label="Fio da pintura"
                  value={yarnId}
                  onChange={(e) => setTools({ yarn: e.target.value })}
                >
                  {yarns.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.id} · {y.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Tensão {tools.tension.toFixed(2)}{" "}
                <input
                  aria-label="Valor da tensão"
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={tools.tension}
                  onChange={(e) => setTools({ tension: Number(e.target.value) })}
                />
              </label>
            )}
            <label>
              Raio{" "}
              <input
                aria-label="Raio do pincel"
                type="number"
                min={0}
                max={20}
                value={tools.hops}
                onChange={(e) => setTools({ hops: Number(e.target.value) })}
              />
            </label>
          </div>
          <p className="hint">
            {tools.mode === "tension"
              ? "−1 = frouxo (ponto maior) · +1 = firme (ponto menor). Arraste sobre os pontos."
              : "Arraste sobre os pontos para pintar. Alt + arrasto gira a câmera."}
          </p>
          <div className="row">
            <button
              type="button"
              data-testid="apply-selection"
              onClick={() =>
                run("points.set", {
                  prop: tools.mode,
                  value: tools.brushTool === "erase" ? null : tools.mode === "yarn" ? yarnId : tools.tension,
                })
              }
            >
              {tools.brushTool === "erase" ? "Apagar edição da seleção" : "Aplicar à seleção"}
            </button>
          </div>
          {tools.mode === "yarn" && (
            <div className="row">
              <label>
                Listras{" "}
                <input aria-label="Listras" value={stripe} onChange={(e) => setStripe(e.target.value)} />
              </label>
              <button
                type="button"
                data-testid="apply-stripes"
                onClick={() => {
                  try {
                    run("tool.stripes", { pattern: parseStripes() });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Listrar seleção
              </button>
            </div>
          )}
          {tools.mode === "tension" && (
            <>
              <div className="row">
                <button type="button" onClick={() => run("tool.smooth", { passes: 2 })}>
                  Suavizar seleção
                </button>
                <label>
                  de{" "}
                  <input
                    aria-label="Gradiente de"
                    className="num"
                    type="number"
                    step={0.1}
                    value={gradFrom}
                    onChange={(e) => setGradFrom(Number(e.target.value))}
                  />
                </label>
                <label>
                  a{" "}
                  <input
                    aria-label="Gradiente até"
                    className="num"
                    type="number"
                    step={0.1}
                    value={gradTo}
                    onChange={(e) => setGradTo(Number(e.target.value))}
                  />
                </label>
                <button type="button" onClick={() => run("tool.gradient", { from: gradFrom, to: gradTo })}>
                  Gradiente
                </button>
              </div>
              <div className="row">
                <label>
                  Tensão padrão {edit.defaultTension.toFixed(2)}{" "}
                  <input
                    aria-label="Tensão padrão do projeto"
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={edit.defaultTension}
                    onChange={(e) => run("edit.setDefaultTension", { value: Number(e.target.value) })}
                  />
                </label>
              </div>
            </>
          )}
        </>
      )}

      {msg && (
        <p className="warn" role="alert" data-testid="points-error">
          {msg}
        </p>
      )}
    </div>
  );
}

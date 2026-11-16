// SPDX-License-Identifier: GPL-3.0-or-later
// Controles de pontos separados por lugar (pergunta 12 em docs/12): os valores da ferramenta ficam na barra de opções
// (ToolValues) e as ações sobre a seleção ficam no ribbon (filtro, aplicar, listras, tensão). Toda ação passa pelos
// comandos (D-21) com a receita da peça ativa (`runText`).
import { editSnapshot, paintSnapshot, subscribeEdit, subscribePaint } from "@novelo/commands";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons.tsx";
import { setTools, type ToolState } from "./pointtools.ts";

const CODES = ["CH", "SL", "SC", "HDC", "DC", "TR"];

type RunText = (method: string, params?: Record<string, unknown>) => void;

/**
 * Botão do ribbon que abre um painel pequeno logo abaixo, com controles que não cabem no ribbon (filtro, listras,
 * tensão): o ribbon fica da mesma altura em todas as abas e o 3D não perde área. Clicar fora ou Esc fecha.
 */
export function RibbonPopover(props: { id: string; label: string; icon: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="rb-pop-wrap" ref={box}>
      <button
        type="button"
        className={`rb${open ? " on" : ""}`}
        data-testid={`pop-${props.id}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={props.icon} size={22} />
        <span>{props.label}</span>
      </button>
      {open && (
        <div className="rb-pop" role="dialog" aria-label={props.label}>
          {props.children}
        </div>
      )}
    </div>
  );
}

/** Valores da ferramenta ativa, na barra de opções. */
export function ToolValues(props: { tools: ToolState }) {
  const t = props.tools;
  const { yarns } = useSyncExternalStore(subscribePaint, paintSnapshot);
  const yarnId = yarns.some((y) => y.id === t.yarn) ? t.yarn : (yarns[0]?.id ?? "A");
  const radius = (
    <label>
      Raio{" "}
      <input
        aria-label="Raio do pincel"
        className="num"
        type="number"
        min={0}
        max={20}
        value={t.hops}
        onChange={(e) => setTools({ hops: Number(e.target.value) })}
      />
    </label>
  );
  if (t.mode === "select" && t.selTool === "hood")
    return (
      <label>
        Saltos{" "}
        <input
          aria-label="Saltos da vizinhança"
          className="num"
          type="number"
          min={0}
          max={20}
          value={t.hops}
          onChange={(e) => setTools({ hops: Number(e.target.value) })}
        />
      </label>
    );
  if (t.mode === "select" && t.selTool === "path")
    return (
      <>
        <label>
          <input
            type="checkbox"
            checked={t.pathByYarn}
            onChange={(e) => setTools({ pathByYarn: e.target.checked })}
          />{" "}
          Pelo fio
        </label>
        <span data-testid="path-hint">
          {t.pathA === null ? "Clique no ponto A." : `A = #${t.pathA}. Clique no ponto B.`}
        </span>
      </>
    );
  if (t.mode === "yarn")
    return (
      <>
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
        {radius}
      </>
    );
  if (t.mode === "tension")
    return (
      <>
        <label title="−1 = frouxo (ponto maior) · +1 = firme (ponto menor)">
          Tensão {t.tension.toFixed(2)}{" "}
          <input
            aria-label="Valor da tensão"
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={t.tension}
            onChange={(e) => setTools({ tension: Number(e.target.value) })}
          />
        </label>
        {radius}
      </>
    );
  return null;
}

/** Filtro por propriedade (ribbon Selecionar). */
export function FilterControls(props: { runText: RunText; op: ToolState["op"] }) {
  const { yarns } = useSyncExternalStore(subscribePaint, paintSnapshot);
  const [fYarn, setFYarn] = useState("");
  const [fCode, setFCode] = useState("");
  const [gFrom, setGFrom] = useState("");
  const [gTo, setGTo] = useState("");
  const [tFrom, setTFrom] = useState("-1");
  const [tTo, setTTo] = useState("1");
  const apply = () => {
    const by: Record<string, unknown> = { kind: "filter" };
    if (fYarn) by.yarns = [fYarn];
    if (fCode) by.codes = [fCode];
    if (gFrom !== "" || gTo !== "") by.group = [Number(gFrom || 1), Number(gTo || 9999)];
    if (tFrom !== "-1" || tTo !== "1") by.tension = [Number(tFrom), Number(tTo)];
    props.runText("selection.select", { by, op: props.op });
  };
  const num = (label: string, value: string, set: (v: string) => void) => (
    <input aria-label={label} className="num" value={value} onChange={(e) => set(e.target.value)} />
  );
  return (
    <div className="rc-group">
      <label className="rc-field">
        Fio
        <select aria-label="Filtro de fio" value={fYarn} onChange={(e) => setFYarn(e.target.value)}>
          <option value="">qualquer</option>
          {yarns.map((y) => (
            <option key={y.id} value={y.id}>
              {y.id}
            </option>
          ))}
        </select>
      </label>
      <label className="rc-field">
        Ponto
        <select aria-label="Filtro de ponto" value={fCode} onChange={(e) => setFCode(e.target.value)}>
          <option value="">qualquer</option>
          {CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <span className="rc-field">
        Voltas {num("Filtro volta de", gFrom, setGFrom)}–{num("Filtro volta até", gTo, setGTo)}
      </span>
      <span className="rc-field">
        Tensão {num("Filtro tensão de", tFrom, setTFrom)}–{num("Filtro tensão até", tTo, setTTo)}
      </span>
      <button type="button" data-testid="apply-filter" onClick={apply}>
        Filtrar
      </button>
    </div>
  );
}

/** Aplicar o fio ou a tensão da ferramenta à seleção (ribbon Pintar). */
export function ApplySelection(props: { runText: RunText; tools: ToolState }) {
  const t = props.tools;
  const { yarns } = useSyncExternalStore(subscribePaint, paintSnapshot);
  const yarnId = yarns.some((y) => y.id === t.yarn) ? t.yarn : (yarns[0]?.id ?? "A");
  const prop = t.mode === "tension" ? "tension" : "yarn";
  return (
    <button
      type="button"
      className="rc-field"
      data-testid="apply-selection"
      onClick={() =>
        props.runText("points.set", {
          prop,
          value: t.brushTool === "erase" ? null : prop === "yarn" ? yarnId : t.tension,
        })
      }
    >
      {t.brushTool === "erase" ? "Apagar edição da seleção" : "Aplicar à seleção"}
    </button>
  );
}

/** Listras por volta na seleção (ribbon Pintar). */
export function StripeControls(props: { runText: RunText }) {
  const [stripe, setStripe] = useState("A2 B1");
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    try {
      const pattern = stripe
        .trim()
        .split(/\s+/)
        .map((t) => {
          const m = /^([A-Za-z])(\d*)$/.exec(t);
          if (!m) throw new Error(`listra '${t}' inválida (use letra e voltas, ex.: A2 B1)`);
          return [(m[1] as string).toUpperCase(), Number(m[2] || 1)];
        });
      setError(null);
      props.runText("tool.stripes", { pattern });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="rc-group">
      <label className="rc-field">
        Listras
        <input aria-label="Listras" value={stripe} onChange={(e) => setStripe(e.target.value)} />
      </label>
      <button type="button" data-testid="apply-stripes" onClick={apply}>
        Listrar seleção
      </button>
      {error && (
        <span className="warn" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** Suavizar, gradiente e tensão padrão (ribbon Pintar). */
export function TensionControls(props: { runText: RunText }) {
  const edit = useSyncExternalStore(subscribeEdit, editSnapshot);
  const [from, setFrom] = useState(-0.5);
  const [to, setTo] = useState(0.5);
  return (
    <div className="rc-group">
      <button type="button" onClick={() => props.runText("tool.smooth", { passes: 2 })}>
        Suavizar seleção
      </button>
      <span className="rc-field">
        Gradiente{" "}
        <input
          aria-label="Gradiente de"
          className="num"
          type="number"
          step={0.1}
          value={from}
          onChange={(e) => setFrom(Number(e.target.value))}
        />{" "}
        a{" "}
        <input
          aria-label="Gradiente até"
          className="num"
          type="number"
          step={0.1}
          value={to}
          onChange={(e) => setTo(Number(e.target.value))}
        />
        <button type="button" onClick={() => props.runText("tool.gradient", { from, to })}>
          Aplicar
        </button>
      </span>
      <label className="rc-field">
        Tensão padrão {edit.defaultTension.toFixed(2)}
        <input
          aria-label="Tensão padrão do projeto"
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={edit.defaultTension}
          onChange={(e) => props.runText("edit.setDefaultTension", { value: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

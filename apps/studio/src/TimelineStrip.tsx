// SPDX-License-Identifier: GPL-3.0-or-later
// Linha do tempo de features (G6, D-68): uma faixa fina sob o 3D, só com ícones. O texto aparece ao passar o mouse, ao
// focar ou ao escolher uma feature. Clique esquerdo abre as opções (voltar o marcador até aqui, suprimir ou ligar, editar
// parâmetros, excluir). ⏮ ◀ ▶ ⏭ andam o marcador. Tudo passa pelos comandos `timeline.*` e `history.*` (D-21).
import { dispatch, subscribeTimeline, timelineVersion } from "@novelo/commands";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./icons.tsx";
import { openShape, type Section, type Shape } from "./ShapeWindow.tsx";

interface Item {
  id: number;
  index: number;
  method: string;
  kind: string;
  label: string;
  suppressed: boolean;
  status: "ok" | "failed";
  error: string | null;
  inEffect: boolean;
  params?: Record<string, unknown>;
}
interface Out {
  marker: number;
  total: number;
  canUndo: boolean;
  canRedo: boolean;
  features: Item[];
}

const ICON: Record<string, string> = {
  recipe: "recipe",
  part: "part",
  assembly: "assembly",
  seam: "seam",
  paint: "brush",
  stitches: "tension",
  material: "list",
};

const num = (v: string): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

type Run = (m: string, p?: Record<string, unknown>) => unknown;

/** Campos editáveis de uma feature, só para as que têm parâmetros que fazem sentido mudar na faixa. */
function Editor(props: { item: Item; onDone: () => void; run: Run }) {
  const { item, onDone, run } = props;
  const p = item.params ?? {};
  const save = (patch: Record<string, unknown>) => {
    if (run("timeline.edit", { id: item.id, params: patch }) !== undefined) onDone();
  };
  const [v, setV] = useState<Record<string, string>>({});
  const val = (k: string, d: unknown): string => v[k] ?? String(d ?? "");
  const field = (k: string, label: string, d: unknown) => (
    <label key={k}>
      {label}{" "}
      <input
        aria-label={label}
        className="num"
        value={val(k, d)}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </label>
  );
  if (item.method === "paint.rows") {
    return (
      <div className="tl-edit" data-testid="timeline-editor">
        {field("from", "Pintar de volta", p.from)}
        {field("to", "Pintar até a volta", p.to)}
        {field("yarn", "Fio", p.yarn)}
        <button
          type="button"
          onClick={() =>
            save({ from: num(val("from", p.from)), to: num(val("to", p.to)), yarn: val("yarn", p.yarn) })
          }
        >
          Aplicar
        </button>
      </div>
    );
  }
  // costura: nome, tipo e sentido (pergunta 18)
  if (item.method === "seam.add" || item.method === "seam.set") {
    const types = [
      ["mattress", "invisível (colchoeiro)"],
      ["whip", "chuleado"],
      ["slip", "pbx"],
      ["sc", "pb"],
    ];
    return (
      <div className="tl-edit" data-testid="timeline-editor">
        {field("name", "Nome da costura", p.name)}
        <label>
          Tipo{" "}
          <select
            aria-label="Tipo de costura"
            value={val("type", p.type ?? "mattress")}
            onChange={(e) => setV({ ...v, type: e.target.value })}
          >
            {types.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            aria-label="Sentido invertido"
            checked={val("reverse", p.reverse === true) === "true"}
            onChange={(e) => setV({ ...v, reverse: String(e.target.checked) })}
          />{" "}
          sentido invertido
        </label>
        <button
          type="button"
          onClick={() =>
            save({
              ...(val("name", p.name).trim() ? { name: val("name", p.name).trim() } : {}),
              type: val("type", p.type ?? "mattress"),
              reverse: val("reverse", p.reverse === true) === "true",
            })
          }
        >
          Aplicar
        </button>
      </div>
    );
  }
  // nova montagem: o nome
  if (item.method === "assembly.add") {
    return (
      <div className="tl-edit" data-testid="timeline-editor">
        {field("name", "Nome da montagem", p.name)}
        <button type="button" onClick={() => save({ name: val("name", p.name).trim() || null })}>
          Aplicar
        </button>
      </div>
    );
  }
  // trocar fio em todo o projeto: de qual fio para qual
  if (item.method === "materials.replace") {
    return (
      <div className="tl-edit" data-testid="timeline-editor">
        {field("from", "Trocar o fio", p.from)}
        {field("to", "Pelo fio", p.to)}
        <button type="button" onClick={() => save({ from: val("from", p.from), to: val("to", p.to) })}>
          Aplicar
        </button>
      </div>
    );
  }
  if (item.method === "parts.set" || item.method === "assembly.set") {
    const vec = (k: "pos" | "rot", label: string) =>
      [0, 1, 2].map((i) =>
        field(`${k}${i}`, `${label} ${"XYZ"[i]}`, (p[k] as number[] | undefined)?.[i] ?? 0),
      );
    return (
      <div className="tl-edit" data-testid="timeline-editor">
        {p.pos !== undefined && vec("pos", "Posição (mm)")}
        {p.rot !== undefined && vec("rot", "Rotação")}
        <button
          type="button"
          onClick={() => {
            const patch: Record<string, unknown> = {};
            if (p.pos !== undefined)
              patch.pos = [0, 1, 2].map((i) => num(val(`pos${i}`, (p.pos as number[])[i])));
            if (p.rot !== undefined)
              patch.rot = [0, 1, 2].map((i) => num(val(`rot${i}`, (p.rot as number[])[i])));
            save(patch);
          }}
        >
          Aplicar
        </button>
      </div>
    );
  }
  if (item.method === "points.set") {
    return (
      <div className="tl-edit" data-testid="timeline-editor">
        {field("value", p.prop === "tension" ? "Valor da tensão" : "Fio", p.value)}
        <button
          type="button"
          onClick={() =>
            save({ value: p.prop === "tension" ? num(val("value", p.value)) : val("value", p.value) })
          }
        >
          Aplicar
        </button>
      </div>
    );
  }
  if (item.method === "parts.fromShape") {
    return (
      <div className="tl-edit" data-testid="timeline-editor">
        <button
          type="button"
          onClick={() => {
            openShape({
              featureId: item.id,
              shape: p.shape as Shape,
              ...(typeof p.name === "string" ? { name: p.name } : {}),
              beginner: p.beginner === true,
              ...(p.section && typeof p.section === "object" ? { section: p.section as Section } : {}),
            });
            onDone();
          }}
        >
          Editar a forma
        </button>
      </div>
    );
  }
  if (item.method === "parts.commitText") {
    return (
      <div className="tl-edit" data-testid="timeline-editor">
        <textarea
          aria-label="Receita da feature"
          value={val("text", p.text)}
          onChange={(e) => setV({ ...v, text: e.target.value })}
        />
        <button type="button" onClick={() => save({ text: val("text", p.text) })}>
          Aplicar
        </button>
      </div>
    );
  }
  return <p className="hint">Esta feature não tem parâmetros para editar aqui.</p>;
}

export function TimelineStrip() {
  useSyncExternalStore(subscribeTimeline, timelineVersion);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const t = dispatch("timeline.get") as Out;
  const chosen = t.features.find((f) => f.id === open) ?? null;

  const run: Run = (method, params = {}) => {
    try {
      const r = dispatch(method, params);
      setMsg(null);
      return r;
    } catch (e) {
      setMsg((e as Error).message);
      return undefined;
    }
  };
  const nav = (id: string, label: string, icon: string, disabled: boolean, go: () => void) => (
    <button
      type="button"
      className="tl-nav"
      data-testid={id}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={go}
    >
      <Icon name={icon} size={14} />
    </button>
  );

  return (
    <section className="timeline" data-testid="timeline" aria-label="Linha do tempo de features">
      <button
        type="button"
        className="tl-nav"
        data-testid="timeline-collapse"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Mostrar a linha do tempo" : "Recolher a linha do tempo"}
        title={collapsed ? "Mostrar a linha do tempo" : "Recolher a linha do tempo"}
        onClick={() => setCollapsed((c) => !c)}
      >
        <Icon name="chevron" size={14} />
      </button>
      {!collapsed && (
        <>
          {nav("timeline-first", "Tudo para trás (marcador no começo)", "first", t.marker === 0, () =>
            run("timeline.rollTo", { index: 0 }),
          )}
          {nav("timeline-prev", "Voltar uma feature (Ctrl+Z)", "prev", !t.canUndo, () => run("history.undo"))}
          {nav("timeline-next", "Avançar uma feature (Ctrl+Y)", "next", !t.canRedo, () =>
            run("history.redo"),
          )}
          {nav("timeline-last", "Tudo para frente (marcador no fim)", "last", !t.canRedo, () =>
            run("timeline.rollTo", { index: t.total }),
          )}
          <ol className="tl-items" aria-label="Features">
            {t.features.map((f) => {
              const state = `${f.suppressed ? " (suprimida)" : ""}${f.status === "failed" ? ` (falhou: ${f.error})` : ""}`;
              return (
                <li key={f.id} className={f.index + 1 === t.marker ? "tl-marker" : ""}>
                  <button
                    type="button"
                    data-testid={`feature-${f.index}`}
                    className={`tl-item${f.inEffect ? "" : " off"}${f.suppressed ? " sup" : ""}${f.status === "failed" ? " failed" : ""}${open === f.id ? " on" : ""}`}
                    aria-label={`${f.label}${state}`}
                    title={`${f.label}${state}`}
                    aria-expanded={open === f.id}
                    onClick={() => {
                      setOpen(open === f.id ? null : f.id);
                      setEditing(null);
                    }}
                  >
                    <Icon name={ICON[f.kind] ?? "list"} size={14} />
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {!collapsed && chosen && (
        <div className="tl-panel" data-testid="timeline-panel">
          <strong>{chosen.label}</strong>
          {chosen.status === "failed" && <span className="warn"> · falhou: {chosen.error}</span>}
          <div role="menu" aria-label={`Opções de ${chosen.label}`} className="tl-menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                run("timeline.rollTo", { index: chosen.index + 1 });
                setOpen(null);
              }}
            >
              Voltar o marcador até aqui
            </button>
            <button type="button" role="menuitem" onClick={() => run("timeline.suppress", { id: chosen.id })}>
              {chosen.suppressed ? "Ligar" : "Suprimir"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const r = run("timeline.get", { id: chosen.id }) as Out | undefined;
                setEditing(r?.features.find((f) => f.id === chosen.id) ?? null);
              }}
            >
              Editar parâmetros
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                run("timeline.remove", { id: chosen.id });
                setOpen(null);
                setEditing(null);
              }}
            >
              Excluir
            </button>
          </div>
          {editing && editing.id === chosen.id && (
            <Editor item={editing} run={run} onDone={() => setEditing(null)} />
          )}
        </div>
      )}
      {msg && (
        <span className="warn" role="alert" data-testid="timeline-error">
          {msg}
        </span>
      )}
    </section>
  );
}

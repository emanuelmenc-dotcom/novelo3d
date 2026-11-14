// SPDX-License-Identifier: GPL-3.0-or-later
// Painel "Montagem": peças (original, instância, espelhada, cópia), posição na montagem e costuras entre duas linhas
// contínuas de pontos. Tudo passa pelos comandos parts.* e seam.* (D-21): o MCP monta e costura o mesmo que a tela.
import {
  dispatch,
  paintSnapshot,
  partsSnapshot,
  rootOf,
  settingsSnapshot,
  subscribePaint,
  subscribeParts,
  subscribeTree,
  treeVersion,
} from "@novelo/commands";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons.tsx";

interface Check {
  ok: boolean;
  errors: string[];
  warnings: string[];
  a: { count: number; closed: boolean } | null;
  b: { count: number; closed: boolean } | null;
  pairs: unknown[];
  suggestedRatio: [number, number] | null;
}
interface SeamRow {
  id: string;
  name: string;
  type: string;
  reverse: boolean;
  ratio: [number, number];
  a: { part: string; count: number };
  b: { part: string; count: number };
  ok: boolean;
  errors: string[];
  warnings: string[];
}

interface CloseResult {
  anchor: string;
  before: Record<string, { pos: number[]; rot: number[] }>;
  seamReverse: Record<string, boolean>;
  flipped: string[];
  gaps: { id: string; name: string; ok: boolean; meanGap: number | null; maxGap: number | null }[];
  unconnected: string[];
  warnings: string[];
}

let lastClose: CloseResult | null = null;
const KIND: Record<string, string> = { own: "original", instance: "instância", mirror: "espelhada" };
const SEAM_TYPES: [string, string][] = [
  ["mattress", "Ponto invisível (colchão)"],
  ["whip", "Chuleio (ponto de arremate)"],
  ["slip", "Ponto baixíssimo"],
  ["sc", "Ponto baixo"],
];
const AXES = ["x", "y", "z"] as const;

/** Menu de contexto da árvore: os mesmos comandos do ribbon e da árvore, para a peça em que se clicou. */
function TreeMenu(props: {
  menu: { id: string; x: number; y: number };
  onClose: () => void;
  run: (method: string, params?: Record<string, unknown>) => unknown;
}) {
  const { menu, onClose, run } = props;
  const st = partsSnapshot();
  const part = st.parts.find((q) => q.id === menu.id);
  const asm = st.assemblies.find((q) => q.id === menu.id);
  const label = part?.name ?? asm?.name ?? "Projeto";
  type Item = [string, string, Record<string, unknown>];
  const items: Item[] = part
    ? [
        [part.hidden ? "Mostrar" : "Esconder", "parts.setVisible", { id: menu.id, visible: !!part.hidden }],
        ["Isolar", "parts.isolate", { id: menu.id }],
        ["Mostrar todas", "parts.showAll", {}],
        [
          "Nova montagem com esta peça",
          "assembly.add",
          { parts: [menu.id], ...(part.assembly ? { parent: part.assembly } : {}) },
        ],
        ...(part.assembly
          ? ([["Tirar da montagem", "parts.set", { id: menu.id, assembly: null }]] as Item[])
          : []),
        ["Nova instância", "parts.instance", { id: menu.id }],
        ["Espelhar (plano X)", "parts.mirror", { id: menu.id, plane: "x" }],
        ["Copiar", "parts.copy", { id: menu.id }],
        ["Remover", "parts.remove", { id: menu.id }],
      ]
    : asm
      ? [
          ["Nova montagem aqui dentro (vazia)", "assembly.add", { parent: menu.id }],
          ["Remover montagem e tudo dentro…", "confirm-remove", { id: menu.id }],
        ]
      : [["Nova montagem vazia", "assembly.add", {}]];
  const go = (method: string, params: Record<string, unknown>) => {
    if (method === "confirm-remove") {
      const c = dispatch("assembly.contents", params) as {
        assemblies: string[];
        parts: string[];
        seams: string[];
      };
      const ok = window.confirm(
        `Remover "${label}" apaga ${c.parts.length} peça(s), ${c.assemblies.length - 1} montagem(ns) de dentro e ${c.seams.length} costura(s). Dá para desfazer. Continuar?`,
      );
      if (ok) run("assembly.remove", { ...params, confirm: true });
    } else run(method, params);
  };
  return (
    <div
      role="menu"
      aria-label={`Menu de ${label}`}
      className="tree-menu"
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {items.map(([text, method, params], i) => (
        <button
          key={text}
          type="button"
          role="menuitem"
          // biome-ignore lint/a11y/noAutofocus: o menu acabou de abrir por teclado ou mouse e o foco precisa entrar nele
          autoFocus={i === 0}
          onClick={() => {
            go(method, params);
            onClose();
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export type AssemblySection = "tree" | "part" | "asm" | "seam" | "close";

/** Cada seção mora numa janela: a árvore (peças e costuras), e as propriedades (peça, costura nova e fechar montagem). */
export function AssemblyPanel(props: { sections: AssemblySection[] }) {
  const show = (x: AssemblySection) => props.sections.includes(x);
  const st = useSyncExternalStore(subscribeParts, partsSnapshot);
  useSyncExternalStore(subscribeTree, treeVersion);
  const { yarns } = useSyncExternalStore(subscribePaint, paintSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [reverse, setReverse] = useState(false);
  const [ratio, setRatio] = useState<[number, number]>([1, 1]);
  const [type, setType] = useState<string>(settingsSnapshot().yarns.seam.type);
  const [anchor, setAnchor] = useState("");
  const [autoFlip, setAutoFlip] = useState(true);
  // o resultado do último fechamento sobrevive a trocar de janela (a janela Propriedades troca de conteúdo)
  const [closed, setClosedState] = useState<CloseResult | null>(lastClose);
  const setClosed = (r: CloseResult | null) => {
    lastClose = r;
    setClosedState(r);
  };
  const [name, setName] = useState("");
  // menu de contexto da árvore: clique direito ou a tecla de menu / Shift+F10 na peça
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

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
  const nameOf = (id: string) => st.parts.find((p) => p.id === id)?.name ?? id;
  const active = st.parts.find((p) => p.id === st.active);
  const root = rootOf(st.active);

  // biome-ignore lint/correctness/useExhaustiveDependencies: o estado das peças (versão) invalida a conferência
  const check = useMemo<Check | null>(() => {
    if (!st.draft.a || !st.draft.b) return null;
    try {
      return dispatch("seam.validate", { reverse, ratio }) as Check;
    } catch {
      return null;
    }
  }, [st.version, reverse, ratio]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: idem
  const seams = useMemo<SeamRow[]>(() => {
    try {
      return (dispatch("seam.list") as { seams: SeamRow[] }).seams;
    } catch {
      return [];
    }
  }, [st.version]);

  const num = (v: string): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const setVec = (key: "pos" | "rot", i: number, v: string) => {
    if (!active) return;
    const next = [...active[key]] as [number, number, number];
    next[i] = num(v);
    run("parts.set", { id: active.id, [key]: next });
  };

  const partRow = (p: (typeof st.parts)[number], depth: number) => (
    <li
      key={p.id}
      data-part={p.id}
      className={p.id === st.active ? "on" : ""}
      style={{ paddingLeft: `${depth * 1.25}rem` }}
    >
      <label>
        <input
          type="radio"
          name="active-part"
          aria-label={`Editar ${p.name}`}
          checked={p.id === st.active}
          onChange={() => run("tree.select", { id: p.id })}
          onClick={() => run("tree.select", { id: p.id })}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ id: p.id, x: e.clientX, y: e.clientY });
          }}
          onKeyDown={(e) => {
            if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ id: p.id, x: r.left, y: r.bottom });
            }
          }}
        />{" "}
        <strong>{p.name}</strong>{" "}
        <span className="hint">
          {KIND[p.kind]}
          {p.source ? ` de ${nameOf(p.source)}` : ""}
          {p.mirror ? ` · plano ${p.mirror.toUpperCase()}` : ""}
        </span>
      </label>
      <button
        type="button"
        aria-label={`${p.hidden ? "Mostrar" : "Esconder"} ${p.name}`}
        aria-pressed={!p.hidden}
        onClick={() => run("parts.setVisible", { id: p.id, visible: !!p.hidden })}
      >
        {p.hidden ? "○" : "●"}
      </button>
      <button
        type="button"
        aria-label={`Isolar ${p.name}`}
        onClick={() => run("parts.isolate", { id: p.id })}
      >
        ◎
      </button>
    </li>
  );
  const asmRow = (a: (typeof st.assemblies)[number], depth: number) => (
    <li key={a.id} data-assembly={a.id} style={{ paddingLeft: `${depth * 1.25}rem` }}>
      <button
        type="button"
        className={selectedId === a.id ? "on" : ""}
        aria-label={`Montagem ${a.name}`}
        title="Montagem"
        onClick={() => run("tree.select", { id: a.id })}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ id: a.id, x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ id: a.id, x: r.left, y: r.bottom });
          }
        }}
      >
        <Icon name="assembly" size={16} /> {a.name}
      </button>
      <button
        type="button"
        aria-label={`${a.hidden ? "Mostrar" : "Esconder"} montagem ${a.name}`}
        aria-pressed={!a.hidden}
        onClick={() => run("assembly.setVisible", { id: a.id, visible: !!a.hidden })}
      >
        {a.hidden ? "○" : "●"}
      </button>
    </li>
  );
  /** Montagens e peças de um nível da árvore, as de dentro logo abaixo da montagem que as contém. */
  const level = (parent: string | undefined, depth: number): React.ReactNode[] => [
    ...st.assemblies
      .filter((a) => a.parent === parent)
      .flatMap((a) => [asmRow(a, depth), ...level(a.id, depth + 1)]),
    ...st.parts.filter((p) => p.assembly === parent).map((p) => partRow(p, depth)),
  ];
  const selectedId = (dispatch("tree.get") as { selected: string | null }).selected;
  const selectedAsm = st.assemblies.find((a) => a.id === selectedId);

  return (
    <div className="panel-col scroll assembly" data-testid="assembly-panel">
      {show("tree") && (
        <>
          <h3>Peças</h3>
          <button
            type="button"
            data-testid="tree-root"
            onClick={() => run("tree.select", { id: "root" })}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: "root", x: e.clientX, y: e.clientY });
            }}
          >
            Projeto (montagem)
          </button>
          <ul className="part-list" aria-label="Peças">
            {level(undefined, 0)}
          </ul>
          <p className="hint">
            Instância e espelhada acompanham a original; cópia é uma peça nova e independente.
          </p>
          <button type="button" onClick={() => run("parts.showAll")}>
            Mostrar todas
          </button>
          {menu && <TreeMenu menu={menu} onClose={() => setMenu(null)} run={run} />}
        </>
      )}

      {show("asm") && selectedAsm && (
        <fieldset data-testid="asm-props">
          <legend>{selectedAsm.name}</legend>
          <label className="block">
            Nome{" "}
            <input
              aria-label="Nome da montagem"
              value={selectedAsm.name}
              maxLength={40}
              onChange={(e) => run("assembly.set", { id: selectedAsm.id, name: e.target.value })}
            />
          </label>
          <div className="row">
            {(["pos", "rot"] as const).map((k) => (
              <span key={k} className="row">
                {k === "pos" ? "Posição" : "Rotação°"}
                {[0, 1, 2].map((i) => (
                  <input
                    key={`${k}${i}`}
                    type="number"
                    className="num"
                    aria-label={`${k === "pos" ? "Posição" : "Rotação"} ${"XYZ"[i]} da montagem`}
                    value={selectedAsm[k][i]}
                    step={k === "pos" ? 1 : 15}
                    onChange={(e) => {
                      const next = [...selectedAsm[k]] as [number, number, number];
                      next[i] = Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0;
                      run("assembly.set", { id: selectedAsm.id, [k]: next });
                    }}
                  />
                ))}
              </span>
            ))}
          </div>
          <label className="block">
            Dentro de{" "}
            <select
              aria-label="Montagem que contém esta"
              value={selectedAsm.parent ?? ""}
              onChange={(e) => run("assembly.set", { id: selectedAsm.id, parent: e.target.value || null })}
            >
              <option value="">(raiz do projeto)</option>
              {st.assemblies
                .filter((a) => a.id !== selectedAsm.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              const c = dispatch("assembly.contents", { id: selectedAsm.id }) as {
                assemblies: string[];
                parts: string[];
                seams: string[];
              };
              if (
                window.confirm(
                  `Remover "${selectedAsm.name}" apaga ${c.parts.length} peça(s), ${c.assemblies.length - 1} montagem(ns) de dentro e ${c.seams.length} costura(s). Dá para desfazer. Continuar?`,
                )
              )
                run("assembly.remove", { id: selectedAsm.id, confirm: true });
            }}
          >
            Remover montagem e tudo dentro
          </button>
        </fieldset>
      )}

      {show("part") && active && (
        <fieldset data-testid="part-props">
          <legend>{active.name}</legend>
          <label className="block">
            Nome{" "}
            <input
              aria-label="Nome da peça"
              value={active.name}
              maxLength={40}
              onChange={(e) => run("parts.set", { id: active.id, name: e.target.value })}
            />
          </label>
          {st.assemblies.length > 0 && (
            <label className="block">
              Montagem{" "}
              <select
                aria-label="Montagem da peça"
                value={active.assembly ?? ""}
                onChange={(e) => run("parts.set", { id: active.id, assembly: e.target.value || null })}
              >
                <option value="">(raiz do projeto)</option>
                {st.assemblies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="row">
            {(["pos", "rot"] as const).map((k) => (
              <span key={k} className="row">
                {k === "pos" ? "Posição" : "Rotação°"}
                {[0, 1, 2].map((i) => (
                  <input
                    key={`${k}${i}`}
                    type="number"
                    className="num"
                    aria-label={`${k === "pos" ? "Posição" : "Rotação"} ${"XYZ"[i]} da peça`}
                    value={active[k][i]}
                    step={k === "pos" ? 1 : 15}
                    onChange={(e) => setVec(k, i, e.target.value)}
                  />
                ))}
              </span>
            ))}
          </div>
          {active.kind !== "own" && (
            <>
              <p className="hint">
                Edições de pontos e a receita valem para a original ({root.name}). Aqui só a posição, o
                espelho e a troca de fios.
              </p>
              {active.kind === "mirror" && (
                <label className="block">
                  Plano do espelho{" "}
                  <select
                    aria-label="Plano do espelho desta peça"
                    value={active.mirror ?? "x"}
                    onChange={(e) => run("parts.set", { id: active.id, mirror: e.target.value })}
                  >
                    {AXES.map((a) => (
                      <option key={a} value={a}>
                        {a.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="row">
                Trocar fio:
                {yarns.map((y) => (
                  <label key={y.id}>
                    {y.id} →{" "}
                    <select
                      aria-label={`Fio ${y.id} vira`}
                      value={active.yarnMap?.[y.id] ?? y.id}
                      onChange={(e) => {
                        const map = { ...(active.yarnMap ?? {}), [y.id]: e.target.value };
                        for (const k of Object.keys(map)) if (map[k] === k) delete map[k];
                        run("parts.set", { id: active.id, yarnMap: Object.keys(map).length ? map : null });
                      }}
                    >
                      {yarns.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.id}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => run("parts.detach", { id: active.id })}>
                Tornar cópia independente
              </button>
            </>
          )}
          <div className="row">
            <button
              type="button"
              disabled={st.parts.length < 2}
              onClick={() => run("parts.remove", { id: active.id })}
            >
              Remover peça
            </button>
          </div>
        </fieldset>
      )}

      {show("seam") && (
        <>
          <h3>Nova costura</h3>
          <p className="hint">
            Selecione uma linha contínua de pontos (volta, caminho A→B...) na seção Pontos de Propriedades,
            use-a como lado A; troque de peça (ou de linha) e use como lado B.
          </p>
          <div className="row">
            <button type="button" data-testid="seam-side-a" onClick={() => run("seam.draft", { side: "a" })}>
              Usar seleção como lado A
            </button>
            <span data-testid="seam-draft-a" className="hint">
              {st.draft.a ? `${nameOf(st.draft.a.part)} · ${st.draft.a.uids.length} pontos` : "não definido"}
            </span>
          </div>
          <div className="row">
            <button type="button" data-testid="seam-side-b" onClick={() => run("seam.draft", { side: "b" })}>
              Usar seleção como lado B
            </button>
            <span data-testid="seam-draft-b" className="hint">
              {st.draft.b ? `${nameOf(st.draft.b.part)} · ${st.draft.b.uids.length} pontos` : "não definido"}
            </span>
          </div>
          <div className="row">
            <label>
              <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />{" "}
              Inverter sentido do lado B
            </label>
            <label>
              Proporção A:B{" "}
              <select
                aria-label="Pontos do lado A"
                value={ratio[0]}
                onChange={(e) => setRatio([Number(e.target.value), ratio[1]])}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              :
              <select
                aria-label="Pontos do lado B"
                value={ratio[1]}
                onChange={(e) => setRatio([ratio[0], Number(e.target.value)])}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label>
              Tipo{" "}
              <select aria-label="Tipo de costura" value={type} onChange={(e) => setType(e.target.value)}>
                {SEAM_TYPES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label="Nome da costura"
              placeholder={`Costura ${seams.length + 1}`}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {check && (
            <div data-testid="seam-check">
              {check.ok ? (
                <p className="ok">
                  Costura válida: {check.a?.count} pontos em A, {check.b?.count} em B, {check.pairs.length}{" "}
                  pares.
                </p>
              ) : (
                check.errors.map((e) => (
                  <p key={e} className="warn">
                    {e}
                  </p>
                ))
              )}
              {check.warnings.map((w) => (
                <p key={w} className="hint">
                  {w}
                </p>
              ))}
              {!check.ok && check.suggestedRatio && (
                <button type="button" onClick={() => setRatio(check.suggestedRatio as [number, number])}>
                  Usar {check.suggestedRatio[0]}:{check.suggestedRatio[1]}
                </button>
              )}
            </div>
          )}
          <div className="row">
            <button
              type="button"
              data-testid="seam-create"
              disabled={!check?.ok}
              onClick={() => {
                if (run("seam.add", { reverse, ratio, type, ...(name.trim() ? { name } : {}) })) setName("");
              }}
            >
              Criar costura
            </button>
            <button type="button" onClick={() => run("seam.clearDraft")}>
              Limpar lados
            </button>
          </div>
        </>
      )}

      {show("tree") && (
        <>
          <h3>Costuras ({seams.length})</h3>
          {seams.length === 0 && <p className="hint">Nenhuma costura.</p>}
          <ul className="seam-list" aria-label="Costuras">
            {seams.map((s) => (
              <li key={s.id} data-seam={s.id}>
                <span className={s.ok ? "ok" : "warn"}>{s.ok ? "✓" : "✗"}</span> <strong>{s.name}</strong>{" "}
                <span className="hint">
                  {nameOf(s.a.part)} ({s.a.count}) ↔ {nameOf(s.b.part)} ({s.b.count}) · {s.ratio[0]}:
                  {s.ratio[1]}
                  {s.reverse ? " · invertida" : ""}
                </span>
                {s.errors.map((e) => (
                  <span key={e} className="warn block">
                    {e}
                  </span>
                ))}
                <button
                  type="button"
                  aria-label={`Propriedades de ${s.name}`}
                  onClick={() => run("tree.select", { id: s.id })}
                >
                  ⋯
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${s.name}`}
                  onClick={() => run("seam.remove", { id: s.id })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {show("close") && (
        <>
          <h3>Fechar montagem</h3>
          <p className="hint">
            Move e gira as peças (rígidas, sem física) para os pontos costurados se encontrarem, a partir de
            uma peça fixa.
          </p>
          <div className="row">
            <label>
              Peça fixa{" "}
              <select
                aria-label="Peça fixa"
                value={st.parts.some((p) => p.id === anchor) ? anchor : (st.parts[0]?.id ?? "")}
                onChange={(e) => setAnchor(e.target.value)}
              >
                {st.parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={autoFlip} onChange={(e) => setAutoFlip(e.target.checked)} />{" "}
              escolher o sentido que deixa a peça para fora
            </label>
          </div>
          <div className="row">
            <button
              type="button"
              data-testid="assembly-close"
              disabled={seams.length === 0}
              onClick={() => {
                const r = run("assembly.close", {
                  ...(anchor ? { anchor } : {}),
                  autoFlip,
                }) as CloseResult | undefined;
                if (r) setClosed(r);
              }}
            >
              Fechar montagem
            </button>
            <button
              type="button"
              data-testid="assembly-undo-close"
              disabled={!closed || Object.keys(closed.before).length === 0}
              onClick={() => {
                if (!closed) return;
                run("assembly.undoClose", { before: closed.before, seamReverse: closed.seamReverse });
                setClosed(null);
              }}
            >
              Desfazer fechamento
            </button>
          </div>
          {closed && (
            <div data-testid="assembly-close-result">
              {closed.gaps.map((g) => (
                <p key={g.id} className={g.maxGap !== null && g.maxGap < 0.5 ? "ok" : "hint"}>
                  {g.name}: folga média {g.meanGap ?? "–"} · máxima {g.maxGap ?? "–"} (larguras de ponto)
                </p>
              ))}
              {closed.warnings.map((w) => (
                <p key={w} className="warn">
                  {w}
                </p>
              ))}
            </div>
          )}
        </>
      )}
      {error && (
        <p className="warn" role="alert" data-testid="assembly-error">
          {error}
        </p>
      )}
    </div>
  );
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Menu "Layout" do cabeçalho: trocar de preset ou de layout do usuário, mostrar painéis ocultos e salvar o atual.
import {
  dispatch,
  hiddenPanels,
  PANEL_TITLES,
  presetList,
  subscribeWorkspace,
  workspaceSnapshot,
} from "@novelo/commands";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export function LayoutMenu() {
  const ws = useSyncExternalStore(subscribeWorkspace, workspaceSnapshot);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (method: string, params: Record<string, unknown>, close = true) => {
    try {
      dispatch(method, params);
      setError(null);
      if (close) setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const hidden = hiddenPanels(ws.layout);

  return (
    <div className="menu" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        ▦ Layout
      </button>
      {open && (
        <div role="menu" aria-label="Layout" className="menu-pop">
          <div className="menu-title">Layouts padrão</div>
          {presetList().map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={ws.presetId === p.id}
              title={p.description}
              onClick={() => run("workspace.applyPreset", { id: p.id })}
            >
              {ws.presetId === p.id ? "✓ " : ""}
              {p.name}
            </button>
          ))}

          {ws.customs.length > 0 && <div className="menu-title">Meus layouts</div>}
          {ws.customs.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitemradio"
              aria-checked={ws.presetId === `custom:${c.id}`}
              onClick={() => run("workspace.applyPreset", { id: `custom:${c.id}` })}
            >
              {ws.presetId === `custom:${c.id}` ? "✓ " : ""}
              {c.name}
            </button>
          ))}

          {hidden.length > 0 && <div className="menu-title">Painéis ocultos</div>}
          {hidden.map((p) => (
            <button
              key={p}
              type="button"
              role="menuitem"
              onClick={() => run("workspace.showPanel", { panel: p }, false)}
            >
              Mostrar {PANEL_TITLES[p]}
            </button>
          ))}

          <div className="menu-title">Salvar layout atual</div>
          <form
            className="menu-save"
            onSubmit={(e) => {
              e.preventDefault();
              run("workspace.saveCustom", { name }, false);
              if (name.trim()) setName("");
            }}
          >
            <input
              aria-label="Nome do layout"
              placeholder="Nome do layout"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit">Salvar</button>
          </form>
          <button type="button" role="menuitem" onClick={() => run("workspace.reset", {})}>
            Restaurar padrão
          </button>
          {error && <p className="error menu-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

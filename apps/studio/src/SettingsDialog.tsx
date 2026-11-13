// SPDX-License-Identifier: GPL-3.0-or-later
// Menu de configurações. Cada aba é um grupo de opções; por enquanto só "Interface" (cubo de vistas).
// Toda alteração passa pelos comandos settings.* (D-21), então o MCP vê e muda os mesmos valores.
import {
  CUBE_POSITIONS,
  CUBE_SIZE_MAX,
  CUBE_SIZE_MIN,
  type CubePosition,
  dispatch,
  MIN_3D_MAX,
  MIN_3D_MIN,
  presetList,
  SCALE_MAX,
  SCALE_MIN,
  settingsSnapshot,
  subscribeSettings,
  subscribeWorkspace,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  workspaceSnapshot,
} from "@novelo/commands";
import { useEffect, useState, useSyncExternalStore } from "react";
import { YarnsSettings } from "./YarnsSettings.tsx";

const POSITION_LABELS: Record<CubePosition, string> = {
  "top-left": "Superior esquerdo",
  "top-right": "Superior direito",
  "bottom-left": "Inferior esquerdo",
  "bottom-right": "Inferior direito",
};

const TABS = [
  { id: "interface", label: "Interface" },
  { id: "yarns", label: "Fios e costura" },
  { id: "layout", label: "Layout" },
] as const;

export function SettingsDialog(props: { onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("interface");
  const settings = useSyncExternalStore(subscribeSettings, settingsSnapshot);
  const cube = settings.interface.viewCube;
  const { onClose } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ui = settings.interface;
  const setUi = (patch: { scale?: number; textScale?: number; min3d?: number; autoCompact?: boolean }) =>
    dispatch("settings.set", { interface: patch });

  const set = (patch: { position?: CubePosition; chamfered?: boolean; size?: number }) =>
    dispatch("settings.set", { interface: { viewCube: patch } });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: fundo do diálogo; Esc e o botão Fechar são o caminho por teclado
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Configurações" aria-modal="true">
        <header>
          <strong>Configurações</strong>
          <button type="button" onClick={onClose} aria-label="Fechar configurações">
            Fechar
          </button>
        </header>
        <div className="dialog-body">
          <div role="tablist" aria-label="Abas das configurações" className="dialog-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "tab on" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "layout" && <LayoutPanel />}
          {tab === "yarns" && <YarnsSettings />}

          {tab === "interface" && (
            <div role="tabpanel" aria-label="Interface" className="dialog-panel">
              <h3>Tamanho da interface</h3>
              <div className="row">
                {[
                  ["Compacto", 80],
                  ["Padrão", 90],
                  ["Confortável", 100],
                  ["Grande", 120],
                ].map(([name, v]) => (
                  <button
                    key={name}
                    type="button"
                    className={ui.scale === v ? "tab on" : "tab"}
                    onClick={() => setUi({ scale: v as number })}
                  >
                    {name} ({v}%)
                  </button>
                ))}
              </div>
              <label className="block">
                Tamanho da interface (texto, botões e caixas){" "}
                <input
                  type="range"
                  min={SCALE_MIN}
                  max={SCALE_MAX}
                  step={5}
                  value={ui.scale}
                  onChange={(e) => setUi({ scale: Number(e.target.value) })}
                />{" "}
                <output data-testid="ui-scale">{ui.scale}%</output>
              </label>
              <label className="block">
                Tamanho do texto (extra){" "}
                <input
                  type="range"
                  min={TEXT_SCALE_MIN}
                  max={TEXT_SCALE_MAX}
                  step={5}
                  value={ui.textScale}
                  onChange={(e) => setUi({ textScale: Number(e.target.value) })}
                />{" "}
                <output data-testid="text-scale">{ui.textScale}%</output>
              </label>

              <h3>Janelas</h3>
              <label className="block">
                Largura mínima da janela 3D{" "}
                <input
                  type="range"
                  min={MIN_3D_MIN}
                  max={MIN_3D_MAX}
                  step={20}
                  value={ui.min3d}
                  onChange={(e) => setUi({ min3d: Number(e.target.value) })}
                />{" "}
                <output data-testid="min3d">{ui.min3d} px</output>
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  checked={ui.autoCompact}
                  onChange={(e) => setUi({ autoCompact: e.target.checked })}
                />{" "}
                Em janela estreita, juntar os painéis em abas
              </label>

              <h3>Cubo de vistas</h3>

              <fieldset>
                <legend>Posição</legend>
                <div className="pos-grid">
                  {CUBE_POSITIONS.map((p) => (
                    <label key={p}>
                      <input
                        type="radio"
                        name="cube-position"
                        checked={cube.position === p}
                        onChange={() => set({ position: p })}
                      />{" "}
                      {POSITION_LABELS[p]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <input
                  type="checkbox"
                  checked={cube.chamfered}
                  onChange={(e) => set({ chamfered: e.target.checked })}
                />{" "}
                Cubo chanfrado (faces, arestas e cantos)
              </label>

              <label className="block">
                Tamanho do cubo{" "}
                <input
                  type="range"
                  min={CUBE_SIZE_MIN}
                  max={CUBE_SIZE_MAX}
                  step={4}
                  value={cube.size}
                  onChange={(e) => set({ size: Number(e.target.value) })}
                />{" "}
                <output data-testid="cube-size">{cube.size} px</output>
              </label>

              <div className="row">
                <button type="button" onClick={() => dispatch("settings.reset", {})}>
                  Restaurar padrão
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Aba "Layout": aplicar presets e gerenciar os layouts salvos pelo usuário. */
function LayoutPanel() {
  const ws = useSyncExternalStore(subscribeWorkspace, workspaceSnapshot);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (method: string, params: Record<string, unknown>) => {
    try {
      dispatch(method, params);
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  return (
    <div role="tabpanel" aria-label="Layout" className="dialog-panel">
      <h3>Layouts padrão</h3>
      <ul className="layout-list">
        {presetList().map((p) => (
          <li key={p.id} data-preset={p.id}>
            <div>
              <strong>{p.name}</strong>
              {ws.presetId === p.id && <span className="badge"> em uso</span>}
              <div className="hint">{p.description}</div>
            </div>
            <button type="button" onClick={() => run("workspace.applyPreset", { id: p.id })}>
              Aplicar
            </button>
          </li>
        ))}
      </ul>

      <h3>Meus layouts</h3>
      {ws.customs.length === 0 && (
        <p className="hint">
          Nenhum ainda. Arrume as janelas como quiser e use Layout &gt; Salvar layout atual no cabeçalho.
        </p>
      )}
      <ul className="layout-list">
        {ws.customs.map((c) => (
          <li key={c.id} data-custom={c.id}>
            {editing === c.id ? (
              <form
                className="menu-save"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (run("workspace.renameCustom", { id: c.id, name: draft })) setEditing(null);
                }}
              >
                <input
                  aria-label="Novo nome"
                  value={draft}
                  maxLength={40}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit">Salvar nome</button>
                <button type="button" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <div>
                  <strong>{c.name}</strong>
                  {ws.presetId === `custom:${c.id}` && <span className="badge"> em uso</span>}
                </div>
                <span className="actions">
                  <button
                    type="button"
                    onClick={() => run("workspace.applyPreset", { id: `custom:${c.id}` })}
                  >
                    Aplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(c.id);
                      setDraft(c.name);
                    }}
                  >
                    Renomear
                  </button>
                  <button type="button" onClick={() => run("workspace.deleteCustom", { id: c.id })}>
                    Excluir
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" onClick={() => run("workspace.reset", {})}>
          Restaurar layout padrão
        </button>
      </div>
    </div>
  );
}

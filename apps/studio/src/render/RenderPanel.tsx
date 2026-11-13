// SPDX-License-Identifier: GPL-3.0-or-later
// Janela "Render" (R3b): ferramentas de render (luz, fundo, câmera, resolução, qualidade), botão Play, pausar, parar e
// salvar PNG. O estado e os ajustes vivem nos comandos render.* (D-21) e o trabalho roda em `renderJob.ts`, fora do
// painel: aqui só se mostra a tela e se mandam comandos.
import { dispatch, renderSnapshot, subscribeRender } from "@novelo/commands";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { lastCamera } from "../cameraStore.ts";
import { pinCamera, renderMessage, renderView, subscribeRenderMessage } from "./renderJob.ts";

const RESOLUTIONS: [string, number, number][] = [
  ["720p", 1280, 720],
  ["1080p", 1920, 1080],
  ["1440p", 2560, 1440],
  ["4K", 3840, 2160],
  ["Quadrado 1080", 1080, 1080],
];

const STATE_LABEL: Record<string, string> = {
  idle: "pronto para começar",
  running: "renderizando",
  paused: "pausado",
  done: "concluído",
  stopped: "parado (imagem parcial mantida)",
  stale: "obsoleto: o modelo mudou durante o render",
  error: "erro",
};

/** Campo numérico com rascunho: só confirma (render.set) ao sair do campo ou apertar Enter, então dá para digitar "1920". */
function NumField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== "" && Number.isFinite(Number(draft)))
      props.onCommit(Number(draft));
    setDraft(null);
  };
  return (
    <input
      className="num"
      type="number"
      aria-label={props.label}
      disabled={props.disabled}
      min={props.min}
      max={props.max}
      value={draft ?? props.value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

export function RenderPanel() {
  const st = useSyncExternalStore(subscribeRender, renderSnapshot);
  const msg = useSyncExternalStore(subscribeRenderMessage, renderMessage);
  const s = st.settings;
  const host = useRef<HTMLDivElement>(null);
  const [camNote, setCamNote] = useState("câmera do 3D no momento do Play (ou enquadramento automático)");
  const [error, setError] = useState<string | null>(null);

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
  const set = (patch: Record<string, unknown>) => run("render.set", patch);

  // a tela de exibição é única e sobrevive ao painel: aqui só é encaixada e solta
  useEffect(() => {
    const d = renderView().display;
    d.style.cssText =
      "max-width:100%;height:auto;background:repeating-conic-gradient(#e6e1d0 0 25%,#f4f1e8 0 50%) 50%/16px 16px";
    host.current?.appendChild(d);
    return () => {
      d.remove();
    };
  }, []);

  const busy = st.state === "running";
  const canPlay = st.state !== "running";
  const pct = st.total > 0 ? Math.round((st.done / st.total) * 100) : 0;
  const resLabel = RESOLUTIONS.find(([, w, h]) => w === s.width && h === s.height)?.[0] ?? "personalizada";

  return (
    <div className="panel-col scroll render-panel" data-testid="render-panel">
      <div className="row">
        <button
          type="button"
          data-testid="render-play"
          disabled={!canPlay}
          onClick={() => run(st.state === "paused" ? "render.resume" : "render.start")}
        >
          ▶ {st.state === "paused" ? "Continuar" : "Play"}
        </button>
        <button type="button" data-testid="render-pause" disabled={!busy} onClick={() => run("render.pause")}>
          ⏸ Pausar
        </button>
        <button
          type="button"
          data-testid="render-stop"
          disabled={st.state !== "running" && st.state !== "paused"}
          onClick={() => run("render.stop")}
        >
          ■ Parar
        </button>
        <button type="button" data-testid="render-png" onClick={() => run("render.savePng")}>
          Salvar PNG
        </button>
      </div>
      <progress max={100} value={pct} aria-label="Progresso do render" />
      <p className="hint" data-testid="render-status">
        {STATE_LABEL[st.state]} · {st.done}/{st.total} pontos · {st.phase || "—"} ·{" "}
        {(st.ms / 1000).toFixed(1)} s
      </p>
      {st.error && <p className="warn">{st.error}</p>}
      {msg && (
        <p className="warn" data-testid="render-message">
          {msg}
        </p>
      )}
      <div ref={host} className="render-host" />

      <fieldset>
        <legend>Alcance</legend>
        <div className="row">
          <label>
            Alcance{" "}
            <select
              aria-label="Alcance do render"
              value={s.scope}
              onChange={(e) => set({ scope: e.target.value })}
            >
              <option value="all">Tudo</option>
              <option value="selection">Só a seleção</option>
            </select>
          </label>
          <label>
            Vizinhos de contexto{" "}
            <select
              aria-label="Vizinhos de contexto"
              value={s.context}
              disabled={s.scope === "all"}
              onChange={(e) => set({ context: Number(e.target.value) })}
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        </div>
        <div className="row">
          <span>
            Relaxamento (iterações){" "}
            <NumField
              label="Relaxamento (iterações)"
              value={s.relaxIterations}
              min={0}
              max={100}
              disabled={s.scope === "all"}
              onCommit={(v) => set({ relaxIterations: v })}
            />
          </span>
          <label>
            <input
              type="checkbox"
              checked={s.fitSelection}
              disabled={s.scope === "all"}
              onChange={(e) => set({ fitSelection: e.target.checked })}
            />{" "}
            Enquadrar a seleção
          </label>
        </div>
        <label className="block">
          Oclusão de ambiente (AO) {s.ao}{" "}
          <input
            type="range"
            aria-label="Oclusão de ambiente"
            min={0}
            max={1}
            step={0.1}
            value={s.ao}
            onChange={(e) => set({ ao: Number(e.target.value) })}
          />
        </label>
        {s.ao > 0 && (s.samples < 8 || !s.shadows) && (
          <p className="hint" data-testid="render-ao-hint">
            O AO precisa de sombras e de pelo menos 8 amostras; com menos, é ignorado.
          </p>
        )}
        <div className="row">
          <label>
            Modo{" "}
            <select
              aria-label="Modo do render"
              value={s.mode}
              onChange={(e) => set({ mode: e.target.value })}
            >
              <option value="fast">Rápido</option>
              <option value="full">Completo, ponto a ponto</option>
            </select>
          </label>
          <span>
            Velocidade (pontos/s){" "}
            <NumField
              label="Velocidade (pontos/s)"
              value={s.pace}
              min={0}
              max={2000}
              disabled={s.mode !== "full"}
              onCommit={(v) => set({ pace: v })}
            />
          </span>
          {st.info?.chunks && (
            <span className="hint" data-testid="render-chunks">
              blocos refeitos {st.info.chunks.rebuilt} · reaproveitados {st.info.chunks.reused}
            </span>
          )}
        </div>
        <label>
          Modelo do fio{" "}
          <select
            aria-label="Modelo do fio"
            value={s.yarnModel}
            onChange={(e) => set({ yarnModel: e.target.value })}
          >
            <option value="simple">Simples</option>
            <option value="traced">Fio contínuo (pb, mpa, pa)</option>
            <option value="relaxed">
              Relaxado com colisão (experimental, só pb; falha em aumentos, diminuições e curvas)
            </option>
          </select>
        </label>
        <span>
          Raio do fio relaxado{" "}
          <NumField
            label="Raio do fio relaxado"
            value={s.yarnRho}
            min={0.06}
            max={0.12}
            disabled={s.yarnModel !== "relaxed"}
            onCommit={(v) => set({ yarnRho: v })}
          />
        </span>
        <div className="row">
          <label>
            <input
              type="checkbox"
              aria-label="Ponto de base muda de forma"
              checked={s.baseShape}
              onChange={(e) => set({ baseShape: e.target.checked })}
            />{" "}
            Ponto de base muda de forma
          </label>
          {st.info?.shaped !== undefined && (
            <span className="hint" data-testid="render-shaped">
              {st.info.shaped} pontos com forma alterada
            </span>
          )}
        </div>
        {st.info && st.info.scope === "selection" && (
          <p className="hint" data-testid="render-info">
            {st.info.selected} selecionados + {st.info.context} de contexto
            {st.info.relax
              ? ` · ajuste ${(st.info.relax.residualBefore * 100).toFixed(1)}% → ${(st.info.relax.residualAfter * 100).toFixed(1)}%`
              : " · sem relaxamento"}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Imagem</legend>
        <div className="row">
          <label>
            Resolução{" "}
            <select
              aria-label="Resolução do render"
              value={resLabel}
              onChange={(e) => {
                const r = RESOLUTIONS.find(([n]) => n === e.target.value);
                if (r) set({ width: r[1], height: r[2] });
              }}
            >
              {RESOLUTIONS.map(([n]) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="personalizada" disabled>
                personalizada
              </option>
            </select>
          </label>
          <span>
            L{" "}
            <NumField
              label="Largura do render"
              value={s.width}
              min={64}
              max={4096}
              onCommit={(v) => set({ width: v })}
            />
          </span>
          <span>
            A{" "}
            <NumField
              label="Altura do render"
              value={s.height}
              min={64}
              max={4096}
              onCommit={(v) => set({ height: v })}
            />
          </span>
        </div>
        <div className="row">
          <label>
            Qualidade{" "}
            <select
              aria-label="Qualidade do render"
              value={s.quality}
              onChange={(e) => set({ quality: Number(e.target.value) })}
            >
              <option value={1}>Rápida</option>
              <option value={2}>Fina</option>
            </select>
          </label>
          <span>
            Amostras{" "}
            <NumField
              label="Amostras de suavização"
              value={s.samples}
              min={1}
              max={64}
              onCommit={(v) => set({ samples: v })}
            />
          </span>
          <label>
            <input type="checkbox" checked={s.shadows} onChange={(e) => set({ shadows: e.target.checked })} />{" "}
            Sombras
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Luz</legend>
        {(
          [
            ["azimuth", "Direção", -180, 180, 5],
            ["elevation", "Altura", 0, 90, 5],
            ["intensity", "Intensidade", 0, 6, 0.1],
            ["ambient", "Ambiente", 0, 4, 0.1],
          ] as const
        ).map(([k, label, min, max, step]) => (
          <label key={k} className="block">
            {label} {s.light[k]}{" "}
            <input
              type="range"
              aria-label={`Luz: ${label}`}
              min={min}
              max={max}
              step={step}
              value={s.light[k]}
              onChange={(e) => set({ light: { [k]: Number(e.target.value) } })}
            />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Fundo e câmera</legend>
        <div className="row">
          <label>
            Fundo{" "}
            <select
              aria-label="Tipo de fundo"
              value={s.background.kind}
              onChange={(e) => set({ background: { kind: e.target.value } })}
            >
              <option value="color">Cor</option>
              <option value="gradient">Degradê</option>
              <option value="transparent">Transparente</option>
            </select>
          </label>
          <input
            type="color"
            aria-label="Cor do fundo 1"
            value={s.background.c1}
            onChange={(e) => set({ background: { c1: e.target.value } })}
          />
          <input
            type="color"
            aria-label="Cor do fundo 2"
            value={s.background.c2}
            onChange={(e) => set({ background: { c2: e.target.value } })}
          />
        </div>
        <div className="row">
          <span>
            Abertura (°){" "}
            <NumField
              label="Abertura da câmera"
              value={s.fovDeg}
              min={10}
              max={90}
              onCommit={(v) => set({ fovDeg: v })}
            />
          </span>
          <button
            type="button"
            onClick={() => {
              const c = window.__view3d?.cameraState() ?? lastCamera();
              if (c) {
                pinCamera({ position: c.position, target: c.target, up: c.up });
                set({ fovDeg: Math.round(c.fovDeg) });
                setCamNote(`câmera copiada do 3D (${c.position.map((v) => v.toFixed(1)).join(", ")})`);
              } else
                setError(
                  "abra a aba 3D antes de copiar a câmera (sem ela, o render enquadra a peça sozinho)",
                );
            }}
          >
            Copiar câmera do 3D
          </button>
          <button
            type="button"
            onClick={() => {
              pinCamera(null);
              setCamNote("câmera do 3D no momento do Play (ou enquadramento automático)");
            }}
          >
            Seguir o 3D
          </button>
        </div>
        <p className="hint">{camNote}</p>
      </fieldset>
      {error && (
        <p className="warn" role="alert" data-testid="render-error">
          {error}
        </p>
      )}
    </div>
  );
}

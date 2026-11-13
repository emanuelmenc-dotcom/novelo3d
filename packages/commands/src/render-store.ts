// SPDX-License-Identifier: GPL-3.0-or-later
// Estado da janela de render (R3): ajustes e máquina de estados play / pausar / parar. Os comandos só mexem aqui
// (síncronos, D-21); quem executa o trabalho pesado é o studio, que assina este estado e relata o progresso. Testes e
// MCP acompanham por `render.status`.

export type RenderState = "idle" | "running" | "paused" | "done" | "stopped" | "stale" | "error";

export interface RenderLight {
  /** Azimute e elevação da luz principal, em graus. */
  azimuth: number;
  elevation: number;
  intensity: number;
  ambient: number;
}

export interface RenderBackground {
  kind: "color" | "gradient" | "transparent";
  c1: string;
  c2: string;
}

export interface RenderSettings {
  /** Qualidade da malha: 1 = rápido (8 lados), 2 = fino (12 lados). */
  quality: 1 | 2;
  width: number;
  height: number;
  /** Amostras de suavização acumuladas ao fim (1 = sem). */
  samples: number;
  fovDeg: number;
  light: RenderLight;
  background: RenderBackground;
  shadows: boolean;
  /** "all": a peça toda; "selection": só a seleção (fotografada no Play) mais o contexto. */
  scope: "all" | "selection";
  /** Saltos de vizinhos desenhados em volta da seleção (sempre fixos). */
  context: 0 | 1 | 2;
  /** Iterações de relaxamento de espaçamento da seleção (0 desliga). */
  relaxIterations: number;
  /** Enquadra a câmera no que será desenhado. */
  fitSelection: boolean;
  /** O topo do ponto de base abre e inclina na direção dos filhos (só no Render). */
  baseShape: boolean;
  /** Fio contínuo dos pontos de haste (pb, mpa, pa, pad); desligado, usa o modelo procedural antigo. */
  continuousYarn: boolean;
  /** "fast": monta direto com as formas finais; "full": ponto a ponto em ordem de trabalho, refazendo as bases. */
  mode: "fast" | "full";
  /** Modo completo: pontos revelados por segundo (0 = o mais rápido possível). */
  pace: number;
  /** Oclusão de ambiente por sombras acumuladas, 0 a 1 (precisa de pelo menos 8 amostras). */
  ao: number;
}

/** Resultado do render por seleção (relatado pelo studio). */
export interface RenderInfo {
  scope: "all" | "selection";
  selected: number;
  context: number;
  drawn: number;
  relax: { iterations: number; residualBefore: number; residualAfter: number; maxShift: number } | null;
  /** Pontos com a forma do topo alterada (R3d). */
  shaped?: number;
  /** Soma de verificação (FNV) dos vértices da malha final, arredondados em 1e-4; só ao fim do bake. */
  geomChecksum?: number;
  /** Blocos de 32 pontos refeitos e reaproveitados de uma rodada anterior (R3d-3). */
  chunks?: { rebuilt: number; reused: number };
}

export interface RenderStatus {
  state: RenderState;
  /** Pontos prontos / total, e a fase atual ("modelos", "amostras", "pronto"). */
  done: number;
  total: number;
  phase: string;
  ms: number;
  error: string | null;
  /** Número da rodada (sobe a cada play que começa do zero). */
  run: number;
  /** Pedidos de salvar PNG ainda não atendidos. */
  pngRequests: number;
  /** Contagens do último Play (null até o studio relatar). */
  info: RenderInfo | null;
  settings: RenderSettings;
}

export const RENDER_MAX_SIDE = 4096;
export const RENDER_MAX_SAMPLES = 64;

export const DEFAULT_RENDER: RenderSettings = {
  quality: 1,
  width: 1280,
  height: 720,
  samples: 8,
  fovDeg: 35,
  light: { azimuth: 35, elevation: 50, intensity: 2.2, ambient: 1.2 },
  background: { kind: "gradient", c1: "#f4f1e8", c2: "#cfc9b6" },
  shadows: true,
  scope: "all",
  context: 1,
  relaxIterations: 20,
  fitSelection: true,
  baseShape: true,
  continuousYarn: false,
  mode: "fast",
  pace: 60,
  ao: 0.5,
};

const clone = (s: RenderSettings): RenderSettings => ({
  ...s,
  light: { ...s.light },
  background: { ...s.background },
});

function fresh(): RenderStatus {
  return {
    state: "idle",
    done: 0,
    total: 0,
    phase: "",
    ms: 0,
    error: null,
    run: 0,
    pngRequests: 0,
    info: null,
    settings: clone(DEFAULT_RENDER),
  };
}

let status: RenderStatus = fresh();
const listeners = new Set<(s: RenderStatus) => void>();

export const renderSnapshot = (): RenderStatus => status;
export function subscribeRender(fn: (s: RenderStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function set(next: Partial<RenderStatus>): RenderStatus {
  status = { ...status, ...next };
  for (const fn of listeners) fn(status);
  return status;
}

/** Transições válidas: de cada estado, os comandos aceitos. */
const NEXT: Record<RenderState, readonly string[]> = {
  idle: ["start"],
  running: ["pause", "stop", "complete", "fail", "stale"],
  paused: ["resume", "stop", "stale"],
  done: ["start"],
  stopped: ["start"],
  stale: ["start"],
  error: ["start"],
};

function allow(cmd: string): void {
  if (!NEXT[status.state].includes(cmd)) {
    throw new Error(`não dá para '${cmd}' com o render em '${status.state}'`);
  }
}

export function startRender(): RenderStatus {
  allow("start");
  return set({
    state: "running",
    done: 0,
    total: 0,
    phase: "modelos",
    ms: 0,
    error: null,
    info: null,
    run: status.run + 1,
  });
}
export function pauseRender(): RenderStatus {
  allow("pause");
  return set({ state: "paused" });
}
export function resumeRender(): RenderStatus {
  allow("resume");
  return set({ state: "running" });
}
/** Parar descarta a fila e mantém a imagem parcial. */
export function stopRender(): RenderStatus {
  allow("stop");
  return set({ state: "stopped" });
}
export function staleRender(): RenderStatus {
  allow("stale");
  return set({ state: "stale" });
}
export function failRender(message: string): RenderStatus {
  allow("fail");
  return set({ state: "error", error: message });
}
export function completeRender(ms: number): RenderStatus {
  allow("complete");
  return set({ state: "done", phase: "pronto", done: status.total, ms });
}

/** Progresso monotônico (o cursor nunca anda para trás). Só vale com o render rodando ou pausado. */
export function progressRender(done: number, total: number, phase: string, ms: number): RenderStatus {
  if (status.state !== "running" && status.state !== "paused") {
    throw new Error(`progresso recusado com o render em '${status.state}'`);
  }
  if (![done, total, ms].every((v) => Number.isFinite(v) && v >= 0)) {
    throw new Error("progresso inválido: done, total e ms devem ser números finitos e não negativos");
  }
  return set({ done: Math.max(status.done, Math.min(done, total)), total, phase, ms });
}

/** Contagens do render por seleção; só com o render rodando ou pausado. */
export function infoRender(info: RenderInfo): RenderStatus {
  if (status.state !== "running" && status.state !== "paused") {
    throw new Error(`info recusada com o render em '${status.state}'`);
  }
  const nums = [info.selected, info.context, info.drawn, info.shaped ?? 0, info.geomChecksum ?? 0];
  if (info.chunks) nums.push(info.chunks.rebuilt, info.chunks.reused);
  if (info.relax)
    nums.push(
      info.relax.iterations,
      info.relax.residualBefore,
      info.relax.residualAfter,
      info.relax.maxShift,
    );
  if (!nums.every((v) => Number.isFinite(v) && v >= 0))
    throw new Error("info inválida: números finitos e não negativos");
  if (info.scope !== "all" && info.scope !== "selection") throw new Error("info inválida: scope");
  return set({ info });
}

export function requestPng(): RenderStatus {
  return set({ pngRequests: status.pngRequests + 1 });
}
export function pngServed(): RenderStatus {
  return set({ pngRequests: Math.max(0, status.pngRequests - 1) });
}

/** Volta ao estado inicial; o número da rodada continua subindo (um start depois do reset é sempre uma rodada nova). */
export function resetRender(): RenderStatus {
  status = { ...fresh(), run: status.run };
  for (const fn of listeners) fn(status);
  return status;
}

const hex = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, name: string, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new Error(`'${name}' deve ser um número entre ${min} e ${max}`);
  }
  return v;
};

export type RenderPatch = {
  quality?: number;
  width?: number;
  height?: number;
  samples?: number;
  fovDeg?: number;
  shadows?: boolean;
  light?: Partial<RenderLight>;
  background?: Partial<RenderBackground>;
  scope?: string;
  context?: number;
  relaxIterations?: number;
  fitSelection?: boolean;
  baseShape?: boolean;
  continuousYarn?: boolean;
  mode?: string;
  pace?: number;
  ao?: number;
};

/** Ajustes do render (validados). Mudar ajustes com o render rodando não vale na rodada atual. */
export function setRenderSettings(p: RenderPatch): RenderStatus {
  const s = clone(status.settings);
  if (p.quality !== undefined) {
    if (p.quality !== 1 && p.quality !== 2) throw new Error("'quality' deve ser 1 (rápido) ou 2 (fino)");
    s.quality = p.quality;
  }
  if (p.width !== undefined) s.width = Math.round(num(p.width, "width", 64, RENDER_MAX_SIDE));
  if (p.height !== undefined) s.height = Math.round(num(p.height, "height", 64, RENDER_MAX_SIDE));
  if (p.samples !== undefined) s.samples = Math.round(num(p.samples, "samples", 1, RENDER_MAX_SAMPLES));
  if (p.fovDeg !== undefined) s.fovDeg = num(p.fovDeg, "fovDeg", 10, 90);
  if (p.shadows !== undefined) {
    if (typeof p.shadows !== "boolean") throw new Error("'shadows' deve ser verdadeiro ou falso");
    s.shadows = p.shadows;
  }
  if (p.scope !== undefined) {
    if (p.scope !== "all" && p.scope !== "selection") throw new Error("'scope' deve ser all ou selection");
    s.scope = p.scope;
  }
  if (p.context !== undefined) {
    if (p.context !== 0 && p.context !== 1 && p.context !== 2)
      throw new Error("'context' deve ser 0, 1 ou 2");
    s.context = p.context;
  }
  if (p.relaxIterations !== undefined) {
    s.relaxIterations = Math.round(num(p.relaxIterations, "relaxIterations", 0, 100));
  }
  if (p.fitSelection !== undefined) {
    if (typeof p.fitSelection !== "boolean") throw new Error("'fitSelection' deve ser verdadeiro ou falso");
    s.fitSelection = p.fitSelection;
  }
  if (p.pace !== undefined) s.pace = Math.round(num(p.pace, "pace", 0, 2000));
  if (p.ao !== undefined) s.ao = num(p.ao, "ao", 0, 1);
  if (p.continuousYarn !== undefined) {
    if (typeof p.continuousYarn !== "boolean")
      throw new Error("'continuousYarn' deve ser verdadeiro ou falso");
    s.continuousYarn = p.continuousYarn;
  }
  if (p.mode !== undefined) {
    if (p.mode !== "fast" && p.mode !== "full") throw new Error("'mode' deve ser fast ou full");
    s.mode = p.mode;
  }
  if (p.baseShape !== undefined) {
    if (typeof p.baseShape !== "boolean") throw new Error("'baseShape' deve ser verdadeiro ou falso");
    s.baseShape = p.baseShape;
  }
  if (p.light) {
    const l = p.light;
    if (l.azimuth !== undefined) s.light.azimuth = num(l.azimuth, "light.azimuth", -360, 360);
    if (l.elevation !== undefined) s.light.elevation = num(l.elevation, "light.elevation", 0, 90);
    if (l.intensity !== undefined) s.light.intensity = num(l.intensity, "light.intensity", 0, 10);
    if (l.ambient !== undefined) s.light.ambient = num(l.ambient, "light.ambient", 0, 10);
  }
  if (p.background) {
    const b = p.background;
    if (b.kind !== undefined) {
      if (b.kind !== "color" && b.kind !== "gradient" && b.kind !== "transparent") {
        throw new Error("'background.kind' deve ser color, gradient ou transparent");
      }
      s.background.kind = b.kind;
    }
    for (const k of ["c1", "c2"] as const) {
      const v = b[k];
      if (v !== undefined) {
        if (typeof v !== "string" || !hex.test(v))
          throw new Error(`'background.${k}' deve ser do tipo #rrggbb`);
        s.background[k] = v.toLowerCase();
      }
    }
  }
  return set({ settings: s });
}

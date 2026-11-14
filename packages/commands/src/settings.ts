// SPDX-License-Identifier: GPL-3.0-or-later
// Configurações do aplicativo (aba "Interface"). Vivem na camada de comandos (D-21) para que a interface e o MCP
// leiam e alterem o mesmo estado. Sem DOM: a persistência (localStorage) fica no studio.

import {
  COLOR_KINDS,
  type ColorKind,
  type MaterialId,
  type Thickness,
  validateMaterial,
  validateThickness,
} from "@novelo/core";

export const SEAM_TYPES = ["mattress", "whip", "slip", "sc"] as const;
export type SeamType = (typeof SEAM_TYPES)[number];

/** Padrão dos fios novos: tipo de cor, material e espessura (a cor muda de um fio para outro). */
export interface YarnDefaults {
  colorKind: ColorKind;
  segmentM?: number;
  material?: MaterialId;
  thickness?: Thickness;
}
/** Padrão do fio de costura e do ponto de costura das costuras novas. */
export interface SeamDefaults {
  colorHex: string;
  type: SeamType;
  material?: MaterialId;
  thickness?: Thickness;
}
export interface YarnSettings {
  /** Largura do ponto usada nas estimativas de consumo, em mm. */
  stitchWidthMm: number;
  standard: YarnDefaults;
  seam: SeamDefaults;
}

export const CUBE_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type CubePosition = (typeof CUBE_POSITIONS)[number];

export const CUBE_SIZE_MIN = 64;
export const CUBE_SIZE_MAX = 240;

/** Escala de toda a interface (texto, botões e caixas), em %. */
export const SCALE_MIN = 70;
export const SCALE_MAX = 150;
/** Escala extra só do texto, em %, aplicada sobre a escala da interface. */
export const TEXT_SCALE_MIN = 80;
export const TEXT_SCALE_MAX = 150;
/** Largura mínima da janela 3D, em pixels (a altura mínima é 80% disso). */
export const MIN_3D_MIN = 200;
export const MIN_3D_MAX = 700;

export interface ViewCubeSettings {
  position: CubePosition;
  /** Cubo chanfrado (faces, arestas e cantos como regiões) ou cubo simples. */
  chamfered: boolean;
  /** Lado do cubo, em pixels. */
  size: number;
}

export interface InterfaceSettings {
  viewCube: ViewCubeSettings;
  /** Escala de toda a interface, em %. */
  scale: number;
  /** Escala extra só do texto, em %. */
  textScale: number;
  /** Largura mínima da janela 3D, em pixels. */
  min3d: number;
  /** Quando as janelas não cabem, juntar os painéis em abas (sem alterar o layout salvo). */
  autoCompact: boolean;
}

export interface Settings {
  interface: InterfaceSettings;
  yarns: YarnSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  interface: {
    viewCube: { position: "bottom-left", chamfered: true, size: 112 },
    scale: 90,
    textScale: 100,
    min3d: 320,
    autoCompact: true,
  },
  yarns: {
    stitchWidthMm: 5,
    standard: { colorKind: "solid" },
    seam: { colorHex: "#d6336c", type: "mattress" },
  },
};

type Nullable<T> = { [K in keyof T]?: T[K] | null };
export type SettingsPatch = {
  interface?: Partial<Omit<InterfaceSettings, "viewCube">> & { viewCube?: Partial<ViewCubeSettings> };
  yarns?: { stitchWidthMm?: number; standard?: Nullable<YarnDefaults>; seam?: Nullable<SeamDefaults> };
};

const clone = (s: Settings): Settings => ({
  interface: { ...s.interface, viewCube: { ...s.interface.viewCube } },
  yarns: {
    stitchWidthMm: s.yarns.stitchWidthMm,
    standard: {
      ...s.yarns.standard,
      ...(s.yarns.standard.thickness ? { thickness: { ...s.yarns.standard.thickness } } : {}),
    },
    seam: {
      ...s.yarns.seam,
      ...(s.yarns.seam.thickness ? { thickness: { ...s.yarns.seam.thickness } } : {}),
    },
  },
});

let current: Settings = clone(DEFAULT_SETTINGS);
const listeners = new Set<(s: Settings) => void>();

export const getSettings = (): Settings => clone(current);

/** Objeto atual, sem cópia: só muda quando uma configuração muda (serve de "snapshot" para o React). */
export const settingsSnapshot = (): Settings => current;

export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function num(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`'${name}' deve ser um número`);
  return Math.round(Math.min(max, Math.max(min, v)));
}

/** Valida e aplica o padrão de fios e de costura; `null` limpa material ou espessura. */
function applyYarns(out: Settings, y: SettingsPatch["yarns"]): void {
  if (!y) return;
  if (y.stitchWidthMm !== undefined) {
    if (typeof y.stitchWidthMm !== "number" || !(y.stitchWidthMm >= 1 && y.stitchWidthMm <= 30)) {
      throw new Error("a largura do ponto deve ficar entre 1 e 30 mm");
    }
    out.yarns.stitchWidthMm = y.stitchWidthMm;
  }
  const st = y.standard;
  if (st) {
    if (st.colorKind !== undefined) {
      if (st.colorKind === null || !(COLOR_KINDS as readonly string[]).includes(st.colorKind)) {
        throw new Error(`tipo de cor deve ser ${COLOR_KINDS.join(", ")}`);
      }
      out.yarns.standard.colorKind = st.colorKind;
    }
    if (st.segmentM !== undefined) {
      if (st.segmentM === null) out.yarns.standard.segmentM = undefined;
      else if (typeof st.segmentM === "number" && st.segmentM >= 0.05 && st.segmentM <= 500) {
        out.yarns.standard.segmentM = st.segmentM;
      } else throw new Error("o trecho de cor deve ficar entre 0,05 e 500 metros");
    }
    if (st.material !== undefined) out.yarns.standard.material = validateMaterial(st.material, "padrão");
    if (st.thickness !== undefined) out.yarns.standard.thickness = validateThickness(st.thickness, "padrão");
  }
  const sm = y.seam;
  if (sm) {
    if (sm.colorHex !== undefined) {
      if (typeof sm.colorHex !== "string" || !/^#[0-9a-f]{6}$/i.test(sm.colorHex)) {
        throw new Error("a cor da costura deve ser do tipo #rrggbb");
      }
      out.yarns.seam.colorHex = sm.colorHex.toLowerCase();
    }
    if (sm.type !== undefined) {
      if (sm.type === null || !(SEAM_TYPES as readonly string[]).includes(sm.type)) {
        throw new Error(`tipo de costura deve ser ${SEAM_TYPES.join(", ")}`);
      }
      out.yarns.seam.type = sm.type;
    }
    if (sm.material !== undefined) out.yarns.seam.material = validateMaterial(sm.material, "costura");
    if (sm.thickness !== undefined) out.yarns.seam.thickness = validateThickness(sm.thickness, "costura");
  }
  for (const k of ["standard", "seam"] as const) {
    const o = out.yarns[k];
    if (o.material === undefined) delete o.material;
    if (o.thickness === undefined) delete o.thickness;
  }
  if (out.yarns.standard.segmentM === undefined) delete out.yarns.standard.segmentM;
}

/** Valida um trecho e o aplica sobre `base`. Lança erro claro para valores inválidos. */
export function applyPatch(base: Settings, patch: SettingsPatch): Settings {
  const out = clone(base);
  applyYarns(out, patch.yarns);
  const ui = patch.interface;
  if (ui === undefined) return out;
  const vc = ui.viewCube;
  if (vc !== undefined) {
    if (vc.position !== undefined) {
      if (!(CUBE_POSITIONS as readonly string[]).includes(vc.position)) {
        throw new Error(`posição '${String(vc.position)}' inválida (use ${CUBE_POSITIONS.join(", ")})`);
      }
      out.interface.viewCube.position = vc.position;
    }
    if (vc.chamfered !== undefined) {
      if (typeof vc.chamfered !== "boolean") throw new Error("'chamfered' deve ser verdadeiro ou falso");
      out.interface.viewCube.chamfered = vc.chamfered;
    }
    if (vc.size !== undefined)
      out.interface.viewCube.size = num(vc.size, "size", CUBE_SIZE_MIN, CUBE_SIZE_MAX);
  }
  if (ui.scale !== undefined) out.interface.scale = num(ui.scale, "scale", SCALE_MIN, SCALE_MAX);
  if (ui.textScale !== undefined) {
    out.interface.textScale = num(ui.textScale, "textScale", TEXT_SCALE_MIN, TEXT_SCALE_MAX);
  }
  if (ui.min3d !== undefined) out.interface.min3d = num(ui.min3d, "min3d", MIN_3D_MIN, MIN_3D_MAX);
  if (ui.autoCompact !== undefined) {
    if (typeof ui.autoCompact !== "boolean") throw new Error("'autoCompact' deve ser verdadeiro ou falso");
    out.interface.autoCompact = ui.autoCompact;
  }
  return out;
}

function publish(): Settings {
  const snapshot = getSettings();
  for (const fn of listeners) fn(snapshot);
  return snapshot;
}

export function setSettings(patch: SettingsPatch): Settings {
  current = applyPatch(current, patch);
  return publish();
}

export function resetSettings(): Settings {
  current = clone(DEFAULT_SETTINGS);
  return publish();
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Última câmera do 3D: guardada quando a vista é desmontada, para o Render poder copiá-la mesmo com a aba 3D fechada.
export interface SavedCamera {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fovDeg: number;
}

let last: SavedCamera | null = null;
export const setLastCamera = (c: SavedCamera | null): void => {
  last = c;
};
export const lastCamera = (): SavedCamera | null => last;

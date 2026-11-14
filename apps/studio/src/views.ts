// SPDX-License-Identifier: GPL-3.0-or-later
// Vistas padrão do 3D, com as teclas do FreeCAD. Eixo Z para cima; "frente" olha de -Y para +Y. Usadas pelo atalho de
// teclado, pelo menu do cubo e pela aba Vista do ribbon.
export const VIEWS = {
  "1": { name: "Frente", dir: [0, -1, 0] },
  "2": { name: "Topo", dir: [0, 0, 1] },
  "3": { name: "Direita", dir: [1, 0, 0] },
  "4": { name: "Trás", dir: [0, 1, 0] },
  "5": { name: "Base", dir: [0, 0, -1] },
  "6": { name: "Esquerda", dir: [-1, 0, 0] },
  "0": { name: "Isométrica", dir: [1, -1, 1] },
} as const satisfies Record<string, { name: string; dir: [number, number, number] }>;

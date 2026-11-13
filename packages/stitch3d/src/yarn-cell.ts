// SPDX-License-Identifier: GPL-3.0-or-later
// Célula periódica do ponto baixo (etapa H do criador de pontos): o fio de UM pb no espaço do modelo, derivado à mão
// da topologia real (alça deitada A vinda do ponto anterior, alça B puxada pela base, alça final C que vira o A do
// ponto seguinte). A cadeia é periódica: o último nó é o primeiro mais (1, 0, 0). Puro.
import type { V3 } from "./models.ts";

/** Pontos de controle do fio de um pb, na ordem do fio (x ao longo da carreira, y da base ao topo, z para fora). */
export function scCellPath(): V3[] {
  return [
    // entrada E e descida por trás
    [-0.5, -0.5, -0.3],
    [-0.36, -0.95, -0.32],
    // perna 1: sob os trilhos da base, de trás para a frente
    [-0.32, -1.22, -0.2],
    [-0.32, -1.27, 0],
    [-0.32, -1.22, 0.2],
    // perna 1: sobe pela frente
    [-0.28, -0.95, 0.34],
    [-0.1, -0.5, 0.34],
    [0.06, -0.24, 0.26],
    // topo de B: U deitado, ponta para trás
    [0.1, -0.17, 0.05],
    [0.13, -0.16, -0.16],
    [0.25, -0.16, -0.26],
    [0.37, -0.16, -0.16],
    [0.4, -0.17, 0.05],
    // perna 2: desce pela frente
    [0.42, -0.26, 0.26],
    [0.16, -0.55, 0.36],
    [-0.12, -0.95, 0.34],
    // perna 2: sob os trilhos, da frente para trás
    [-0.18, -1.22, 0.2],
    [-0.18, -1.27, 0],
    [-0.18, -1.22, -0.2],
    // C sobe por trás e entra por baixo de B
    [-0.1, -0.95, -0.34],
    [0.1, -0.55, -0.34],
    [0.22, -0.36, -0.1],
    // C atravessa B e A, de baixo para cima
    [0.22, -0.17, 0.03],
    [0.23, 0, 0.05],
    [0.27, 0.14, 0.08],
    // C: trilho da frente
    [0.45, 0.14, 0.12],
    [0.62, 0.02, 0.16],
    [1, 0, 0.16],
    [1.32, 0, 0.15],
    // C: ponta e trilho de trás
    [1.44, 0, 0],
    [1.32, 0, -0.15],
    [1, 0, -0.16],
    [0.62, 0.02, -0.16],
    [0.45, 0.14, -0.12],
    // C desce por A e B
    [0.29, 0.14, -0.08],
    [0.28, 0, -0.06],
    [0.28, -0.17, -0.1],
    [0.3, -0.36, -0.16],
    // saída X
    [0.4, -0.45, -0.3],
    [0.5, -0.5, -0.3],
  ];
}

const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Comprimento total de uma polilinha. */
export function pathLength(pts: V3[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1] as V3, pts[i] as V3);
  return l;
}

/**
 * Reamostra a polilinha em `m` segmentos de mesmo comprimento (m + 1 nós): curva Catmull-Rom (8 subdivisões por trecho)
 * reparametrizada por comprimento; o primeiro e o último nós ficam nos extremos originais. Com `period` (cadeia
 * periódica: último = primeiro + period) as tangentes nas pontas usam os vizinhos periódicos, sem quina na junção.
 */
export function resample(pts: V3[], m: number, period?: V3): V3[] {
  const n = pts.length;
  if (n < 2 || m < 1) return pts.slice();
  const at = (i: number): V3 => {
    if (period && i < 0) {
      const p = pts[n - 2 + i + 1] as V3;
      return [p[0] - period[0], p[1] - period[1], p[2] - period[2]];
    }
    if (period && i > n - 1) {
      const p = pts[i - n + 1] as V3;
      return [p[0] + period[0], p[1] + period[1], p[2] + period[2]];
    }
    return pts[Math.max(0, Math.min(n - 1, i))] as V3;
  };
  const dense: V3[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < 8; k++) {
      const t = k / 8;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      dense.push([
        c(p0[0], p1[0], p2[0], p3[0]),
        c(p0[1], p1[1], p2[1], p3[1]),
        c(p0[2], p1[2], p2[2], p3[2]),
      ]);
    }
  }
  dense.push(pts[n - 1] as V3);
  const total = pathLength(dense);
  const out: V3[] = [dense[0] as V3];
  let acc = 0;
  let j = 1;
  for (let s = 1; s < m; s++) {
    const target = (total * s) / m;
    while (j < dense.length - 1 && acc + dist(dense[j - 1] as V3, dense[j] as V3) < target) {
      acc += dist(dense[j - 1] as V3, dense[j] as V3);
      j++;
    }
    const a = dense[j - 1] as V3;
    const b = dense[j] as V3;
    const seg = dist(a, b) || 1;
    const u = Math.max(0, Math.min(1, (target - acc) / seg));
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
  }
  out.push(dense[dense.length - 1] as V3);
  return out;
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Deformação por curva (R3): o ponto acompanha a curva do fio entre a entrada E e a saída X (Hermite com as tangentes
// do fio), em vez de só esticar linearmente, e o tubo é extrudado de novo com o raio do fio constante (a matriz
// linear deformaria a espessura junto com o cisalhamento). Usado no render; a vista de edição continua linear.
import type { FrameSet } from "./frames.ts";
import {
  centerlines,
  extrude,
  type MeshData,
  type ModelOptions,
  type ModelSpec,
  RHO_BANDS,
  SIDES,
  type TopShape,
  type V3,
} from "./models.ts";

const at = (a: Float32Array, i: number): V3 => [
  a[i * 3] as number,
  a[i * 3 + 1] as number,
  a[i * 3 + 2] as number,
];

/** Eixo do ponto `i` em t ∈ [0, 1]: nas junções vale a média com o vizinho, então o tubo é contínuo entre pontos. */
function axisAt(arr: Float32Array, f: FrameSet, i: number, t: number): V3 {
  const mine = at(arr, i);
  const j = t < 0.5 ? (f.prev[i] as number) : (f.next[i] as number);
  if (j < 0) return mine;
  const other = at(arr, j);
  const edge: V3 = [(mine[0] + other[0]) / 2, (mine[1] + other[1]) / 2, (mine[2] + other[2]) / 2];
  const w = Math.abs(t - 0.5) * 2; // 0 no centro, 1 na junção
  return [
    mine[0] + (edge[0] - mine[0]) * w,
    mine[1] + (edge[1] - mine[1]) * w,
    mine[2] + (edge[2] - mine[2]) * w,
  ];
}

/**
 * Ponto do modelo (x ∈ [-0,5; 0,5] da entrada à saída, y ∈ [-1; 0] da base ao topo, z para fora) no mundo, para o
 * ponto `i`: a posição sobre a curva Hermite E→X (com as tangentes do fio, então ela se curva de verdade) mais os
 * deslocamentos nos eixos ey e ez, interpolados com os dos vizinhos. Em x = ±0,5 e y = z = 0 cai exatamente em E e X
 * (o fio é contínuo) e a tangente de saída de i é a de entrada de i+1.
 */
export function deformPoint(f: FrameSet, i: number, p: V3): V3 {
  const E = at(f.E, i);
  const X = at(f.X, i);
  const tE = at(f.tE, i);
  const tX = at(f.tX, i);
  const t = Math.max(0, Math.min(1, p[0] + 0.5));
  const chord = Math.hypot(X[0] - E[0], X[1] - E[1], X[2] - E[2]);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const ey = axisAt(f.ey, f, i, t);
  const ez = axisAt(f.ez, f, i, t);
  const out: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      h00 * (E[k] as number) +
      h10 * chord * (tE[k] as number) +
      h01 * (X[k] as number) +
      h11 * chord * (tX[k] as number) +
      p[1] * (ey[k] as number) +
      p[2] * (ez[k] as number);
  }
  return out;
}

/** Tamanho típico do ponto `i` (média dos comprimentos dos eixos ex e ey): escala o raio do fio. */
export function frameScale(f: FrameSet, i: number): number {
  return lengthOf(f, i);
}

function lengthOf(f: FrameSet, i: number): number {
  const ex = at(f.ex, i);
  const ey = at(f.ey, i);
  return (Math.hypot(ex[0], ex[1], ex[2]) + Math.hypot(ey[0], ey[1], ey[2])) / 2;
}

/**
 * Como deformPoint, mas aceita x fora de [-0,5; 0,5]: o trecho que passa da saída X cai no ponto seguinte (x - 1) e o que
 * passa da entrada E, no anterior (x + 1). Sem vizinho, usa o próprio ponto (t fica preso nas pontas).
 */
export function deformPointWide(f: FrameSet, i: number, p: V3): V3 {
  let k = i;
  let x = p[0];
  // anda de ponto em ponto enquanto houver vizinho (o fio relaxado pode passar mais de um ponto à frente)
  while (x > 0.5) {
    const j = f.next[k] as number;
    if (j < 0) break;
    k = j;
    x -= 1;
  }
  while (x < -0.5) {
    const j = f.prev[k] as number;
    if (j < 0) break;
    k = j;
    x += 1;
  }
  return deformPoint(f, k, [x, p[1], p[2]]);
}

/**
 * Malha do ponto `i` deformada pela curva e extrudada com raio constante `radius` (em unidades do mundo; por padrão a
 * faixa de raio da variante vezes o tamanho do ponto). Os lados e as tampas vêm da qualidade da variante. O espelho da
 * variante vale: o modelo é espelhado em z antes de deformar.
 */
export function deformToCurve(
  spec: ModelSpec,
  f: FrameSet,
  i: number,
  radius?: number,
  shape?: TopShape,
  opts?: ModelOptions,
): MeshData {
  const zs = spec.mirror ? -1 : 1;
  // o espelho inverte z no modelo; a inclinação medida no mundo (ez) precisa inverter junto (o abaulamento, não)
  const shaped = shape && spec.mirror ? { ...shape, leanZ: -shape.leanZ } : shape;
  const cell = spec.type === "SC" && spec.legs <= 1 && spec.quality >= 1 ? opts?.cell : undefined;
  const lines = cell
    ? [
        {
          pts: cell.map((p) => deformPointWide(f, i, [p[0], p[1], p[2] * zs])),
          closed: false,
        },
      ]
    : centerlines(spec, shaped, opts).map((l) => ({
        ...l,
        pts: l.pts.map((p) => deformPoint(f, i, [p[0], p[1], p[2] * zs])),
      }));
  const r = radius ?? (RHO_BANDS[spec.band] ?? 0.16) * lengthOf(f, i);
  // referência da seção no MUNDO: a normal (ez) do ponto, ou o eixo ey no anel (plano do ponto); a extrusão cai na
  // referência padrão quando ela fica paralela à tangente
  const ref = spec.type === "RING" ? at(f.ey, i) : at(f.ez, i);
  const withUp = lines.map((l) => ({ ...l, up: ref }));
  // o espelho já foi aplicado aos pontos; a extrusão final não inverte de novo
  return extrude(withUp, r, SIDES[spec.quality] ?? 4, false, spec.quality > 0);
}

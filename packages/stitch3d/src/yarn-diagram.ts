// SPDX-License-Identifier: GPL-3.0-or-later
// Diagrama de nós da célula do ponto (semente do diagrama do criador de pontos): projeção frontal (x, y) de 3×3 cópias
// da célula periódica, com o trecho de fio que passa POR BAIXO quebrado no cruzamento. Serve para conferir a topologia
// do traçado antes de simular. Puro: devolve uma string SVG.
import type { V3 } from "./models.ts";
import { resample } from "./yarn-cell.ts";

interface Seg {
  a: V3;
  b: V3;
  copy: number;
  /** Intervalos [t0, t1] (0 a 1) em que este segmento passa por baixo de outro. */
  gaps: [number, number][];
}

/** Intersecção de dois segmentos no plano xy: parâmetros (t sobre ab, u sobre cd) ou null. */
function cross2(a: V3, b: V3, c: V3, d: V3): [number, number] | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = (r[0] as number) * (s[1] as number) - (r[1] as number) * (s[0] as number);
  if (Math.abs(den) < 1e-12) return null;
  const qp = [c[0] - a[0], c[1] - a[1]];
  const t = ((qp[0] as number) * (s[1] as number) - (qp[1] as number) * (s[0] as number)) / den;
  const u = ((qp[0] as number) * (r[1] as number) - (qp[1] as number) * (r[0] as number)) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? [t, u] : null;
}

/**
 * SVG do diagrama de nós: `path` é a polilinha de UM ponto (periódica em x com período 1), `rho` o raio do fio. Desenha
 * 3×3 cópias (a do meio mais forte); onde dois trechos se cruzam em xy, o de menor z é interrompido (passa por baixo).
 */
export function cellDiagramSvg(path: V3[], rho: number, segments = 96): string {
  const pts = resample(path, segments);
  const segs: Seg[] = [];
  const shifts: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) shifts.push([dx, dy]);
  shifts.forEach(([dx, dy], copy) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i] as V3;
      const q = pts[i + 1] as V3;
      segs.push({
        a: [p[0] + (dx as number), p[1] + (dy as number), p[2]],
        b: [q[0] + (dx as number), q[1] + (dy as number), q[2]],
        copy,
        gaps: [],
      });
    }
  });
  const gapT = Math.max(0.02, (2 * rho) / Math.max(1e-6, 1 / segments) / 400);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i] as Seg;
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const o = segs[j] as Seg;
      // vizinhos imediatos da mesma cópia compartilham um nó: não são cruzamentos
      if (o.copy === s.copy && Math.abs(i - j) <= 1) continue;
      const hit = cross2(s.a, s.b, o.a, o.b);
      if (!hit) continue;
      const [t, u] = hit;
      const zs = s.a[2] + (s.b[2] - s.a[2]) * t;
      const zo = o.a[2] + (o.b[2] - o.a[2]) * u;
      if (zs < zo) s.gaps.push([Math.max(0, t - gapT), Math.min(1, t + gapT)]);
    }
  }
  // janela: x de -1 a 2, y de -1,8 a 0,6 (a célula central e o que a toca), com y para cima
  const X0 = -1;
  const Y0 = -1.8;
  const W = 3;
  const H = 2.4;
  const px = (x: number): number => (x - X0) * 100;
  const py = (y: number): number => (H - (y - Y0)) * 100;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 100} ${H * 100}" width="${W * 100}" height="${H * 100}">`,
    `<rect width="100%" height="100%" fill="#faf7ef"/>`,
  );
  const stroke = (s: Seg, t0: number, t1: number): string => {
    const x0 = s.a[0] + (s.b[0] - s.a[0]) * t0;
    const y0 = s.a[1] + (s.b[1] - s.a[1]) * t0;
    const x1 = s.a[0] + (s.b[0] - s.a[0]) * t1;
    const y1 = s.a[1] + (s.b[1] - s.a[1]) * t1;
    const main = s.copy === 4;
    const w = Math.max(3, 2 * rho * 100);
    const seg = (color: string, width: number) =>
      `<line x1="${px(x0).toFixed(1)}" y1="${py(y0).toFixed(1)}" x2="${px(x1).toFixed(1)}" y2="${py(y1).toFixed(1)}" stroke="${color}" stroke-width="${width.toFixed(1)}" stroke-linecap="butt"/>`;
    // halo na cor do fundo por baixo de cada traço: quem passa por cima "corta" quem passa por baixo
    return seg("#faf7ef", w + 6) + seg(main ? "#2d4a22" : "#9aae8c", w);
  };
  // por baixo primeiro (ordenado por z), depois por cima
  const order = segs
    .map((s, i) => i)
    .sort(
      (p, q) =>
        (segs[p] as Seg).a[2] + (segs[p] as Seg).b[2] - ((segs[q] as Seg).a[2] + (segs[q] as Seg).b[2]),
    );
  for (const i of order) {
    const s = segs[i] as Seg;
    const gaps = s.gaps.sort((p, q) => p[0] - q[0]);
    let t = 0;
    for (const [g0, g1] of gaps) {
      if (g0 > t) out.push(stroke(s, t, g0));
      t = Math.max(t, g1);
    }
    if (t < 1) out.push(stroke(s, t, 1));
  }
  out.push("</svg>");
  return out.join("\n");
}

/**
 * Código de cruzamentos da célula (invariante topológico): para cada cruzamento em xy do fio central com as 9 cópias,
 * em ordem ao longo do fio, "deslocamento:por cima|por baixo". Se o relaxamento não deixou fio atravessar fio, o código
 * antes e depois é o mesmo.
 */
export function crossingCode(path: V3[], segments = 96): string[] {
  const pts = resample(path, segments);
  const found: { key: number; code: string }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i] as V3;
        const b = pts[i + 1] as V3;
        for (let j = 0; j + 1 < pts.length; j++) {
          if (dx === 0 && dy === 0 && Math.min(Math.abs(i - j), segments - Math.abs(i - j)) <= 4) continue;
          if (dy === 0 && dx !== 0 && (dx === 1 ? segments - i + j : segments - j + i) <= 4) continue;
          const c = pts[j] as V3;
          const d = pts[j + 1] as V3;
          const co: V3 = [c[0] + dx, c[1] + dy, c[2]];
          const dd: V3 = [d[0] + dx, d[1] + dy, d[2]];
          const hit = cross2(a, b, co, dd);
          if (!hit) continue;
          const [t, u] = hit;
          const za = a[2] + (b[2] - a[2]) * t;
          const zb = co[2] + (dd[2] - co[2]) * u;
          found.push({ key: i + t, code: `${dx},${dy}:${za > zb ? "o" : "u"}` });
        }
      }
    }
  }
  return found.sort((p, q) => p.key - q.key).map((x) => x.code);
}

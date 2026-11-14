// SPDX-License-Identifier: GPL-3.0-or-later
// Primitivas SVG dos símbolos (padrão Craft Yarn Council, redesenhados em código; nenhum arquivo copiado).
// Port de referencia/graficos-python/chart.py. Unidades: mm; página A4 (viewBox 0 0 210 297).

export const COLOR = {
  black: "#1a1a1a",
  grey: "#9a9a9a",
  link: "#8c8c8c",
  adapt: "#c2185b",
  alt: ["#1b4f8a", "#b4521a"],
  start: "#1e8449",
  end: "#d32f2f",
  endLine: "#6d1111",
};
export const FONT = "DejaVu Sans, Arial, sans-serif";

export type P = [number, number];

export const esc = (t: string): string =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class Svg {
  private out: string[] = [];
  add(s: string): void {
    this.out.push(s);
  }
  line(p: P, q: P, col: string, w = 0.45): void {
    this.add(
      `<line x1="${p[0].toFixed(2)}" y1="${p[1].toFixed(2)}" x2="${q[0].toFixed(2)}" y2="${q[1].toFixed(2)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`,
    );
  }
  text(
    x: number,
    y: number,
    t: string,
    size = 3,
    col: string = COLOR.black,
    anchor = "start",
    bold = false,
    italic = false,
  ): void {
    this.add(
      `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${FONT}" font-size="${size}" fill="${col}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ""}${italic ? ' font-style="italic"' : ""}>${esc(t)}</text>`,
    );
  }
  circle(c: P, r: number, attrs: string): void {
    this.add(`<circle cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="${r}" ${attrs}/>`);
  }
  toString(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">\n<rect width="210" height="297" fill="white"/>\n${this.out.join("\n")}\n</svg>\n`;
  }
}

/** Ponto no anel e vetores (para fora; tangente no sentido do trabalho). */
export function frame(c: P, r: number, a: number): { o: P; u: P; t: P } {
  const u: P = [Math.cos(a), -Math.sin(a)];
  const t: P = [-Math.sin(a), -Math.cos(a)];
  return { o: [c[0] + r * u[0], c[1] + r * u[1]], u, t };
}
const loc = (o: P, u: P, t: P, x: number, y: number): P => [
  o[0] + x * t[0] + y * u[0],
  o[1] + x * t[1] + y * u[1],
];

export function symPb(s: Svg, o: P, u: P, t: P, col: string, k = 1): void {
  const h = 2.1 * k;
  s.line(loc(o, u, t, -h * 0.8, -h), loc(o, u, t, h * 0.8, h), col);
  s.line(loc(o, u, t, h * 0.8, -h), loc(o, u, t, -h * 0.8, h), col);
}
export function symMpa(s: Svg, o: P, u: P, t: P, col: string): void {
  s.line(loc(o, u, t, 0, -3), loc(o, u, t, 0, 3), col);
  s.line(loc(o, u, t, -1.7, 3), loc(o, u, t, 1.7, 3), col);
}
/** Ponto alto (1 traço) e ponto alto duplo (2 traços) sobre o "T". */
export function symTall(s: Svg, o: P, u: P, t: P, col: string, bars: number): void {
  symMpa(s, o, u, t, col);
  for (let i = 0; i < bars; i++)
    s.line(loc(o, u, t, -1, -0.6 + i * 1.3), loc(o, u, t, 1, 0.2 + i * 1.3), col, 0.35);
}
export function symCh(s: Svg, o: P, t: P, col: string): void {
  const ang = (Math.atan2(t[1], t[0]) * 180) / Math.PI;
  s.add(
    `<ellipse cx="${o[0].toFixed(2)}" cy="${o[1].toFixed(2)}" rx="2.3" ry="0.75" fill="none" stroke="${col}" stroke-width="0.42" transform="rotate(${ang.toFixed(1)} ${o[0].toFixed(2)} ${o[1].toFixed(2)})"/>`,
  );
}
export function symPbx(s: Svg, o: P, col: string): void {
  s.circle(o, 0.95, `fill="${col}"`);
}
/** Diminuição: pernas dos pontos de base que se unem no topo, com traço em cada perna. */
export function symTog(s: Svg, apex: P, bases: P[], col: string): void {
  for (const b of bases) {
    s.line(b, apex, col);
    const d: P = [apex[0] - b[0], apex[1] - b[1]];
    const len = Math.hypot(d[0], d[1]);
    const m: P = [b[0] + d[0] * 0.27, b[1] + d[1] * 0.27];
    const nrm: P = [(-d[1] / len) * 1.05, (d[0] / len) * 1.05];
    s.line([m[0] - nrm[0], m[1] - nrm[1]], [m[0] + nrm[0], m[1] + nrm[1]], col);
  }
}
/** Aumento: pernas que saem do mesmo ponto de base, com traço em cada perna. */
export function symInc(s: Svg, base: P, tips: P[], col: string): void {
  for (const tp of tips) {
    s.line(base, tp, col);
    const d: P = [tp[0] - base[0], tp[1] - base[1]];
    const len = Math.hypot(d[0], d[1]);
    const m: P = [base[0] + d[0] * 0.62, base[1] + d[1] * 0.62];
    const nrm: P = [(-d[1] / len) * 1.25, (d[0] / len) * 1.25];
    s.line([m[0] - nrm[0], m[1] - nrm[1]], [m[0] + nrm[0], m[1] + nrm[1]], col);
  }
}
export function symAm(s: Svg, c: P, col: string): void {
  s.circle(c, 3.3, `fill="none" stroke="${col}" stroke-width="0.45"`);
  s.add(
    `<path d="M ${(c[0] + 3.3).toFixed(2)} ${c[1].toFixed(2)} q 1.6 1.2 0.6 3.0" fill="none" stroke="${col}" stroke-width="0.45" stroke-linecap="round"/>`,
  );
}

export function pill(s: Svg, p: P, txt: string, col: string, size = 2.7): number {
  const w = Math.max(4.5, 1.75 * txt.length + 2.6);
  s.add(
    `<rect x="${(p[0] - w / 2).toFixed(2)}" y="${(p[1] - 2.25).toFixed(2)}" width="${w.toFixed(2)}" height="4.5" rx="2.25" fill="${col}"/>`,
  );
  s.text(p[0], p[1] + 0.95, txt, size, "white", "middle", true);
  return w;
}

/** Rótulo da volta: (total) à esquerda = fim da volta; etiqueta colorida = início da volta. */
export function drawLabel(s: Svg, c: P, r: number, a: number, num: string, cnt: string, col: string): void {
  const { o, u, t } = frame(c, r, a);
  const w = Math.max(4.5, 1.75 * num.length + 2.6);
  const cw = cnt !== "" ? 1.3 * (cnt.length + 2) + 1.2 : 0;
  const x0 = -(w + cw) / 2;
  if (cnt !== "") {
    const q = loc(o, u, t, x0 + cw / 2 - 0.6, 0);
    s.text(q[0], q[1] + 0.8, `(${cnt})`, 2.3, col, "middle");
  }
  pill(s, loc(o, u, t, x0 + cw + w / 2, 0), num, col);
}

export function plainRing(s: Svg, c: P, r: number, a: number, txt: string, dot?: string): void {
  s.circle(c, r, `fill="none" stroke="${COLOR.link}" stroke-width="0.3" stroke-dasharray="1.2 0.9"`);
  const { o } = frame(c, r, a);
  const w = 1.28 * txt.length + 2.6 + (dot ? 3 : 0);
  s.add(
    `<rect x="${(o[0] - w / 2).toFixed(2)}" y="${(o[1] - 1.75).toFixed(2)}" width="${w.toFixed(2)}" height="3.5" rx="1.75" fill="white" stroke="${COLOR.link}" stroke-width="0.3"/>`,
  );
  if (dot) s.circle([o[0] - w / 2 + 2, o[1]], 1.15, `fill="${dot}" stroke="#555555" stroke-width="0.25"`);
  s.text(o[0] + (dot ? 1.5 : 0), o[1] + 0.8, txt, 2.15, "#555555", "middle");
}

/** Cartão de fio (docs/10 seção 2.8): amostra da cor, "Fio X" e o nome. x = borda esquerda, y = topo; 47 x 7,4 mm. */
export function yarnCard(s: Svg, x: number, y: number, id: string, name: string, color: string): void {
  s.add(
    `<rect x="${x}" y="${y}" width="47" height="7.4" rx="1.6" fill="white" stroke="#b5b5b5" stroke-width="0.3"/>`,
  );
  s.circle([x + 4.4, y + 3.7], 2.5, `fill="${color}" stroke="#8a8a8a" stroke-width="0.3"`);
  s.text(x + 8.6, y + 3.1, `Fio ${id}`, 2.6, COLOR.black, "start", true);
  s.text(x + 8.6, y + 6.1, name, 2.3, "#555555");
}

export function startMark(s: Svg, p: P, toward: P): void {
  const L = Math.hypot(toward[0], toward[1]);
  const tx = toward[0] / L;
  const ty = toward[1] / L;
  const px = -ty;
  const py = tx;
  const pts: P[] = [
    [p[0] + 1.8 * tx, p[1] + 1.8 * ty],
    [p[0] - 1.4 * tx + 1.7 * px, p[1] - 1.4 * ty + 1.7 * py],
    [p[0] - 1.4 * tx - 1.7 * px, p[1] - 1.4 * ty - 1.7 * py],
  ];
  s.add(
    `<polygon points="${pts.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ")}" fill="${COLOR.start}"/>`,
  );
}
export function endMark(s: Svg, p: P): void {
  s.add(
    `<rect x="${(p[0] - 1.6).toFixed(2)}" y="${(p[1] - 1.6).toFixed(2)}" width="3.2" height="3.2" fill="${COLOR.end}" stroke="${COLOR.endLine}" stroke-width="0.25"/>`,
  );
}

export function arrow(s: Svg, c: P, r: number, a0: number, a1: number, col: string): void {
  const pts: P[] = [];
  for (let i = 0; i <= 30; i++) pts.push(frame(c, r, a0 + ((a1 - a0) * i) / 30).o);
  s.add(
    `<path d="M ${pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ")}" fill="none" stroke="${col}" stroke-width="0.6"/>`,
  );
  const { o, u, t } = frame(c, r, a1);
  const h: P[] = [loc(o, u, t, 0.8, 0), loc(o, u, t, -2.4, 1.4), loc(o, u, t, -2.4, -1.4)];
  s.add(
    `<polygon points="${h.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ")}" fill="${col}"/>`,
  );
}

export { loc };

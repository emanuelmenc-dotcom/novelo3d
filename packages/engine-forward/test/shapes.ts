// SPDX-License-Identifier: GPL-3.0-or-later
// Formas de teste para a malha livre (P5d): esfera, banana, superfície implícita (corpo com braços) e STL em texto e binário.
// Usadas pelos testes do motor e pelo e2e da peça vinda de STL.
import type { Mesh } from "../src/index.ts";

export type P = [number, number, number];

/** Superfície fechada por anéis: `ring(t, θ)` com t de 0 a 1 (os polos t=0 e t=1 viram um vértice só). */
export function tubeMesh(ring: (t: number, th: number) => P, rings: number, seg: number): Mesh {
  const vertices: number[] = [];
  const faces: number[] = [];
  const add = (p: P) => {
    vertices.push(...p);
    return vertices.length / 3 - 1;
  };
  const bottom = add(ring(0, 0));
  const ids: number[][] = [];
  for (let i = 1; i < rings; i++) {
    const row: number[] = [];
    for (let j = 0; j < seg; j++) row.push(add(ring(i / rings, (2 * Math.PI * j) / seg)));
    ids.push(row);
  }
  const top = add(ring(1, 0));
  const first = ids[0] as number[];
  const last = ids[ids.length - 1] as number[];
  for (let j = 0; j < seg; j++) {
    faces.push(bottom, first[(j + 1) % seg] as number, first[j] as number);
    faces.push(top, last[j] as number, last[(j + 1) % seg] as number);
  }
  for (let i = 0; i + 1 < ids.length; i++) {
    const a = ids[i] as number[];
    const b = ids[i + 1] as number[];
    for (let j = 0; j < seg; j++) {
      const k = (j + 1) % seg;
      faces.push(
        a[j] as number,
        a[k] as number,
        b[k] as number,
        a[j] as number,
        b[k] as number,
        b[j] as number,
      );
    }
  }
  return { vertices, faces };
}

export const sphere = (R: number) =>
  tubeMesh(
    (t, th) => {
      const phi = Math.PI * t;
      return [R * Math.sin(phi) * Math.cos(th), R * Math.sin(phi) * Math.sin(th), -R * Math.cos(phi)];
    },
    48,
    64,
  );

/** "Banana": tubo com pontas arredondadas sobre um arco de 70 graus, começando de pé e curvando para o lado. */
export const banana = () => {
  const Rc = 60;
  const F = (70 * Math.PI) / 180;
  const r0 = 12;
  return tubeMesh(
    (t, th) => {
      const a = F * t;
      const c: P = [Rc * (1 - Math.cos(a)), 0, Rc * Math.sin(a)];
      const T: P = [Math.sin(a), 0, Math.cos(a)];
      const N: P = [T[2], 0, -T[0]]; // perpendicular ao arco, no plano xz
      const rho = r0 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
      return [
        c[0] + rho * (Math.cos(th) * N[0]),
        c[1] + rho * Math.sin(th),
        c[2] + rho * (Math.cos(th) * N[2]),
      ];
    },
    80,
    48,
  );
};

export const toStl = (m: Mesh): string => {
  const v = (i: number) => `vertex ${m.vertices[i * 3]} ${m.vertices[i * 3 + 1]} ${m.vertices[i * 3 + 2]}`;
  const out = ["solid t"];
  for (let f = 0; f < m.faces.length; f += 3)
    out.push(
      "facet normal 0 0 0",
      "outer loop",
      v(m.faces[f] as number),
      v(m.faces[f + 1] as number),
      v(m.faces[f + 2] as number),
      "endloop",
      "endfacet",
    );
  out.push("endsolid t");
  return out.join("\n");
};

export const toBinary = (m: Mesh): Uint8Array => {
  const n = m.faces.length / 3;
  const b = new Uint8Array(84 + n * 50);
  const dv = new DataView(b.buffer);
  dv.setUint32(80, n, true);
  for (let f = 0; f < n; f++)
    for (let k = 0; k < 3; k++)
      for (let c = 0; c < 3; c++)
        dv.setFloat32(
          84 + f * 50 + 12 + k * 12 + c * 4,
          m.vertices[(m.faces[f * 3 + k] as number) * 3 + c] as number,
          true,
        );
  return b;
};

/**
 * Malha fechada de uma superfície implícita (`f < 0` é dentro), por tetraedros numa grade: os vértices ficam nas arestas
 * da grade, então triângulos vizinhos dividem os mesmos vértices e a superfície sai fechada.
 */
export function implicitMesh(f: (p: P) => number, lo: P, hi: P, step: number): Mesh {
  const nx = Math.ceil((hi[0] - lo[0]) / step);
  const ny = Math.ceil((hi[1] - lo[1]) / step);
  const nz = Math.ceil((hi[2] - lo[2]) / step);
  const gid = (i: number, j: number, k: number) => (i * (ny + 1) + j) * (nz + 1) + k;
  const pos = (g: number): P => {
    const k = g % (nz + 1);
    const j = Math.floor(g / (nz + 1)) % (ny + 1);
    const i = Math.floor(g / ((nz + 1) * (ny + 1)));
    return [lo[0] + i * step, lo[1] + j * step, lo[2] + k * step];
  };
  const val = new Map<number, number>();
  const F = (g: number) => {
    let v = val.get(g);
    if (v === undefined) {
      v = f(pos(g));
      if (v === 0) v = 1e-9;
      val.set(g, v);
    }
    return v;
  };
  const vertices: number[] = [];
  const faces: number[] = [];
  const onEdge = new Map<string, number>();
  const vert = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let id = onEdge.get(key);
    if (id === undefined) {
      const fa = F(a);
      const fb = F(b);
      const t = fa / (fa - fb);
      const p = pos(a);
      const q = pos(b);
      vertices.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
      id = vertices.length / 3 - 1;
      onEdge.set(key, id);
    }
    return id;
  };
  // seis tetraedros por cubo, todos pela diagonal 0-6
  const TETS = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nz; k++) {
        const c = [
          gid(i, j, k),
          gid(i + 1, j, k),
          gid(i + 1, j + 1, k),
          gid(i, j + 1, k),
          gid(i, j, k + 1),
          gid(i + 1, j, k + 1),
          gid(i + 1, j + 1, k + 1),
          gid(i, j + 1, k + 1),
        ];
        for (const t of TETS) {
          const g = t.map((x) => c[x] as number);
          const inside = g.filter((x) => F(x) < 0);
          const out = g.filter((x) => F(x) >= 0);
          if (inside.length === 0 || out.length === 0) continue;
          if (inside.length === 1 || inside.length === 3) {
            const [s, o3] = inside.length === 1 ? [inside[0] as number, out] : [out[0] as number, inside];
            const tri = o3.map((x) => vert(s, x));
            faces.push(tri[0] as number, tri[1] as number, tri[2] as number);
          } else {
            const [a, b] = inside as [number, number];
            const [cc, d] = out as [number, number];
            const q = [vert(a, cc), vert(a, d), vert(b, d), vert(b, cc)];
            faces.push(
              q[0] as number,
              q[1] as number,
              q[2] as number,
              q[0] as number,
              q[2] as number,
              q[3] as number,
            );
          }
        }
      }
  return { vertices, faces };
}

export const len = (a: P) => Math.hypot(a[0], a[1], a[2]);
/** Distância até um segmento (cápsula de raio `r`). */
export const capsule = (p: P, a: P, b: P, r: number) => {
  const ab: P = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap: P = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(
    0,
    Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)),
  );
  return len([ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t]) - r;
};

/** Boneco: corpo esférico de raio 20 mm com dois braços (cápsulas de raio 6 mm) para os lados e um pouco para cima. */
export const figureWithArms = (): Mesh => {
  const body = (p: P) => len(p) - 20;
  const arms = (p: P) =>
    Math.min(capsule(p, [12, 0, 4], [38, 0, 14], 6), capsule(p, [-12, 0, 4], [-38, 0, 14], 6));
  return implicitMesh((p) => Math.min(body(p), arms(p)), [-48, -24, -24], [48, 24, 26], 2.2);
};

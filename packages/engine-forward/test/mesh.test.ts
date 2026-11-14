// SPDX-License-Identifier: GPL-3.0-or-later
// Malha livre -> receita, rota A (P5d): STL ASCII e binário, esfera perto do caso F2, peça orgânica curva sem ramificação,
// toro (ramifica) e malha aberta recusados com mensagem.
import { validate } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { fromMesh, type Mesh, parseStl } from "../src/index.ts";

type P = [number, number, number];

/** Superfície fechada por anéis: `ring(t, θ)` com t de 0 a 1 (os polos t=0 e t=1 viram um vértice só). */
function tubeMesh(ring: (t: number, th: number) => P, rings: number, seg: number): Mesh {
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

const sphere = (R: number) =>
  tubeMesh(
    (t, th) => {
      const phi = Math.PI * t;
      return [R * Math.sin(phi) * Math.cos(th), R * Math.sin(phi) * Math.sin(th), -R * Math.cos(phi)];
    },
    48,
    64,
  );

/** "Banana": tubo com pontas arredondadas sobre um arco de 70 graus, começando de pé e curvando para o lado. */
const banana = () => {
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

const toStl = (m: Mesh): string => {
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

const toBinary = (m: Mesh): Uint8Array => {
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

describe("STL", () => {
  test("ASCII e binário dão a mesma malha, com os vértices repetidos juntados", () => {
    const m = sphere(10);
    const a = parseStl(toStl(m));
    const b = parseStl(toBinary(m));
    expect(a.faces.length).toBe(m.faces.length);
    expect(a.vertices.length).toBe(m.vertices.length);
    expect(b.faces).toEqual(a.faces);
  });

  test("arquivo que não é STL é recusado", () => {
    expect(() => parseStl("olá")).toThrow(/STL/);
  });
});

describe("receita a partir da malha (rota A)", () => {
  test("esfera de raio 30: receita válida, começa em 6 e o total fica perto do caso F2 (452)", () => {
    const r = fromMesh(sphere(30), { w: 5, h: 5 });
    if (!r.ok) throw new Error(r.issues[0]?.message);
    expect(validate(r.value.pattern).ok).toBe(true);
    expect(r.value.counts[0]).toBe(6);
    const total = r.value.counts.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 452) / 452).toBeLessThan(0.1);
  });

  test("peça orgânica curva sem ramificação (banana) gera receita válida", () => {
    const r = fromMesh(parseStl(toStl(banana())), { w: 5, h: 5 });
    if (!r.ok) throw new Error(r.issues[0]?.message);
    expect(validate(r.value.pattern).ok).toBe(true);
    expect(r.value.counts.length).toBeGreaterThan(10);
  });

  test("toro ramifica: recusado com explicação", () => {
    const R = 30;
    const rr = 10;
    const vertices: number[] = [];
    const faces: number[] = [];
    const U = 48;
    const V = 24;
    for (let i = 0; i < U; i++)
      for (let j = 0; j < V; j++) {
        const u = (2 * Math.PI * i) / U;
        const v = (2 * Math.PI * j) / V;
        vertices.push(
          (R + rr * Math.cos(v)) * Math.cos(u),
          (R + rr * Math.cos(v)) * Math.sin(u),
          rr * Math.sin(v),
        );
      }
    const id = (i: number, j: number) => (i % U) * V + (j % V);
    for (let i = 0; i < U; i++)
      for (let j = 0; j < V; j++)
        faces.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
    const r = fromMesh({ vertices, faces }, { w: 5, h: 5 });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe("BRANCHES");
  });

  test("malha aberta é recusada", () => {
    const m = sphere(20);
    const open = { vertices: m.vertices, faces: m.faces.slice(3) };
    const r = fromMesh(open, { w: 5, h: 5 });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe("NOT_CLOSED");
  });
});

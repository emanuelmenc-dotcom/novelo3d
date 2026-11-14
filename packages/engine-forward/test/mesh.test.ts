// SPDX-License-Identifier: GPL-3.0-or-later
// Malha livre -> receita, rota A (P5d): STL ASCII e binário, esfera perto do caso F2, peça orgânica curva sem ramificação,
// toro (ramifica) e malha aberta recusados com mensagem.
import { type Pattern, validate } from "@novelo/core";
import { describe, expect, test } from "vitest";
import { fromMesh, parseStl } from "../src/index.ts";
import { banana, figureWithArms, sphere, toBinary, toStl } from "./shapes.ts";

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
  test("corpo com dois braços: três peças; os braços começam na ponta, ficam abertos e dizem onde costurar", () => {
    const mesh = figureWithArms();
    const r = fromMesh(mesh, { w: 5, h: 5 });
    if (!r.ok) throw new Error(r.issues[0]?.message);
    const ps = r.value.pieces;
    expect(ps.map((p) => p.name)).toEqual(["Corpo", "Parte 2", "Parte 3"]);
    expect(ps[0]?.open).toBe(false);
    for (const arm of ps.slice(1)) {
      expect(validate(arm.pattern).ok).toBe(true);
      expect(arm.open).toBe(true);
      expect(arm.counts[0]).toBeLessThanOrEqual(8); // anel mágico na ponta
      // tubo de raio 6: perto de 2π·6/5 ≈ 7,5 pontos
      expect(Math.max(...arm.counts)).toBeGreaterThanOrEqual(6);
      expect(Math.max(...arm.counts)).toBeLessThanOrEqual(12);
      expect(arm.attachTo?.piece).toBe(0);
      expect(arm.attachTo?.row).toBeGreaterThan(1);
    }
    expect(validate(ps[0]?.pattern as Pattern).ok).toBe(true);
    // os dois braços são iguais (espelhados): mesmas voltas, mais ou menos
    expect(Math.abs((ps[1]?.counts.length ?? 0) - (ps[2]?.counts.length ?? 0))).toBeLessThanOrEqual(1);
  }, 30_000);

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

  test("toro tem furo: recusado com explicação", () => {
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
    expect(r.issues[0]?.code).toBe("HOLE");
  });

  test("malha aberta é recusada", () => {
    const m = sphere(20);
    const open = { vertices: m.vertices, faces: m.faces.slice(3) };
    const r = fromMesh(open, { w: 5, h: 5 });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe("NOT_CLOSED");
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
// Máquina de estados e ajustes do render (R3b).
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { dispatch, renderSnapshot, setFeature } from "../src/index.ts";

// o render está pausado (D-57): estes testes ligam o recurso para o código continuar testado
beforeAll(() => setFeature("render", true));
afterAll(() => setFeature("render", false));
afterEach(() => dispatch("render.reset", {}));

test("estado inicial é idle com ajustes padrão", () => {
  const s = renderSnapshot();
  expect(s.state).toBe("idle");
  expect(s.settings.width).toBe(1280);
});

test("play → pausar → continuar → concluir", () => {
  const before = renderSnapshot().run;
  dispatch("render.start", {});
  expect(renderSnapshot().state).toBe("running");
  expect(renderSnapshot().run).toBe(before + 1);
  dispatch("render.pause", {});
  expect(renderSnapshot().state).toBe("paused");
  dispatch("render.resume", {});
  dispatch("render.progress", { done: 5, total: 10, phase: "modelos", ms: 10 });
  dispatch("render.complete", { ms: 20 });
  expect(renderSnapshot().state).toBe("done");
  expect(renderSnapshot().done).toBe(10);
});

test("transições inválidas são recusadas", () => {
  expect(() => dispatch("render.pause", {})).toThrow();
  expect(() => dispatch("render.resume", {})).toThrow();
  dispatch("render.start", {});
  expect(() => dispatch("render.start", {})).toThrow();
  dispatch("render.stop", {});
  expect(renderSnapshot().state).toBe("stopped");
  expect(() => dispatch("render.progress", { done: 1, total: 2, phase: "x", ms: 1 })).toThrow();
  const run = renderSnapshot().run;
  dispatch("render.start", {});
  expect(renderSnapshot().run).toBe(run + 1);
});

test("reset não reinicia o número da rodada", () => {
  dispatch("render.start", {});
  const run = renderSnapshot().run;
  dispatch("render.reset", {});
  expect(renderSnapshot().state).toBe("idle");
  dispatch("render.start", {});
  expect(renderSnapshot().run).toBe(run + 1);
});

test("fail e stale levam ao estado certo e permitem novo play", () => {
  dispatch("render.start", {});
  dispatch("render.fail", { message: "x" });
  expect(renderSnapshot().state).toBe("error");
  expect(renderSnapshot().error).toBe("x");
  dispatch("render.start", {});
  expect(renderSnapshot().error).toBeNull();
  dispatch("render.stale", {});
  expect(renderSnapshot().state).toBe("stale");
  dispatch("render.start", {});
  dispatch("render.pause", {});
  dispatch("render.stale", {});
  expect(renderSnapshot().state).toBe("stale");
});

test("progresso recusa NaN, infinito e negativos", () => {
  dispatch("render.start", {});
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    expect(() => dispatch("render.progress", { done: bad, total: 10, phase: "x", ms: 1 })).toThrow();
  }
  expect(renderSnapshot().done).toBe(0);
});

test("progresso nunca anda para trás", () => {
  dispatch("render.start", {});
  dispatch("render.progress", { done: 8, total: 10, phase: "modelos", ms: 1 });
  dispatch("render.progress", { done: 3, total: 10, phase: "modelos", ms: 2 });
  expect(renderSnapshot().done).toBe(8);
});

test("ajustes são validados", () => {
  dispatch("render.set", {
    width: 4096,
    height: 100,
    samples: 16,
    light: { azimuth: 90 },
    background: { c1: "#ABCDEF" },
  });
  const s = renderSnapshot().settings;
  expect(s.width).toBe(4096);
  expect(s.light.azimuth).toBe(90);
  expect(s.light.elevation).toBe(50);
  expect(s.background.c1).toBe("#abcdef");
  expect(() => dispatch("render.set", { width: 5000 })).toThrow();
  expect(() => dispatch("render.set", { quality: 3 })).toThrow();
  expect(() => dispatch("render.set", { background: { c1: "red" } })).toThrow();
  expect(() => dispatch("render.set", { background: { kind: "x" } })).toThrow();
});

test("salvar PNG conta pedidos até serem atendidos", () => {
  dispatch("render.savePng", {});
  dispatch("render.savePng", {});
  expect(renderSnapshot().pngRequests).toBe(2);
  dispatch("render.pngServed", {});
  expect(renderSnapshot().pngRequests).toBe(1);
});

test("alcance da seleção: ajustes validados e padrões", () => {
  const s = renderSnapshot().settings;
  expect(s.scope).toBe("all");
  expect(s.context).toBe(1);
  expect(s.relaxIterations).toBe(20);
  expect(s.fitSelection).toBe(true);
  dispatch("render.set", { scope: "selection", context: 2, relaxIterations: 0, fitSelection: false });
  const t = renderSnapshot().settings;
  expect([t.scope, t.context, t.relaxIterations, t.fitSelection]).toEqual(["selection", 2, 0, false]);
  expect(() => dispatch("render.set", { scope: "x" })).toThrow();
  expect(() => dispatch("render.set", { context: 3 })).toThrow();
  expect(() => dispatch("render.set", { relaxIterations: 101 })).toThrow();
  expect(() => dispatch("render.set", { fitSelection: "sim" })).toThrow();
});

test("render.info só vale rodando ou pausado, recusa NaN e é zerado no start", () => {
  const info = { scope: "selection", selected: 4, context: 6, drawn: 10, relax: null };
  expect(() => dispatch("render.info", info)).toThrow();
  dispatch("render.start", {});
  expect(() => dispatch("render.info", { ...info, drawn: Number.NaN })).toThrow();
  dispatch("render.info", info);
  expect(renderSnapshot().info?.drawn).toBe(10);
  dispatch("render.stop", {});
  dispatch("render.start", {});
  expect(renderSnapshot().info).toBeNull();
});

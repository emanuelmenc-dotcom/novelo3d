// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import { dispatch, getSettings, resetSettings, subscribeSettings } from "../src/index.ts";

afterEach(() => resetSettings());

test("padrão: cubo chanfrado, canto inferior esquerdo, 112 px", () => {
  expect(getSettings().interface.viewCube).toEqual({ position: "bottom-left", chamfered: true, size: 112 });
});

test("settings.set altera só o que foi pedido e devolve o resultado", () => {
  const r = dispatch("settings.set", { interface: { viewCube: { position: "top-left" } } }) as ReturnType<
    typeof getSettings
  >;
  expect(r.interface.viewCube).toEqual({ position: "top-left", chamfered: true, size: 112 });
  expect(dispatch("settings.get")).toEqual(r);
});

test("tamanho fora da faixa é limitado e valores inválidos dão erro claro", () => {
  const big = dispatch("settings.set", { interface: { viewCube: { size: 9999 } } }) as ReturnType<
    typeof getSettings
  >;
  expect(big.interface.viewCube.size).toBe(240);
  const small = dispatch("settings.set", { interface: { viewCube: { size: 1 } } }) as ReturnType<
    typeof getSettings
  >;
  expect(small.interface.viewCube.size).toBe(64);
  expect(() => dispatch("settings.set", { interface: { viewCube: { position: "centro" } } })).toThrow(
    /inválida/,
  );
  expect(() => dispatch("settings.set", { interface: { viewCube: { chamfered: "sim" } } })).toThrow(
    /verdadeiro/,
  );
  expect(getSettings().interface.viewCube.position).toBe("bottom-left"); // erro não altera nada
});

test("quem assina é avisado a cada mudança, inclusive pelo reset", () => {
  const seen: string[] = [];
  const off = subscribeSettings((s) => seen.push(s.interface.viewCube.position));
  dispatch("settings.set", { interface: { viewCube: { position: "top-right" } } });
  dispatch("settings.reset");
  off();
  dispatch("settings.set", { interface: { viewCube: { position: "top-left" } } });
  expect(seen).toEqual(["top-right", "bottom-left"]);
});

test("escala da interface, do texto, mínimo do 3D e modo compacto: padrões, limites e erros", () => {
  const ui = () => getSettings().interface;
  expect(ui()).toMatchObject({ scale: 90, textScale: 100, min3d: 320, autoCompact: true });

  dispatch("settings.set", { interface: { scale: 110, textScale: 120, min3d: 400, autoCompact: false } });
  expect(ui()).toMatchObject({ scale: 110, textScale: 120, min3d: 400, autoCompact: false });
  expect(ui().viewCube.size).toBe(112); // o resto não muda

  dispatch("settings.set", { interface: { scale: 500, textScale: 10, min3d: 9999 } });
  expect(ui()).toMatchObject({ scale: 150, textScale: 80, min3d: 700 });
  dispatch("settings.set", { interface: { scale: 1, min3d: 1 } });
  expect(ui()).toMatchObject({ scale: 70, min3d: 200 });

  expect(() => dispatch("settings.set", { interface: { scale: "grande" } })).toThrow(/número/);
  expect(() => dispatch("settings.set", { interface: { autoCompact: "sim" } })).toThrow(/verdadeiro/);
  expect(ui().scale).toBe(70); // erro não altera nada
});

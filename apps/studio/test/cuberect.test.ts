// SPDX-License-Identifier: GPL-3.0-or-later
// Retângulo do cubo de vistas: posição por canto, encolhe em 3D pequeno e some quando ficaria minúsculo.
import { expect, test } from "vitest";
import { CUBE_MARGIN, CUBE_MIN_VISIBLE, cubeRect, type ViewCubeOptions } from "../src/viewcube.ts";

const opts = (position: ViewCubeOptions["position"], size = 112): ViewCubeOptions => ({
  position,
  chamfered: true,
  size,
});

test("área grande: tamanho pedido, encostado no canto escolhido com margem", () => {
  expect(cubeRect(opts("bottom-right"), 800, 600)).toEqual({
    x: 800 - 112 - CUBE_MARGIN,
    y: 600 - 112 - CUBE_MARGIN,
    size: 112,
    visible: true,
  });
  expect(cubeRect(opts("top-left"), 800, 600)).toMatchObject({ x: CUBE_MARGIN, y: CUBE_MARGIN, size: 112 });
  expect(cubeRect(opts("top-right"), 800, 600)).toMatchObject({ x: 800 - 112 - CUBE_MARGIN, y: CUBE_MARGIN });
  expect(cubeRect(opts("bottom-left"), 800, 600)).toMatchObject({
    x: CUBE_MARGIN,
    y: 600 - 112 - CUBE_MARGIN,
  });
});

test("3D pequeno: o cubo encolhe para no máximo 45% do lado menor", () => {
  const r = cubeRect(opts("bottom-right", 200), 300, 200);
  expect(r.size).toBe(90);
  expect(r.visible).toBe(true);
  expect(r.x + r.size + CUBE_MARGIN).toBe(300); // continua dentro da área
});

test("3D minúsculo: o cubo some em vez de ficar impossível de clicar", () => {
  const r = cubeRect(opts("bottom-right"), 100, 100);
  expect(r.size).toBe(45);
  expect(r.size).toBeLessThan(CUBE_MIN_VISIBLE);
  expect(r.visible).toBe(false);
});

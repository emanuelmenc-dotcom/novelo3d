// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from "vitest";
import { minRingRadius } from "../src/index.ts";

test("minRingRadius cresce com o número de símbolos", () => {
  expect(minRingRadius(12)).toBeGreaterThan(minRingRadius(6));
});

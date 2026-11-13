// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from "vitest";
import { roundCount } from "../src/index.ts";

test("roundCount arredonda meio para cima", () => {
  expect(roundCount(2.5)).toBe(3);
  expect(roundCount(2.4)).toBe(2);
});

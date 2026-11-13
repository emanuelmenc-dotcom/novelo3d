// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from "vitest";
import { splitLines } from "../src/index.ts";

test("splitLines ignora linhas vazias", () => {
  const r = splitLines("ring\n\n sc5inc \r\n");
  expect(r.ok && r.value).toEqual(["ring", "sc5inc"]);
});
